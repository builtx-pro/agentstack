import { z } from "zod";
import { AgentStackError, safeApiError } from "./errors.errors.js";
import { parseRetryAfter } from "./upload-retry.util.js";
import type { ClientOptions, RequestOptions } from "./client.types.js";

export class ApiTransport {
  readonly baseUrl: string;
  private readonly token?: string;
  private readonly sessionCookie?: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  constructor(options: ClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    if (options.token !== undefined) {
      if (!options.token || /[\r\n]/.test(options.token))
        throw new Error("A nonempty agent token is required.");
      this.token = options.token;
    } else {
      if (!/^agentstack_session=[^;\s]+$/.test(options.sessionCookie))
        throw new Error("Invalid session cookie.");
      this.sessionCookie = options.sessionCookie;
    }
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.maxResponseBytes = options.maxResponseBytes ?? 4 * 1024 * 1024;
  }
  async request<T>(
    method: string,
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//"))
      throw new Error("Invalid API path.");
    options.signal?.throwIfAborted();
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout;
    const headers = new Headers({ Accept: "application/json" });
    if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
    else if (this.sessionCookie) {
      headers.set("Cookie", this.sessionCookie);
      headers.set("Origin", new URL(this.baseUrl).origin);
      headers.set("X-AgentStack-Request", "1");
    }
    if (body !== undefined && !(body instanceof FormData))
      headers.set("Content-Type", "application/json");
    if (options.idempotencyKey)
      headers.set(
        "Idempotency-Key",
        z.string().uuid().parse(options.idempotencyKey),
      );
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        method,
        headers,
        body:
          body instanceof FormData
            ? body
            : body === undefined
              ? undefined
              : JSON.stringify(body),
        redirect: "error",
        signal,
      });
    } catch {
      options.signal?.throwIfAborted();
      throw new AgentStackError(timeout.aborted ? "timeout" : "network_error");
    }
    const retryAfterMs =
      response.status === 429
        ? parseRetryAfter(response.headers.get("retry-after"))
        : undefined;
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > this.maxResponseBytes) {
            await reader.cancel();
            throw new AgentStackError("response_too_large");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    const joined = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.length;
    }
    let data: unknown;
    try {
      data = size ? JSON.parse(new TextDecoder().decode(joined)) : null;
    } catch {
      throw response.ok
        ? new AgentStackError("invalid_response", response.status)
        : safeApiError(response.status, null, retryAfterMs);
    }
    if (!response.ok) throw safeApiError(response.status, data, retryAfterMs);
    const parsed = schema.safeParse(data);
    if (!parsed.success)
      throw new AgentStackError("invalid_response", response.status);
    return parsed.data;
  }
}

export function normalizeBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["https:", "http:"].includes(url.protocol) ||
    (url.protocol === "http:" && !loopback)
  )
    throw new Error(
      "Use HTTPS, or HTTP on loopback, without URL credentials or query parameters.",
    );
  if (
    url.pathname !== "/" &&
    url.pathname !== "/api/v1" &&
    url.pathname !== "/api/v1/"
  )
    throw new Error(
      "Use the installation origin, optionally followed by /api/v1.",
    );
  return `${url.origin}/api/v1`;
}
