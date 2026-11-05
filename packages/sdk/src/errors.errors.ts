const messages: Record<string, string> = {
  unauthorized: "Authentication failed. Check or rotate the configured token.",
  forbidden: "This operation is not permitted by the current credentials.",
  not_found: "The requested resource is unavailable.",
  version_conflict:
    "The resource changed. Read its current version before retrying.",
  conflict: "The operation conflicts with current server state.",
  validation_error: "The request did not match the server contract.",
  invalid_request: "The request is invalid.",
  invalid_input: "The request did not match the API input contract.",
  upload_first: "Upload declared files before applying the manifest.",
  rate_limited: "The server rate limit was reached. Retry later.",
  invalid_response:
    "The server returned a response outside the supported contract.",
  response_too_large: "The response exceeded the configured safe size limit.",
  pagination_cycle:
    "The server repeated a pagination cursor; collection was stopped.",
  pagination_limit:
    "The collection page limit was reached. Narrow the query or explicitly raise the limit.",
  network_error: "The server could not be reached securely.",
  repository_snapshot_too_large: "The repository snapshot is too large. Narrow its configured roots before retrying.",
  timeout: "The request timed out.",
};
export class AgentStackError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
    public readonly retryAfterMs?: number,
  ) {
    super(
      messages[code] ??
        `The API request failed${status ? ` (HTTP ${status})` : ""}.`,
    );
    this.name = "AgentStackError";
  }
}
export function safeApiError(
  status: number,
  body: unknown,
  retryAfterMs?: number,
): AgentStackError {
  const fallback =
    status === 401
      ? "unauthorized"
      : status === 403
        ? "forbidden"
        : status === 404
          ? "not_found"
          : status === 409
            ? "conflict"
            : status === 429
              ? "rate_limited"
              : "api_error";
  const candidate =
    typeof body === "object" &&
    body &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error &&
    "code" in body.error
      ? body.error.code
      : undefined;
  const code =
    typeof candidate === "string" && Object.hasOwn(messages, candidate)
      ? candidate
      : fallback;
  return new AgentStackError(code, status, retryAfterMs);
}
