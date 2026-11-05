import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const projectId = "11111111-1111-4111-8111-111111111111";
const main = fileURLToPath(new URL("./main.ts", import.meta.url));
let server: Server;
let origin: string;
let directory: string;
let logouts = 0;
let requestDelay = 0;
let imports = 0;
let successfulPreflight = false;
let requests = 0;
function run(
  args: string[],
  input?: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", main, ...args], {
      env: {
        ...process.env,
        AGENTSTACK_URL: origin,
        AGENTSTACK_TOKEN: "test-token",
        AGENTSTACK_PROJECT: projectId,
      },
      stdio: "pipe",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data;
    });
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "agentstack-command-"));
  logouts = 0;
  requestDelay = 0;
  imports = 0;
  successfulPreflight = false;
  requests = 0;
  server = createServer(async (request, response) => {
    requests++;
    response.setHeader("Content-Type", "application/json");
    let body = "";
    for await (const part of request) body += part;
    if (request.url?.endsWith("/auth/login")) {
      expect(request.headers.origin).toBe(origin);
      expect(request.headers["x-agentstack-request"]).toBe("1");
      response.setHeader(
        "Set-Cookie",
        "agentstack_session=synthetic-cookie; HttpOnly; Path=/",
      );
      response.end(JSON.stringify({ user: { id: projectId } }));
      return;
    }
    if (request.url?.endsWith("/auth/logout")) {
      logouts++;
      expect(request.headers.cookie).toBe(
        "agentstack_session=synthetic-cookie",
      );
      response.end('{"ok":true}');
      return;
    }
    if (request.url?.endsWith("/import")) {
      imports++;
      if (successfulPreflight && JSON.parse(body).dryRun === true) {
        response.end(JSON.stringify({dryRun: true, created: 0, updated: 0, unchanged: 0, items: []}));
        return;
      }
      await new Promise(resolve => setTimeout(resolve, requestDelay));
      expect(request.headers.authorization).toBeUndefined();
      expect(request.headers.cookie).toBe(
        "agentstack_session=synthetic-cookie",
      );
      response.statusCode = 409;
      response.end(
        '{"error":{"code":"version_conflict","message":"do not echo secret"}}',
      );
      return;
    }
    await new Promise(resolve => setTimeout(resolve, requestDelay));
    expect(request.headers.authorization).toBe("Bearer test-token");
    if (request.url?.includes("/capabilities"))
      response.end(
        JSON.stringify({
          version: "0.1.0",
          apiVersion: 1,
          objectKinds: ["screen"],
          features: ["review"],
          mcpTransport: "stdio",
        }),
      );
    else response.end('{"items":[],"nextCursor":null}');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(directory, { recursive: true, force: true });
});
describe("CLI process", () => {
  it("emits parseable machine JSON without credential output", async () => {
    const result = await run(["doctor", "--json"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      apiVersion: 1,
    });
    expect(result.stdout + result.stderr).not.toContain("test-token");
  });
  it("logs out an explicit human session after failed import and exits nonzero", async () => {
    const path = join(directory, "manifest.json");
    await writeFile(
      path,
      JSON.stringify({ schemaVersion: 1, objects: [], files: [] }),
    );
    const result = await run(
      [
        "import",
        path,
        "--human",
        "--email",
        "operator@example.test",
        "--password-stdin",
        "--apply",
        "--json",
      ],
      "synthetic-password\n",
    );
    expect(result.code).toBe(1);
    expect(logouts).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("version_conflict");
    expect(result.stderr).not.toMatch(
      /synthetic-password|synthetic-cookie|do not echo secret/,
    );
  });
  it.each(["0", "-1", "1.5", "600001", "Infinity", "nope"])("rejects invalid CLI timeout %s without API calls", async value => {
    const result = await run(["--timeout-ms", value, "projects", "--json"]);
    expect(result.code).not.toBe(0);
    expect(requests).toBe(0);
  });
  it("accepts the maximum request timeout", async () => {
    const result = await run(["--timeout-ms", "600000", "projects", "--json"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).items).toEqual([]);
  });
  it("applies the selected timeout to agent-token requests", async () => {
    requestDelay = 150;
    const result = await run(["--timeout-ms", "50", "projects", "--json"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("timeout");
    expect(requests).toBe(1);
  });
  it("applies the selected timeout to human imports without retrying an uncertain write", async () => {
    requestDelay = 150;
    successfulPreflight = true;
    const path = join(directory, "manifest.json");
    await writeFile(path, JSON.stringify({schemaVersion: 1, objects: [], files: []}));
    const result = await run(["--timeout-ms", "50", "import", path, "--human", "--email", "operator@example.test", "--password-stdin", "--apply", "--json"], "synthetic-password\n");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("timeout");
    expect(imports).toBe(2);
    expect(result.stderr).toContain("timeout does not prove rollback");
    expect(logouts).toBe(1);
  });

});
