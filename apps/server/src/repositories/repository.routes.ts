import { authenticate } from "../auth/auth.service.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  idSchema,
  repositoryCreateSchema,
  repositoryPatchSchema,
  repositorySnapshotSchema,
  repositoryApplySchema,
  repositoryRefreshSchema,
} from "@agentstack/contracts";
import { Database, type Context } from "../db/database.service.js";
import { AppError, parse, conflict } from "../shared/errors.js";
import { RepositoryCredentialVault } from "./credential-vault.service.js";
import {
  fetchRepository,
  type RepositoryFetch,
} from "./repository-provider.service.js";
import * as service from "./repositories.service.js";
export function registerRepositoryRoutes(
  app: FastifyInstance,
  database: Database,
  options: { encryptionKey?: string; fetch?: RepositoryFetch } = {},
) {
  const vault = new RepositoryCredentialVault(options.encryptionKey),
    refreshing = new Set<string>(),
    lastRefresh = new Map<string, number>();
  const param = (r: FastifyRequest, key: string) =>
    parse(idSchema, (r.params as Record<string, string>)[key]);
  const project = <T>(
    r: FastifyRequest,
    scope: "read" | "write",
    fn: (ctx: Context) => Promise<T>,
  ) => {
    if (!r.principal)
      throw new AppError(401, "unauthorized", "Authentication required.");
    return database.project(r.principal, param(r, "projectId"), scope, fn);
  };
  const base = "/api/v1/projects/:projectId/repositories";
  app.get(base, (r) => project(r, "read", service.listRepositories));
  app.get(base + "/bindings", (r) =>
    project(r, "read", (ctx) =>
      service.repositoryBindings(
        ctx,
        parse(idSchema, (r.query as Record<string, string>).objectId),
      ),
    ),
  );
  app.get(base + "/pipelines", (r) =>
    project(r, "read", service.repositoryPipelines),
  );
  app.post(base, async (r, reply) => {
    const input = parse(repositoryCreateSchema, r.body);
    const out = await project(r, "write", (ctx) =>
      service.createRepository(ctx, input, vault),
    );
    return reply.code(201).send(out);
  });
  app.get(base + "/:id", (r) =>
    project(r, "read", async (ctx) =>
      service.repositoryDto(await service.getRepository(ctx, param(r, "id"))),
    ),
  );
  app.patch(base + "/:id", (r) =>
    project(r, "write", (ctx) =>
      service.patchRepository(
        ctx,
        param(r, "id"),
        parse(repositoryPatchSchema, r.body),
        vault,
      ),
    ),
  );
  app.get(base + "/:id/snapshots", (r) =>
    project(r, "read", (ctx) => service.listSnapshots(ctx, param(r, "id"))),
  );
  app.get(base + "/:id/snapshots/:snapshotId", (r) =>
    project(r, "read", (ctx) =>
      service.getSnapshot(ctx, param(r, "id"), param(r, "snapshotId")),
    ),
  );
  app.post(
    base + "/:id/snapshots",
    {
      bodyLimit: 8 * 1024 * 1024,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (r, reply) => {
      const out = await project(r, "write", (ctx) =>
        service.stageSnapshot(
          ctx,
          param(r, "id"),
          parse(repositorySnapshotSchema, r.body),
          "reported",
        ),
      );
      return reply.code(201).send(out);
    },
  );
  app.post(base + "/:id/snapshots/:snapshotId/apply", (r) =>
    project(r, "write", (ctx) =>
      service.applySnapshot(
        ctx,
        param(r, "id"),
        param(r, "snapshotId"),
        parse(repositoryApplySchema, r.body),
      ),
    ),
  );
  app.post(
    base + "/:id/refresh",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (r, reply) => {
      const input = parse(repositoryRefreshSchema, r.body),
        id = param(r, "id");
      const row = await project(r, "write", (ctx) =>
        service.getRepository(ctx, id),
      );
      if (row.version !== input.expectedVersion || row.archived)
        throw conflict();
      if (refreshing.has(id) || (lastRefresh.get(id) ?? 0) > Date.now() - 15000)
        throw new AppError(
          429,
          "repository_refresh_cooldown",
          "A refresh is running or was recently requested. Retry after 15 seconds.",
        );
      refreshing.add(id);
      lastRefresh.set(id, Date.now());
      if (lastRefresh.size > 10000)
        for (const [key, time] of lastRefresh)
          if (time < Date.now() - 60000) lastRefresh.delete(key);
      try {
        const credential = row.credential_ciphertext
          ? vault.decrypt(row.credential_ciphertext, row.project_id, id)
          : undefined;
        const snapshot = await fetchRepository(
          service.repositoryDto(row),
          credential,
          options.fetch,
        );
        r.principal = await authenticate(database, r);
        const out = await project(r, "write", (ctx) =>
          service.stageSnapshot(ctx, id, snapshot, "provider"),
        );
        return reply.code(201).send(out);
      } finally {
        refreshing.delete(id);
      }
    },
  );
}
