import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpath } from "node:fs/promises";
const exec = promisify(execFile);
export async function readGitContext(
  directory: string,
): Promise<{ commit: string; branch?: string }> {
  const cwd = await realpath(directory);
  const options = {
    cwd,
    timeout: 5000,
    maxBuffer: 64 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1" },
  };
  const { stdout } = await exec(
    "git",
    ["rev-parse", "--verify", "HEAD"],
    options,
  );
  const commit = stdout.trim();
  if (!/^[a-f0-9]{40,64}$/.test(commit))
    throw new Error("Git did not return a valid commit identifier.");
  const branch = (
    await exec("git", ["branch", "--show-current"], options)
  ).stdout.trim();
  return { commit, ...(branch ? { branch } : {}) };
}
