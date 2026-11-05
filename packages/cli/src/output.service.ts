import { writeFile } from "node:fs/promises";
import { AgentStackError } from "@agentstack/sdk";
import { z } from "zod";
export async function emit(
  value: unknown,
  options: { json?: boolean; output?: string },
): Promise<void> {
  const rendered =
    typeof value === "string"
      ? value
      : JSON.stringify(value, null, options.json ? undefined : 2);
  if (options.output) {
    await writeFile(options.output, rendered + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    process.stderr.write("Output written to the requested new file.\n");
  } else process.stdout.write(rendered + "\n");
}
export function reportError(error: unknown, json: boolean): void {
  const body =
    error instanceof AgentStackError
      ? { code: error.code, message: error.message, status: error.status }
      : error instanceof z.ZodError
        ? {
            code: "validation_error",
            message: `Invalid input at: ${error.issues.map((issue) => issue.path.join(".") || "(root)").join(", ")}`,
          }
        : {
            code: "command_failed",
            message:
              error instanceof Error ? error.message : "The command failed.",
          };
  // Local errors never include server bodies or credentials. Node filesystem errors can contain paths only supplied by the caller.
  process.stderr.write(
    json
      ? JSON.stringify({ error: body }) + "\n"
      : `${body.code}: ${body.message}\n`,
  );
}
