import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpath } from "node:fs/promises";
const exec = promisify(execFile);
const hashPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const maxFile = 128 * 1024,
  maxTotal = 4 * 1024 * 1024;
export interface RepositorySource {
  branch: string;
  commit: string;
  files: Array<{ path: string; content: string }>;
}
/** Read immutable Git blobs. No working-tree reads, hooks, checkout or repository scripts. */
export async function readRepositorySource(
  directory: string,
  roots: string[],
  expectedBranch: string,
  options: { branch?: string; ci?: { branch: string; commit: string } } = {},
): Promise<RepositorySource> {
  if (
    !roots.length ||
    roots.length > 12 ||
    roots.some(
      (root) =>
        !root ||
        root.length > 200 ||
        root.startsWith("/") ||
        root.includes("\\") ||
        root
          .split("/")
          .some((part) => !part || part === "." || part === "..") ||
        /[\x00-\x1f]/.test(root),
    )
  )
    throw Error("Repository roots must be safe relative files or directories.");
  const cwd = await realpath(directory);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => value !== undefined && !key.startsWith("GIT_"),
    ),
  ) as Record<string, string>;
  Object.assign(env, {
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_NO_LAZY_FETCH: "1",
    GIT_OPTIONAL_LOCKS: "0",
  });
  const git = async (args: string[], maxBuffer = 64 * 1024) => {
    try {
      return (
        await exec(
          "git",
          [
            "-c",
            "core.fsmonitor=false",
            "-c",
            "core.hooksPath=/dev/null",
            ...args,
          ],
          { cwd, env, timeout: 10000, maxBuffer, encoding: "buffer" },
        )
      ).stdout;
    } catch {
      throw Error(
        "Cannot read the requested committed Git data. Check the checkout, branch and source limits.",
      );
    }
  };
  const text = (bytes: Buffer) =>
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const commit = text(
    await git(["rev-parse", "--verify", "HEAD^{commit}"]),
  ).trim();
  if (!hashPattern.test(commit)) throw Error("Git returned an invalid commit.");
  const actualBranch = text(await git(["branch", "--show-current"])).trim();
  const branch = actualBranch || options.branch;
  if (!branch)
    throw Error(
      "Detached checkout: provide --branch and a matching local branch or CI commit identity.",
    );
  if (
    branch !== expectedBranch ||
    (options.branch && options.branch !== expectedBranch)
  )
    throw Error(
      "The committed branch does not match the repository connection.",
    );
  await git(["check-ref-format", "--branch", branch]);
  if (!actualBranch) {
    let branchCommit = "";
    try {
      branchCommit = text(
        await git(["rev-parse", "--verify", `refs/heads/${branch}^{commit}`]),
      ).trim();
    } catch {
      /* A CI checkout may intentionally have no local branch. */
    }
    const verifiedCI =
      options.ci?.branch === branch &&
      options.ci.commit.toLowerCase() === commit;
    if (branchCommit !== commit && !verifiedCI)
      throw Error("Detached branch identity cannot be verified against HEAD.");
  }
  const tree = text(
    await git(["ls-tree", "-rlz", "--full-tree", commit], 8 * 1024 * 1024),
  );
  const blobs: Array<{ path: string; id: string; size: number }> = [];
  let total = 0;
  for (const entry of tree.split("\0")) {
    if (!entry) continue;
    const match = entry.match(/^(\d+) (\w+) ([a-f0-9]+)\s+(\d+|-)\t([\s\S]+)$/);
    if (!match) throw Error("Git returned an unsupported tree entry.");
    const [, mode, type, id, sizeText, path] = match as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    if (!roots.some((root) => path === root || path.startsWith(root + "/")))
      continue;
    if (mode === "120000")
      throw Error("Symbolic links are not supported inside repository roots.");
    if (mode === "160000" || type === "commit")
      throw Error("Submodules are not supported inside repository roots.");
    if (!path.toLowerCase().endsWith(".md")) continue;
    if (
      !["100644", "100755"].includes(mode) ||
      type !== "blob" ||
      !hashPattern.test(id)
    )
      throw Error("Unsupported repository file mode.");
    if (
      path.length > 200 ||
      /[\x00-\x1f\\]/.test(path) ||
      path.split("/").some((part) => !part || part === "." || part === "..")
    )
      throw Error("Unsupported repository Markdown path.");
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size) || size > maxFile)
      throw Error("Repository Markdown files must not exceed 128 KiB.");
    total += size;
    if (total > maxTotal)
      throw Error("Repository Markdown must not exceed 4 MiB in total.");
    blobs.push({ path, id, size });
    if (blobs.length > 200)
      throw Error("Repository snapshots must not exceed 200 Markdown files.");
  }
  if (!blobs.length)
    throw Error("No committed Markdown files matched the configured roots.");
  const files = [];
  for (const blob of blobs) {
    const bytes = await git(["cat-file", "blob", blob.id], maxFile + 1);
    if (bytes.length !== blob.size)
      throw Error("The immutable Git blob size did not match its tree entry.");
    let content: string;
    try {
      content = text(bytes);
    } catch {
      throw Error("Repository Markdown must contain valid UTF-8.");
    }
    files.push({ path: blob.path, content });
  }
  return { branch, commit, files };
}
