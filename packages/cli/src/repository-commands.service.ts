import type { Command } from "commander";
import type { AgentStackClient, RepositorySnapshot } from "@agentstack/sdk";
import { idSchema } from "@agentstack/sdk";
import { emit } from "./output.service.js";
import { readRepositorySource } from "./repository-source.service.js";
import { readJsonFile } from "./manifest.service.js";
import { repositoryPipelineSchema } from "@agentstack/sdk";
import { z } from "zod";
interface Dependencies {
  connection: (command: Command) => AgentStackClient;
  project: (command: Command) => string;
  global: (command: Command) => { json?: boolean };
}
const summary = (snapshot: RepositorySnapshot) => ({
  id: snapshot.id,
  connectionId: snapshot.connectionId,
  projectId: snapshot.projectId,
  commit: snapshot.commit,
  branch: snapshot.branch,
  source: snapshot.source,
  counts: snapshot.counts,
  pipelines: snapshot.pipelines,
  applied: false,
  next: "Review and apply selected entries in the workspace. No project objects were changed.",
});
export function registerRepositoryCommands(
  program: Command,
  deps: Dependencies,
) {
  const repositories = program
    .command("repositories")
    .description(
      "Read connections, preview committed Git content and stage changes for human review",
    );
  repositories
    .command("list")
    .action(async (_options, command) =>
      emit(
        await deps.connection(command).repositories(deps.project(command)),
        deps.global(command),
      ),
    );
  repositories
    .command("get <connection-id>")
    .action(async (id, _options, command) =>
      emit(
        await deps
          .connection(command)
          .repository(deps.project(command), idSchema.parse(id)),
        deps.global(command),
      ),
    );
  repositories
    .command("pipelines")
    .action(async (_options, command) =>
      emit(
        await deps
          .connection(command)
          .repositoryPipelines(deps.project(command)),
        deps.global(command),
      ),
    );
  repositories
    .command("snapshots <connection-id>")
    .action(async (id, _options, command) =>
      emit(
        await deps
          .connection(command)
          .repositorySnapshots(deps.project(command), idSchema.parse(id)),
        deps.global(command),
      ),
    );
  repositories
    .command("snapshot <connection-id> <snapshot-id>")
    .option(
      "--output <new-file>",
      "Write private snapshot JSON to a new owner-only file",
    )
    .action(async (id, snapshot, options, command) =>
      emit(
        await deps
          .connection(command)
          .repositorySnapshot(
            deps.project(command),
            idSchema.parse(id),
            idSchema.parse(snapshot),
          ),
        { ...deps.global(command), ...options },
      ),
    );
  repositories
    .command("refresh <connection-id>")
    .description(
      "Fetch provider data and stage a changeset; never applies project edits",
    )
    .action(async (id, _options, command) => {
      const api = deps.connection(command),
        project = deps.project(command),
        repository = await api.repository(project, idSchema.parse(id));
      if (repository.archived)
        throw Error("This repository connection is archived.");
      if (repository.provider === "local")
        throw Error(
          "Local connections use repositories sync --repo instead of provider refresh.",
        );
      try {
        await emit(
          summary(
            await api.refreshRepository(
              project,
              repository.id,
              repository.version,
            ),
          ),
          deps.global(command),
        );
      } catch (error) {
        process.stderr.write(
          "Refresh was not confirmed. Read repository snapshots before retrying; no automatic retry was made.\n",
        );
        throw error;
      }
    });
  repositories
    .command("sync <connection-id>")
    .description(
      "Preview committed HEAD Markdown; --stage submits a changeset but never applies it",
    )
    .requiredOption("--repo <directory>", "Local Git checkout")
    .option("--branch <name>", "Expected branch for a detached CI checkout")
    .option(
      "--pipeline-json <file>",
      "Optional reported pipeline array (64 KiB maximum; never verified provider evidence)",
    )
    .option("--stage", "Submit the verified snapshot for human review", false)
    .action(async (id, options, command) => {
      const api = deps.connection(command),
        project = deps.project(command),
        repository = await api.repository(project, idSchema.parse(id));
      if (repository.archived)
        throw Error("This repository connection is archived.");
      const ciBranch =
          process.env.GITHUB_REF_NAME ?? process.env.CI_COMMIT_BRANCH,
        ciCommit = process.env.GITHUB_SHA ?? process.env.CI_COMMIT_SHA;
      const source = await readRepositorySource(
        options.repo,
        repository.roots,
        repository.branch,
        {
          branch: options.branch ?? ciBranch,
          ...(ciBranch && ciCommit
            ? { ci: { branch: ciBranch, commit: ciCommit } }
            : {}),
        },
      );
      const pipelines = options.pipelineJson
        ? z
            .array(
              repositoryPipelineSchema.extend({
                commit: z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i),
              }),
            )
            .max(20)
            .parse(await readJsonFile(options.pipelineJson, 64 * 1024))
            .map((pipeline) => ({ ...pipeline, source: "reported" as const }))
        : [];
      if (!options.stage) {
        await emit(
          {
            dryRun: true,
            applied: false,
            connectionId: repository.id,
            expectedVersion: repository.version,
            branch: source.branch,
            commit: source.commit,
            pipelines,
            files: source.files.map((file) => ({
              path: file.path,
              bytes: Buffer.byteLength(file.content, "utf8"),
            })),
            next: "Use --stage to submit this committed snapshot for human review.",
          },
          deps.global(command),
        );
        return;
      }
      try {
        await emit(
          summary(
            await api.stageRepositorySnapshot(project, repository.id, {
              expectedVersion: repository.version,
              ...source,
              pipelines,
            }),
          ),
          deps.global(command),
        );
      } catch (error) {
        process.stderr.write(
          "Snapshot staging was not confirmed. Read repository snapshots before retrying; no automatic retry was made.\n",
        );
        throw error;
      }
    });
}
