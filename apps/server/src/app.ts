import {registerTaskRoutes} from './tasks/tasks.routes.js';
import {registerAccountRoutes,setSession} from './account/account.routes.js';
import {beginLogin} from './account/account.service.js';
import { registerRepositoryRoutes } from "./repositories/repository.routes.js";
import type { RepositoryFetch } from "./repositories/repository-provider.service.js";
import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit, { normalizeIP } from "@fastify/rate-limit";
import staticPlugin from "@fastify/static";
import { z } from "zod";
import { resolve } from "node:path";
import {
  Database,
  type Context,
  type Principal,
} from "./db/database.service.js";
import { AppError, forbidden, parse, missing } from "./shared/errors.js";
import {
  authenticate,
  createUser,
  acceptInvitation,
  publicUser,
} from "./auth/auth.service.js";
import { hashToken } from "./shared/crypto.util.js";
import { parseTrustedProxies } from "./shared/proxy.config.js";
import { updateUser, userAudit } from "./auth/user-audit.service.js";
import { CURRENT_SCHEMA_VERSION } from "./db/migrate.js";
import {
  idSchema,
  loginSchema,
  userDraftSchema,
  projectDraftSchema,
  tokenDraftSchema,
  objectDraftSchema,
  objectPatchSchema,
  restoreSchema,
  listQuerySchema,
  objectListQuerySchema,
  noteDraftSchema,
  notePatchSchema,
  noteTransitionSchema,
  passwordSchema,
  userPatchSchema,
} from "@agentstack/contracts";
import * as projects from "./projects/projects.service.js";
import * as objects from "./objects/objects.service.js";
import * as reviews from "./reviews/reviews.service.js";
import * as reporting from "./reporting/reporting.service.js";
import { storeFile, loadFile } from "./files/files.service.js";
import { importManifest, importSchema } from "./imports/import.service.js";
import {
  legacyQuerySchema,
  resolveLegacyLink,
} from "./legacy/legacy.service.js";
import { idempotent } from "./shared/idempotency.service.js";
import { audit } from "./shared/audit.service.js";
import { decodeCursor, page } from "./shared/pagination.util.js";
export interface ServerConfig {
  databaseUrl: string;
  allowedOrigin: string;
  storageDir: string;
  secureCookies: boolean;
  webDist?: string;
  logger?: boolean;
  trustProxy?: string;
  apiRateLimit?: number;
  authRateLimit?: number;
  repositoryEncryptionKey?: string;
  repositoryFetch?: RepositoryFetch;
}
declare module "fastify" {
  interface FastifyRequest {
    principal: Principal | null;
  }
}
export async function buildApp(config: ServerConfig) {
  const trustedProxies = parseTrustedProxies(config.trustProxy);
  const app = Fastify({
    logger:
      config.logger === false
        ? false
        : {
            redact: [
              "req.headers.authorization",
              "req.headers.cookie",
              'res.headers["set-cookie"]',
              "password",
              "token",
              "secret", "code", "challenge", "recoveryCodes",
              "req.body.password", "req.body.newPassword", "req.body.code", "req.body.challenge",
            ],
          },
    bodyLimit: 1024 * 1024,
    requestTimeout: 300000,
    trustProxy: trustedProxies,
  });
  const database = new Database(config.databaseUrl, event => app.log.error(event, 'Idle database connection lost'));
  try { await database.assertRestrictedRole(); } catch (error) { await database.close(); await app.close(); throw error; }
  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: 12 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  });
  await app.register(rateLimit, {
    max: config.apiRateLimit ?? 300,
    timeWindow: "1 minute",
    hook: "preHandler",
    keyGenerator: (request) =>
      request.principal
        ? `actor:${request.principal.key}`
        : `ip:${normalizeIP(request.ip)}`,
    allowList: (request) =>
      !request.url.startsWith("/api/") ||
      (request.method === "GET" &&
        (request.routeOptions.url === "/api/v1/projects/:projectId/files/:id" ||
          ["/api/v1/health", "/api/v1/ready", "/api/v1/capabilities"].includes(
            request.routeOptions.url ?? "",
          ))),
  });
  app.decorateRequest("principal", null);
  app.addHook("onRequest", async (request, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "same-origin")
      .header("X-Frame-Options", "DENY")
      .header("Permissions-Policy", "camera=(),microphone=(),geolocation=()");
    if (!request.url.startsWith("/api/")) return;
    reply.header("Cache-Control", "no-store");
    const path = request.url.split("?")[0];
    const publicPath = [
      "/api/v1/auth/login",
      "/api/v1/auth/mfa/verify",
      "/api/v1/auth/accept-invitation",
      "/api/v1/health",
      "/api/v1/ready",
      "/api/v1/capabilities",
    ].includes(path!);
    if (!publicPath) request.principal = await authenticate(database, request);
    if (
      ["POST", "PATCH", "PUT", "DELETE"].includes(request.method) &&
      request.principal?.type !== "agent"
    ) {
      if (
        request.headers.origin !== config.allowedOrigin ||
        request.headers["x-agentstack-request"] !== "1"
      )
        throw new AppError(
          403,
          "origin_rejected",
          "This write must originate from the AgentStack application.",
        );
      const type = request.headers["content-type"] ?? "";
      if (
        !type.startsWith("application/json") &&
        !type.startsWith("multipart/form-data")
      )
        throw new AppError(
          415,
          "json_required",
          "Use JSON or a supported file upload.",
        );
    }
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError)
      return reply
        .code(error.status)
        .send({ error: { code: error.code, message: error.message } });
    const e = error as { code?: string; statusCode?: number };
    if (e.code === "23505")
      return reply.code(409).send({
        error: {
          code: "already_exists",
          message: "An object with this identity already exists.",
        },
      });
    if (e.code === "23503" || e.code === "22P02")
      return reply.code(422).send({
        error: {
          code: "invalid_reference",
          message: "A referenced record is unavailable.",
        },
      });
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500)
      return reply.code(e.statusCode).send({
        error: {
          code: "invalid_request",
          message:
            e.statusCode === 429
              ? "Too many requests. Please try again later."
              : "The request is invalid or too large.",
        },
      });
    request.log.error(
      { errorCode: e.code ?? "internal", requestId: request.id },
      "Request failed",
    );
    return reply.code(500).send({
      error: {
        code: "internal_error",
        message: "The operation could not be completed.",
      },
    });
  });
  const prefix = "/api/v1";
  const principal = (r: FastifyRequest) => {
    if (!r.principal)
      throw new AppError(401, "unauthorized", "Sign in to continue.");
    return r.principal;
  };
  const params = (r: FastifyRequest) => r.params as Record<string, string>;
  const inProject = <T>(
    r: FastifyRequest,
    scope: "read" | "write" | "review",
    fn: (ctx: Context) => Promise<T>,
  ) =>
    database.project(
      principal(r),
      parse(idSchema, params(r).projectId),
      scope,
      fn,
    );
  const objectId = (r: FastifyRequest) => parse(idSchema, params(r).id);
  const query = (r: FastifyRequest) => parse(listQuerySchema, r.query);
  const key = (r: FastifyRequest) =>
    typeof r.headers["idempotency-key"] === "string"
      ? r.headers["idempotency-key"]
      : undefined;
  app.get(prefix + "/health", async () => ({ status: "ok" }));
  app.get(prefix + "/ready", async () => {
    const r = await database.pool.query(
      "SELECT max(version) AS version FROM schema_migrations",
    );
    if (r.rows[0]?.version !== CURRENT_SCHEMA_VERSION)
      throw new AppError(503, "not_ready", "Database migration is required.");
    return { status: "ready", schemaVersion: CURRENT_SCHEMA_VERSION };
  });
  app.get(prefix + "/capabilities", async () => reporting.capabilities);
  app.post(
    prefix + "/auth/login",
    {
      config: {
        rateLimit: {
          max: config.authRateLimit ?? 15,
          timeWindow: "1 minute",
          hook: "onRequest",
          keyGenerator: (request: FastifyRequest) =>
            `login:${normalizeIP(request.ip)}`,
        },
      },
    },
    async (r, reply) => {
      const input = parse(loginSchema, r.body);
      const result = await beginLogin(database, input.email, input.password);
      if ('mfaRequired' in result) return result;
      setSession(reply,result.secret,config.secureCookies);
      return { user: result.user };
    },
  );
  registerAccountRoutes(app,database,config.repositoryEncryptionKey,config.secureCookies);
  registerTaskRoutes(app,database);
  app.post(prefix + "/auth/logout", async (r, reply) => {
    if (principal(r).type !== "human") throw forbidden();
    await database.pool.query("DELETE FROM sessions WHERE hash=$1", [
      hashToken(r.cookies.agentstack_session ?? ""),
    ]);
    reply.clearCookie("agentstack_session", { path: "/" });
    return { ok: true };
  });
  app.get(prefix + "/auth/me", async (r) => {
    const p = principal(r);
    return {
      user: {
        id: p.id,
        email: p.email,
        name: p.name,
        isAdmin: p.isAdmin,
        version: p.version ?? 1,
        disabled: false,
      },
      csrfToken: "origin-bound",
    };
  });
  app.post(
    prefix + "/auth/accept-invitation",
    {
      config: {
        rateLimit: {
          max: config.authRateLimit ?? 10,
          timeWindow: "1 minute",
          hook: "onRequest",
          keyGenerator: (request: FastifyRequest) =>
            `invitation:${normalizeIP(request.ip)}`,
        },
      },
    },
    async (r) =>
      acceptInvitation(
        database,
        parse(
          z
            .object({
              token: z.string().min(20).max(200),
              name: z.string().min(1).max(240),
              password: passwordSchema,
            })
            .strict(),
          r.body,
        ),
      ),
  );
  app.get(prefix + "/users", async (r) => {
    const p = principal(r);
    if (!p.isAdmin || p.type !== "human") throw forbidden();
    const q = query(r);
    const rows = (
      await database.pool.query(
        "SELECT * FROM users WHERE (id>$1::uuid OR $1 IS NULL) ORDER BY id LIMIT $2",
        [decodeCursor(q.cursor), q.limit + 1],
      )
    ).rows;
    return page(rows.map(publicUser), q.limit);
  });
  app.post(prefix + "/users", async (r, reply) => {
    const user = await createUser(
      database,
      principal(r),
      parse(userDraftSchema, r.body),
    );
    reply.code(201);
    return user;
  });
  app.patch(prefix + "/users/:id", (r) =>
    updateUser(
      database,
      principal(r),
      objectId(r),
      parse(userPatchSchema, r.body),
    ),
  );
  app.get(prefix + "/admin/activity", (r) => {
    const q = query(r);
    return userAudit(database, principal(r), q.limit, q.cursor);
  });
  app.get(prefix + "/users/:id/history", (r) => {
    const q = query(r);
    return userAudit(database, principal(r), q.limit, q.cursor, objectId(r));
  });
  app.get(prefix + "/projects", async (r) => {
    const q = query(r);
    return projects.listProjects(database, principal(r), q.limit, q.cursor);
  });
  app.post(prefix + "/projects", async (r, reply) => {
    const p = await projects.createProject(
      database,
      principal(r),
      parse(projectDraftSchema, r.body),
    );
    reply.code(201);
    return p;
  });
  app.get(prefix + "/projects/:projectId", (r) =>
    inProject(r, "read", projects.getProject),
  );
  app.patch(prefix + "/projects/:projectId", (r) =>
    inProject(r, "write", (ctx) =>
      projects.patchProject(
        ctx,
        parse(
          z
            .object({
              expectedVersion: z.number().int().positive(),
              name: z.string().min(1).max(240).optional(),
              description: z.string().max(8000).optional(),
              archived: z.boolean().optional(),
            })
            .strict(),
          r.body,
        ),
      ),
    ),
  );
  app.get(prefix + "/projects/:projectId/history", (r) =>
    inProject(r, "read", (ctx) => {
      const q = query(r);
      return projects.projectHistory(ctx, q.limit, q.cursor);
    }),
  );
  app.get(prefix + "/projects/:projectId/members", (r) =>
    inProject(r, "read", (ctx) =>
      projects.listMembers(
        ctx,
        parse(
          z.object({
            includeRevoked: z.enum(["true", "false"]).default("false"),
          }),
          r.query,
        ).includeRevoked === "true",
      ),
    ),
  );
  app.post(prefix + "/projects/:projectId/members", async (r, reply) => {
    const input = parse(
      z
        .object({
          userId: idSchema,
          role: z.enum(["developer", "customer"]),
          expectedVersion: z.number().int().nonnegative().default(0),
        })
        .strict(),
      r.body,
    );
    const result = await inProject(r, "write", (ctx) =>
      projects.setMember(ctx, input.userId, input.role, input.expectedVersion),
    );
    reply.code(201);
    return result;
  });
  app.delete(prefix + "/projects/:projectId/members/:id", (r) =>
    inProject(r, "write", (ctx) =>
      projects.removeMember(
        ctx,
        objectId(r),
        parse(
          z.object({ expectedVersion: z.number().int().positive() }).strict(),
          r.body,
        ).expectedVersion,
      ),
    ),
  );
  app.get(prefix + "/projects/:projectId/tokens", (r) =>
    inProject(r, "read", projects.listTokens),
  );
  app.post(prefix + "/projects/:projectId/tokens", async (r, reply) => {
    const result = await inProject(r, "write", (ctx) =>
      projects.createToken(ctx, parse(tokenDraftSchema, r.body)),
    );
    reply.code(201);
    return result;
  });
  app.delete(prefix + "/projects/:projectId/tokens/:id", (r) =>
    inProject(r, "write", (ctx) => projects.revokeToken(ctx, objectId(r))),
  );
  app.post(prefix + "/projects/:projectId/invitations", async (r, reply) => {
    const input = parse(
      z
        .object({
          email: z.email().transform((v) => v.toLowerCase()),
          role: z.enum(["developer", "customer"]),
          expiresInHours: z.number().int().min(1).max(168).default(48),
        })
        .strict(),
      r.body,
    );
    const result = await inProject(r, "write", (ctx) =>
      projects.createInvitation(ctx, input),
    );
    reply.code(201);
    return result;
  });
  app.get(prefix + "/projects/:projectId/invitations", (r) =>
    inProject(r, "read", async (ctx) => {
      if (!ctx.principal.isAdmin || ctx.principal.type !== "human")
        throw forbidden();
      return {
        items: (
          await ctx.db.query(
            'SELECT id,email,role,expires_at AS "expiresAt",accepted_at AS "acceptedAt",revoked_at AS "revokedAt" FROM invitations WHERE project_id=$1 ORDER BY created_at DESC',
            [ctx.projectId],
          )
        ).rows,
        nextCursor: null,
      };
    }),
  );
  app.delete(prefix + "/projects/:projectId/invitations/:id", (r) =>
    inProject(r, "write", (ctx) => projects.revokeInvitation(ctx, objectId(r))),
  );
  app.get(prefix + "/projects/:projectId/legacy", (r) =>
    inProject(r, "read", (ctx) =>
      resolveLegacyLink(ctx, parse(legacyQuerySchema, r.query)),
    ),
  );
  app.get(prefix + "/projects/:projectId/objects", (r) =>
    inProject(r, "read", (ctx) => objects.listObjects(ctx, parse(objectListQuerySchema, r.query))),
  );
  app.post(prefix + "/projects/:projectId/objects", async (r, reply) => {
    const draft = parse(objectDraftSchema, r.body);
    const result = await inProject(r, "write", async (ctx) => {
      const saved = await idempotent(ctx, key(r), "object.create", draft, () =>
        objects.createObject(ctx, draft),
      );
      return objects.getObject(ctx, saved.id);
    });
    reply.code(201);
    return result;
  });
  app.get(prefix + "/projects/:projectId/objects/:id", (r) =>
    inProject(r, "read", (ctx) => objects.getObject(ctx, objectId(r))),
  );
  app.patch(prefix + "/projects/:projectId/objects/:id", (r) =>
    inProject(r, "write", (ctx) =>
      objects.patchObject(ctx, objectId(r), parse(objectPatchSchema, r.body)),
    ),
  );
  app.get(prefix + "/projects/:projectId/objects/:id/history", (r) =>
    inProject(r, "read", (ctx) => {
      const q = query(r);
      return objects.objectHistory(ctx, objectId(r), q.limit, q.cursor);
    }),
  );
  app.post(prefix + "/projects/:projectId/objects/:id/restore", (r) =>
    inProject(r, "write", (ctx) =>
      objects.restoreObject(ctx, objectId(r), parse(restoreSchema, r.body)),
    ),
  );
  app.post(prefix + "/projects/:projectId/objects/:id/convert", (r) =>
    inProject(r, "write", (ctx) =>
      objects.convertProposal(
        ctx,
        objectId(r),
        parse(
          z.object({ expectedVersion: z.number().int().positive() }).strict(),
          r.body,
        ).expectedVersion,
      ),
    ),
  );
  app.get(prefix + "/projects/:projectId/notes", (r) =>
    inProject(r, "read", (ctx) => reviews.listNotes(ctx, query(r))),
  );
  app.post(prefix + "/projects/:projectId/notes", async (r, reply) => {
    const draft = parse(noteDraftSchema, r.body);
    const result = await inProject(r, "review", async (ctx) => {
      const saved = await idempotent(ctx, key(r), "note.create", draft, () =>
        reviews.createNote(ctx, draft),
      );
      return reviews.getNote(ctx, saved.id);
    });
    reply.code(201);
    return result;
  });
  app.get(prefix + "/projects/:projectId/notes/:id", (r) =>
    inProject(r, "read", (ctx) => reviews.getNote(ctx, objectId(r))),
  );
  app.patch(prefix + "/projects/:projectId/notes/:id", (r) =>
    inProject(r, "review", (ctx) =>
      reviews.patchNote(ctx, objectId(r), parse(notePatchSchema, r.body)),
    ),
  );
  app.post(prefix + "/projects/:projectId/notes/:id/transition", (r) =>
    inProject(r, "review", (ctx) =>
      reviews.transitionNote(
        ctx,
        objectId(r),
        parse(noteTransitionSchema, r.body),
      ),
    ),
  );
  app.get(prefix + "/projects/:projectId/notes/:id/history", (r) =>
    inProject(r, "read", (ctx) => {
      const q = query(r);
      return reviews.noteHistory(ctx, objectId(r), q.limit, q.cursor);
    }),
  );
  app.post(prefix + "/projects/:projectId/files", async (r, reply) => {
    const result = await inProject(r, "write", async (ctx) => {
      const part = await r.file();
      if (!part || part.fieldname !== "file")
        throw new AppError(
          400,
          "file_required",
          "Upload one file using the file field.",
        );
      const bytes = await part.toBuffer();
      return storeFile(ctx, config.storageDir, part.filename, bytes);
    });
    reply.code(201);
    return result;
  });
  app.get(prefix + "/projects/:projectId/files/:id", async (r, reply) => {
    const file = await inProject(r, "read", (ctx) =>
      loadFile(ctx, config.storageDir, objectId(r)),
    );
    reply
      .header(
        "Content-Security-Policy",
        "sandbox; default-src 'none'; style-src 'unsafe-inline'",
      )
      .header("Content-Type", file.mimeType)
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      );
    return reply.send(file.bytes);
  });
  app.get(prefix + "/projects/:projectId/progress", (r) =>
    inProject(r, "read", reporting.progress),
  );
  app.get(prefix + "/projects/:projectId/activity", (r) =>
    inProject(r, "read", (ctx) => {
      const q = query(r);
      return reporting.activity(ctx, q.limit, q.cursor);
    }),
  );
  app.get(prefix + "/projects/:projectId/context", (r) =>
    inProject(r, "read", reporting.context),
  );
  app.post(
    prefix + "/projects/:projectId/import",
    { bodyLimit: 32 * 1024 * 1024 },
    (r) =>
      inProject(r, "write", (ctx) =>
        importManifest(ctx, parse(importSchema, r.body)),
      ),
  );
  registerRepositoryRoutes(app, database, { encryptionKey: config.repositoryEncryptionKey, fetch: config.repositoryFetch });
  if (config.webDist) {
    await app.register(staticPlugin, {
      root: resolve(config.webDist),
      prefix: "/",
      wildcard: false,
    });
    app.setNotFoundHandler((r, reply) => {
      if (r.url.startsWith("/api/"))
        return reply.code(404).send({
          error: {
            code: "not_found",
            message: "The requested endpoint is unavailable.",
          },
        });
      if (r.method !== "GET" || r.url.includes("."))
        return reply.code(404).send("Not found");
      return reply.sendFile("index.html");
    });
  }
  app.addHook("onClose", () => database.close());
  await app.ready();
  return app;
}
