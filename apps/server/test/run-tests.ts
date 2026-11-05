import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
const name = `agentstack-test-${randomBytes(5).toString("hex")}`;
const password = randomBytes(24).toString("hex");
const appPassword = randomBytes(24).toString("hex");
let started = false;
try {
  const run = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "-d",
      "--name",
      name,
      "-e",
      `POSTGRES_PASSWORD=${password}`,
      "-e",
      "POSTGRES_DB=agentstack_test",
      "-p",
      "127.0.0.1::5432",
      "postgres:18-alpine",
    ],
    { encoding: "utf8" },
  );
  if (run.status !== 0)
    throw new Error(
      "Cannot start isolated PostgreSQL test container. Ensure Docker is running.",
    );
  started = true;
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (
      spawnSync("docker", ["exec", name, "pg_isready", "-U", "postgres"], {
        stdio: "ignore",
      }).status === 0
    ) {
      ready = true;
      break;
    }
    await setTimeout(500);
  }
  if (!ready) throw new Error("Test database did not become ready");
  const binding = spawnSync("docker", ["port", name, "5432"], {
    encoding: "utf8",
  }).stdout.trim();
  const port = binding.split(":").at(-1);
  const child = spawnSync("npx", ["vitest", "run"], {
    stdio: "inherit",
    env: {
      ...process.env,
      TEST_DATABASE_OWNER_URL: `postgres://postgres:${password}@127.0.0.1:${port}/agentstack_test`,
      TEST_DATABASE_URL: `postgres://agentstack_app:${appPassword}@127.0.0.1:${port}/agentstack_test`,
      APP_DATABASE_PASSWORD: appPassword,
    },
  });
  process.exitCode = child.status ?? 1;
} finally {
  if (started) spawnSync("docker", ["rm", "-f", name], { stdio: "ignore" });
}
