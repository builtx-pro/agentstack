import { createHumanSession } from "@agentstack/sdk";

export async function loginFromStdin(
  baseUrl: string | undefined,
  email: string | undefined,
  passwordStdin: boolean | undefined,
  timeoutMs?: number,
  mfaStdin = false,
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
  const input = buffer.toString("utf8").replace(/\r?\n$/, "");
  buffer.fill(0);
  for (const chunk of chunks) chunk.fill(0);
  const { password, mfaCode } = parseHumanInput(input, mfaStdin);
  return createHumanSession({ baseUrl, email, password, mfaCode, timeoutMs });
}

export function parseHumanInput(input: string, mfaStdin = false) {
  const lines = input.split(/\r?\n/);
  if (
    lines.length !== (mfaStdin ? 2 : 1) ||
    !lines[0] ||
    lines.some((line) => line.includes("\r"))
  )
    throw new Error(
      mfaStdin
        ? "Input must contain exactly two lines: password, then verification code."
        : "Password input must contain exactly one nonempty line.",
    );
  if (
    mfaStdin &&
    (!lines[1] || lines[1].trim().length < 6 || lines[1].trim().length > 40)
  )
    throw new Error("Verification code must contain 6–40 characters.");
  return {
    password: lines[0],
    ...(mfaStdin ? { mfaCode: lines[1]!.trim() } : {}),
  };
}
