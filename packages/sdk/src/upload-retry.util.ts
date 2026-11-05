import { AgentStackError } from "./errors.errors.js";

const MAX_UPLOAD_ATTEMPTS = 5;
const MAX_RETRY_WAIT_MS = 120_000;

/** Parse only scheduling metadata; never retain an upstream error body or raw header. */
export function parseRetryAfter(
  value: string | null,
  now = Date.now(),
): number | undefined {
  if (!value || value.length > 200) return undefined;
  const text = value.trim();
  if (/^\d+$/.test(text)) {
    const milliseconds = Number(text) * 1000;
    return Number.isFinite(milliseconds) ? milliseconds : undefined;
  }
  if (!text.includes(":")) return undefined;
  const date = Date.parse(text);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

export async function waitForRetry(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(
        signal?.reason ??
          new DOMException("The operation was aborted.", "AbortError"),
      );
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** File POST only: the server deduplicates identical content and an explicit 429 rejected the attempt. */
export async function retryRateLimitedUpload<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    signal?.throwIfAborted();
    try {
      return await operation();
    } catch (error) {
      if (
        !(error instanceof AgentStackError) ||
        error.status !== 429 ||
        attempt >= MAX_UPLOAD_ATTEMPTS
      )
        throw error;
      const delay =
        error.retryAfterMs ?? Math.min(1000 * 2 ** (attempt - 1), 30_000);
      // Do not retry earlier than the server requests just to fit our wait budget.
      if (delay > MAX_RETRY_WAIT_MS) throw error;
      await waitForRetry(delay, signal);
    }
  }
}
