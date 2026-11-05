import { Command, Option } from "commander";
import { dirname, resolve } from "node:path";
import {
  AgentStackClient,
  idSchema,
  manifestSchema,
  objectDraftSchema,
  objectKindSchema,
  objectPatchSchema,
  resultInputSchema,
  type Manifest,
} from "@agentstack/sdk";
import { z } from "zod";
import { emit } from "./output.service.js";
import { contextAsMarkdown } from "./context.service.js";
import {
  exportObjects,
  readJsonFile,
  readVerifiedFile,
  remapManifestFiles,
  validateManifestFiles,
} from "./manifest.service.js";
import { readGitContext } from "./git-context.service.js";
import { loginFromStdin } from "./human-session.service.js";

interface GlobalOptions {
  json?: boolean;
  project?: string;
  url?: string;
}
function connection(command: Command): AgentStackClient {
  const options = command.optsWithGlobals<GlobalOptions>();
  const baseUrl = options.url ?? process.env.AGENTSTACK_URL;
  const token = process.env.AGENTSTACK_TOKEN;
  if (!baseUrl || !token)
    throw new Error(
      "Set AGENTSTACK_URL and AGENTSTACK_TOKEN in the process environment.",
    );
  return new AgentStackClient({ baseUrl, token });
}
function project(command: Command): string {
  return idSchema.parse(
    command.optsWithGlobals<GlobalOptions>().project ??
      process.env.AGENTSTACK_PROJECT,
  );
}
function global(command: Command): GlobalOptions {
  return command.optsWithGlobals<GlobalOptions>();
}
function version(value: string): number {
  return z.coerce.number().int().positive().parse(value);
}
export function createCommand(): Command {
  const program = new Command("agentstack")
    .description(
      "AgentStack project-scoped API client. Credentials are read from environment only.",
    )
    .version("0.1.0")
    .option(
      "--url <origin>",
      "Installation origin (HTTPS; loopback HTTP is allowed)",
    )
    .option("--project <uuid>", "Project identifier (or AGENTSTACK_PROJECT)")
    .option("--json", "Machine-readable JSON; errors remain on stderr");
  program
    .command("doctor")
    .description("Check authenticated API compatibility and token visibility")
    .action(async (_options, command) => {
      const api = connection(command);
      const capabilities = await api.capabilities();
      const projects = await api.projects({ limit: 1 });
      await emit(
        {
          ok: true,
          apiVersion: capabilities.apiVersion,
          serverVersion: capabilities.version,
          mcpTransport: capabilities.mcpTransport,
          canReadProjects: true,
          projectVisible: projects.items.length > 0,
        },
        global(command),
      );
    });
  program
    .command("projects")
    .option("--cursor <cursor>")
    .option("--limit <number>", "Page size", "100")
    .action(async (options, command) =>
      emit(
        await connection(command).projects({
          cursor: options.cursor,
          limit: Number(options.limit),
        }),
        global(command),
      ),
    );
  program
    .command("context")
    .option("--markdown", "Portable prompt-safe Markdown wrapper")
    .option("--output <new-file>")
    .action(async (options, command) => {
      const context = await connection(command).context(project(command));
      await emit(options.markdown ? contextAsMarkdown(context) : context, {
        ...global(command),
        output: options.output,
      });
    });
  const objects = program
    .command("objects")
    .description("Find and edit versioned project targets");
  objects
    .command("list")
    .addOption(new Option("--kind <kind>").choices(objectKindSchema.options))
    .option("--q <query>")
    .option("--tag <tag>")
    .option("--status <status>")
    .option("--archived")
    .option("--cursor <cursor>")
    .option("--limit <number>", "Page size", "100")
    .action(async (options, command) =>
      emit(
        await connection(command).objects(project(command), {
          kind: options.kind,
          q: options.q,
          tag: options.tag,
          status: options.status,
          archived: options.archived,
          cursor: options.cursor,
          limit: Number(options.limit),
        }),
        global(command),
      ),
    );
  objects
    .command("get <id>")
    .action(async (id, _options, command) =>
      emit(
        await connection(command).object(project(command), id),
        global(command),
      ),
    );
  objects
    .command("create <json-file>")
    .option(
      "--request-id <uuid>",
      "Reuse this UUID when retrying an uncertain write",
    )
    .action(async (file, options, command) =>
      emit(
        await connection(command).createObject(
          project(command),
          objectDraftSchema.parse(await readJsonFile(file)),
          { idempotencyKey: options.requestId },
        ),
        global(command),
      ),
    );
  objects
    .command("update <id> <json-file>")
    .description("JSON must include expectedVersion; conflict never overwrites")
    .action(async (id, file, _options, command) =>
      emit(
        await connection(command).updateObject(
          project(command),
          id,
          objectPatchSchema.parse(await readJsonFile(file)),
        ),
        global(command),
      ),
    );
  program
    .command("history <id>")
    .option("--note", "Read review-note history instead of target history")
    .option("--cursor <cursor>")
    .action(async (id, options, command) => {
      const api = connection(command);
      const scope = project(command);
      await emit(
        options.note
          ? await api.noteHistory(scope, id, { cursor: options.cursor })
          : await api.history(scope, id, { cursor: options.cursor }),
        global(command),
      );
    });
  program
    .command("progress")
    .action(async (_options, command) =>
      emit(
        await connection(command).progress(project(command)),
        global(command),
      ),
    );
  const notes = program.command("notes");
  notes
    .command("list")
    .option(
      "--status <status>",
      "open, in_progress, ready_for_review or resolved",
    )
    .option("--target <uuid>")
    .option("--cursor <cursor>")
    .option("--limit <number>", "Page size", "100")
    .action(async (options, command) =>
      emit(
        await connection(command).notes(project(command), {
          status: options.status,
          targetId: options.target,
          cursor: options.cursor,
          limit: Number(options.limit),
        }),
        global(command),
      ),
    );
  notes
    .command("create <target-id>")
    .requiredOption("--version <number>", "Target revision", version)
    .requiredOption("--body <text>")
    .option("--visibility <visibility>", "team or customer", "team")
    .option("--request-id <uuid>")
    .action(async (id, options, command) =>
      emit(
        await connection(command).createNote(
          project(command),
          {
            targetId: id,
            targetVersion: options.version,
            body: options.body,
            visibility: options.visibility,
          },
          { idempotencyKey: options.requestId },
        ),
        global(command),
      ),
    );
  for (const action of ["claim", "release"] as const)
    program
      .command(`${action} <note-id>`)
      .requiredOption("--version <number>", "Expected note version", version)
      .option("--reason <text>")
      .action(async (id, options, command) =>
        emit(
          await connection(command).transition(project(command), id, {
            expectedVersion: options.version,
            action,
            reason: options.reason,
          }),
          global(command),
        ),
      );
  program
    .command("submit <note-id> <result-json>")
    .requiredOption("--version <number>", "Expected note version", version)
    .description(
      "Submit reported evidence for human review; does not accept or publish a change",
    )
    .action(async (id, file, options, command) =>
      emit(
        await connection(command).transition(project(command), id, {
          expectedVersion: options.version,
          action: "submit",
          result: resultInputSchema.parse(await readJsonFile(file)),
        }),
        global(command),
      ),
    );
  program
    .command("export")
    .option("--output <new-file>")
    .option(
      "--git <directory>",
      "Attach commit and branch from this local checkout",
    )
    .option(
      "--max-pages <number>",
      "Explicit page cap; reaching it fails, never truncates",
      "200",
    )
    .description(
      "Export metadata and stable references; blobs remain in the instance backup",
    )
    .action(async (options, command) => {
      const api = connection(command);
      const scope = project(command);
      const info = await api.project(scope);
      const items = await api.collect(
        (cursor) => api.objects(scope, { cursor, limit: 100, archived: false }),
        { maxPages: Number(options.maxPages) },
      );
      const manifest: Manifest = {
        schemaVersion: 1,
        project: { name: info.name, slug: info.slug },
        objects: exportObjects(items),
        files: [],
        ...(options.git ? { source: await readGitContext(options.git) } : {}),
      };
      await emit(manifest, { ...global(command), output: options.output });
    });
  program
    .command("import <manifest-file>")
    .option(
      "--human",
      "Explicit human operator session for onboarding; MCP never uses this",
    )
    .option("--email <email>", "Human account email")
    .option(
      "--password-stdin",
      "Read one password line from noninteractive stdin",
    )
    .option("--apply", "Upload files and apply; default is a read-only dry run")
    .option(
      "--git <directory>",
      "Attach current branch and commit, without executing project scripts",
    )
    .option(
      "--max-total-bytes <number>",
      "Maximum declared local file bytes",
      String(2 * 1024 ** 3),
    )
    .description(
      "Verify all files, then import atomically with baseVersion checks",
    )
    .action(async (file, options, command) => {
      const manifestPath = resolve(file);
      const manifest = manifestSchema.parse(await readJsonFile(manifestPath));
      if (options.git) manifest.source = await readGitContext(options.git);
      const prepared = await validateManifestFiles(
        manifest,
        dirname(manifestPath),
        z.coerce
          .number()
          .int()
          .positive()
          .max(50 * 1024 ** 3)
          .parse(options.maxTotalBytes),
      );
      const scope = project(command);
      if (!options.human && (options.email || options.passwordStdin))
        throw new Error(
          "--email and --password-stdin require explicit --human.",
        );
      const session = options.human
        ? await loginFromStdin(
            global(command).url ?? process.env.AGENTSTACK_URL,
            options.email,
            options.passwordStdin,
          )
        : undefined;
      const api = session?.client ?? connection(command);
      try {
        if (!options.apply)
          return await emit(
            await api.importManifest(scope, manifest, true),
            global(command),
          );
        // Validate the full package against current versions BEFORE uploads. The apply repeats validation transactionally.
        await api.importManifest(scope, manifest, true);
        const uploaded = new Map<string, string>();
        try {
          for (const entry of prepared) {
            const bytes = await readVerifiedFile(entry);
            const result = await api.uploadFile(
              scope,
              new Blob([new Uint8Array(bytes)], { type: entry.mimeType }),
              entry.name,
            );
            uploaded.set(entry.key, result.id);
            if (
              uploaded.size === 1 ||
              uploaded.size % 25 === 0 ||
              uploaded.size === prepared.length
            ) {
              process.stderr.write(
                JSON.stringify({
                  event: "upload_progress",
                  uploaded: uploaded.size,
                  total: prepared.length,
                }) + "\n",
              );
            }
            if (result.sha256 !== entry.sha256 || result.size !== entry.size)
              throw new Error(
                "Server file checksum did not match the verified local file.",
              );
          }
          return await emit(
            {
              report: await api.importManifest(
                scope,
                remapManifestFiles(manifest, uploaded),
                false,
              ),
              uploadedFileIds: [...uploaded.values()],
            },
            global(command),
          );
        } catch (error) {
          process.stderr.write(
            JSON.stringify({
              warning:
                "Import did not complete. Uploaded files may be unreferenced; retain this list for operator cleanup. No object rollback was attempted.",
              uploadedFileIds: [...uploaded.values()],
            }) + "\n",
          );
          throw error;
        }
      } finally {
        try {
          await session?.logout();
        } catch {
          process.stderr.write(
            "Could not invalidate the temporary operator session; sign out/revoke it in the workspace.\n",
          );
          process.exitCode = 1;
        }
      }
    });
  return program;
}
