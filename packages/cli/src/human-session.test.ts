import { describe, it, expect } from "vitest";
import { parseHumanInput } from "./human-session.service.js";
describe("explicit MFA stdin", () => {
  it("keeps one-line password behavior and only permits a factor when opted in", () => {
    expect(parseHumanInput("a password")).toEqual({ password: "a password" });
    expect(() => parseHumanInput("a password\n123456")).toThrow("exactly one");
    expect(parseHumanInput("a password\n123456", true)).toEqual({
      password: "a password",
      mfaCode: "123456",
    });
    expect(
      parseHumanInput("a password\nABCDE-12345-ABCDE-12345", true).mfaCode,
    ).toBe("ABCDE-12345-ABCDE-12345");
  });
  it("rejects missing or extra lines without echoing secrets", () => {
    for (const value of [
      "private",
      "private\n",
      "private\n123456\nextra",
      "private\rsecret\n123456",
    ])
      expect(() => parseHumanInput(value, true)).toThrow();
  });
});
