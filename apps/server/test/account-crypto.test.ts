import { describe, it, expect } from "vitest";
import {
  totp,
  encodeBase32,
  matchTotp,
  AccountVault,
} from "../src/account/account-crypto.util.js";
import { randomBytes } from "node:crypto";
describe("account cryptography", () => {
  it("matches RFC 6238 SHA1 vectors and rejects stale/replayed/malformed codes", () => {
    const secret = encodeBase32(Buffer.from("12345678901234567890"));
    for (const [time, code] of [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
      [20000000000, "65353130"],
    ] as const)
      expect(totp(secret, Math.floor(time / 30), 8)).toBe(code);
    const now = 59000;
    const code = totp(secret, 1);
    expect(matchTotp(secret, code, now, -1)).toBe(1);
    expect(matchTotp(secret, code, now, 1)).toBeNull();
    expect(matchTotp(secret, "abc123", now, -1)).toBeNull();
  });
  it("binds encrypted secrets to user and purpose and fails closed without key", () => {
    const vault = new AccountVault(randomBytes(32).toString("base64"));
    const encrypted = vault.encrypt("secret", "user-a", "pending");
    expect(encrypted).not.toContain("secret");
    expect(vault.decrypt(encrypted, "user-a", "pending")).toBe("secret");
    expect(() => vault.decrypt(encrypted, "user-b", "pending")).toThrow();
    expect(() => vault.decrypt(encrypted, "user-a", "active")).toThrow();
    expect(() =>
      new AccountVault().encrypt("secret", "user", "pending"),
    ).toThrow();
  });
});
