import { z } from "zod";
import { AgentStackClient } from "./client.js";
import { AgentStackError, safeApiError } from "./errors.errors.js";
import { normalizeBaseUrl } from "./transport.client.js";

/** Explicit operator sessions only. MCP never imports or calls this function. */
export async function createHumanSession(options: {
  baseUrl: string;
  email: string;
  password: string;
  mfaCode?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}): Promise<{ client: AgentStackClient; logout: () => Promise<void> }> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const email = z.string().email().max(320).parse(options.email);
  z.string().min(1).max(1024).parse(options.password);
  const timeoutMs = z
    .number()
    .int()
    .positive()
    .max(600000)
    .parse(options.timeoutMs ?? 30000);
  const fetcher = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetcher(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: new URL(baseUrl).origin,
        "X-AgentStack-Request": "1",
      },
      body: JSON.stringify({ email, password: options.password }),
      redirect: "error",
      signal: AbortSignal.timeout(Math.min(30000, timeoutMs)),
    });
  } catch {
    throw new AgentStackError("network_error");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw safeApiError(response.status, null);
  }
  let cookie = response.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .find((entry) => entry?.startsWith("agentstack_session="));
  if (!cookie) {
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 32768) {
            await reader.cancel();
            throw new AgentStackError("response_too_large");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
    } catch {
      throw new AgentStackError("invalid_response");
    }
    const challenge = z
      .object({
        mfaRequired: z.literal(true),
        challenge: z.string().min(40).max(100),
        expiresAt: z.string(),
      })
      .safeParse(body);
    if (!challenge.success) throw new AgentStackError("invalid_response");
    if (!options.mfaCode) throw new AgentStackError("mfa_required");
    const code = z.string().trim().min(6).max(40).parse(options.mfaCode);
    try {
      response = await fetcher(`${baseUrl}/auth/mfa/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: new URL(baseUrl).origin,
          "X-AgentStack-Request": "1",
        },
        body: JSON.stringify({ challenge: challenge.data.challenge, code }),
        redirect: "error",
        signal: AbortSignal.timeout(Math.min(30000, timeoutMs)),
      });
    } catch {
      throw new AgentStackError("network_error");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw safeApiError(response.status, null);
    }
    cookie = response.headers
      .getSetCookie()
      .map((entry) => entry.split(";")[0])
      .find((entry) => entry?.startsWith("agentstack_session="));
  }
  await response.body?.cancel();
  if (!cookie) throw new AgentStackError("invalid_response");
  const client = new AgentStackClient({
    baseUrl,
    sessionCookie: cookie,
    fetch: fetcher,
    timeoutMs,
  });
  let ended = false;
  return {
    client,
    logout: async () => {
      if (ended) return;
      await client.transport.request(
        "POST",
        "/auth/logout",
        z.object({ ok: z.boolean() }),
        {},
      );
      ended = true;
    },
  };
}
