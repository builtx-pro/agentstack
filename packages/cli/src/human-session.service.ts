import { createHumanSession } from "@agentstack/sdk";

export async function loginFromStdin(
  baseUrl: string | undefined,
  email: string | undefined,
  passwordStdin: boolean | undefined,
) {
  if (!baseUrl || !email || !passwordStdin)
    throw new Error(
      "Human import requires --email, --password-stdin and AGENTSTACK_URL (or --url).",
    );
  if (process.stdin.isTTY)
    throw new Error(
      "Use a pipe or redirected protected file for --password-stdin; interactive echo is not allowed.",
    );
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > 4096)
      throw new Error("Password input exceeds the allowed size.");
    chunks.push(bytes);
  }
  const buffer = Buffer.concat(chunks);
  const password = buffer.toString("utf8").replace(/\r?\n$/, "");
  buffer.fill(0);
  for (const chunk of chunks) chunk.fill(0);
  if (!password || /[\r\n]/.test(password))
    throw new Error("Password input must contain exactly one nonempty line.");
  return createHumanSession({ baseUrl, email, password });
}
