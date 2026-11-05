import { describe, expect, it, vi } from "vitest";
import { createHumanSession } from "./human-session.service.js";
const projectId = "11111111-1111-4111-8111-111111111111";
describe("explicit human CLI session", () => {
  it("keeps the cookie in memory and logs out through the same origin", async () => {
    const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Origin")).toBe("http://127.0.0.1:4300");
      expect(headers.get("X-AgentStack-Request")).toBe("1");
      expect(headers.get("Authorization")).toBeNull();
      expect(init?.redirect).toBe("error");
      if (String(url).endsWith("/auth/login"))
        return Response.json(
          { user: { id: projectId } },
          {
            headers: {
              "Set-Cookie":
                "agentstack_session=synthetic-session; HttpOnly; Path=/; SameSite=Strict",
            },
          },
        );
      expect(headers.get("Cookie")).toBe(
        "agentstack_session=synthetic-session",
      );
      if (String(url).endsWith("/auth/logout"))
        return Response.json({ ok: true });
      return Response.json({ items: [], nextCursor: null });
    });
    const session = await createHumanSession({
      baseUrl: "http://127.0.0.1:4300",
      email: "operator@example.test",
      password: "synthetic-input-only",
      fetch,
    });
    await session.client.projects();
    await session.logout();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(session).not.toHaveProperty("cookie");
  });
  it("does not echo login response bodies on failure", async () => {
    await expect(
      createHumanSession({
        baseUrl: "http://127.0.0.1:4300",
        email: "operator@example.test",
        password: "secret-value",
        fetch: async () =>
          Response.json({ password: "secret-value" }, { status: 401 }),
      }),
    ).rejects.toThrow("Authentication failed");
  });
});
