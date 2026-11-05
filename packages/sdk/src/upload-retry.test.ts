import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentStackClient } from "./client.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const fileResult = {
  id: projectId,
  name: "sample.png",
  mimeType: "image/png",
  size: 1,
  sha256: "0".repeat(64),
  url: "/api/v1/files/sample",
};
const upload = (fetch: typeof globalThis.fetch, signal?: AbortSignal) =>
  new AgentStackClient({
    baseUrl: "http://127.0.0.1:4300",
    token: "synthetic-token",
    fetch,
  }).uploadFile(
    projectId,
    new Blob(["x"], { type: "image/png" }),
    "sample.png",
    { signal },
  );
const limited = (retryAfter?: string) =>
  Response.json(
    { error: { code: "rate_limited", message: "secret-must-not-be-echoed" } },
    {
      status: 429,
      headers: retryAfter === undefined ? {} : { "Retry-After": retryAfter },
    },
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-05T10:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("file upload rate-limit recovery", () => {
  it.each(["2", "Thu, 05 Nov 2026 10:00:02 GMT"])(
    "waits for Retry-After %s before retrying an explicit 429",
    async (retryAfter) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(limited(retryAfter))
        .mockResolvedValueOnce(Response.json(fileResult, { status: 201 }));
      const result = upload(fetch);
      void result.catch(() => undefined);
      await vi.advanceTimersByTimeAsync(1999);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toMatchObject({ id: projectId });
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it("cancels the wait and does not send another upload", async () => {
    const controller = new AbortController();
    const fetch = vi.fn(async () => limited("60"));
    const result = upload(fetch, controller.signal);
    void result.catch(() => undefined);
    const rejected = expect(result).rejects.toMatchObject({
      name: "AbortError",
    });
    void rejected.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await rejected;
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("stops after five total attempts with a safe rate-limit error", async () => {
    const fetch = vi.fn(async () => limited("0"));
    const result = upload(fetch);
    void result.catch(() => undefined);
    const rejected = expect(result).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
    });
    await vi.runAllTimersAsync();
    await rejected;
    expect(fetch).toHaveBeenCalledTimes(5);
    await expect(result).rejects.not.toThrow("secret-must-not-be-echoed");
  });

  it("does not retry earlier when the requested wait exceeds the bounded policy", async () => {
    const fetch = vi.fn(async () => limited("121"));
    await expect(upload(fetch)).rejects.toMatchObject({ status: 429 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uses bounded exponential delays when Retry-After is missing", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(limited())
      .mockResolvedValueOnce(limited())
      .mockResolvedValueOnce(Response.json(fileResult));
    const result = upload(fetch);
    void result.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toMatchObject({ id: projectId });
  });

  it.each(["network", "server"])(
    "does not retry an uncertain %s failure",
    async (failure) => {
      const fetch = vi.fn(async () => {
        if (failure === "network") throw new Error("unknown write outcome");
        return Response.json(
          { error: { code: "internal_error" } },
          { status: 500 },
        );
      });
      await expect(upload(fetch)).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("does not add retries to other write operations", async () => {
    const fetch = vi.fn(async () => limited("0"));
    const client = new AgentStackClient({
      baseUrl: "http://127.0.0.1:4300",
      token: "synthetic-token",
      fetch,
    });
    await expect(
      client.transition(projectId, projectId, {
        expectedVersion: 1,
        action: "claim",
      }),
    ).rejects.toMatchObject({ status: 429 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
