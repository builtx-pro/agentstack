import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { RepositoryCredentialVault } from "../src/repositories/credential-vault.service.js";
describe("repository credential encryption", () => {
  it("uses fresh nonces and authenticates project/connection boundaries", () => {
    const v = new RepositoryCredentialVault(randomBytes(32).toString("base64")),
      a = v.encrypt("synthetic-secret", "p", "r"),
      b = v.encrypt("synthetic-secret", "p", "r");
    expect(a).not.toBe(b);
    expect(a).not.toContain("synthetic-secret");
    expect(v.decrypt(a, "p", "r")).toBe("synthetic-secret");
    expect(() => v.decrypt(a, "other", "r")).toThrow();
    expect(() => v.decrypt(a, "p", "other")).toThrow();
    expect(() => v.decrypt(a.slice(0, -3) + "bad", "p", "r")).toThrow();
  });
  it("fails closed when key is absent or malformed", () => {
    expect(() => new RepositoryCredentialVault("bad")).toThrow();
    expect(() =>
      new RepositoryCredentialVault().encrypt("x", "p", "r"),
    ).toThrow();
  });
});
