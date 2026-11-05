import {
  createHmac,
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { AppError } from "../shared/errors.js";
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function encodeBase32(bytes: Buffer) {
  let value = 0,
    bits = 0,
    result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
function decodeBase32(secret: string) {
  let value = 0,
    bits = 0;
  const bytes: number[] = [];
  for (const ch of secret) {
    const n = alphabet.indexOf(ch);
    if (n < 0) throw new Error("Invalid TOTP encoding");
    value = (value << 5) | n;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
export function totp(secret: string, counter: number, digits = 6) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret))
    .update(bytes)
    .digest();
  const offset = digest[digest.length - 1]! & 15;
  return String(
    (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits,
  ).padStart(digits, "0");
}
export function matchTotp(
  secret: string,
  code: string,
  now = Date.now(),
  last = -1,
) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const counter of [current, current - 1, current + 1]) {
    if (counter < 0 || counter <= last) continue;
    if (timingSafeEqual(Buffer.from(totp(secret, counter)), Buffer.from(code)))
      return counter;
  }
  return null;
}
export class AccountVault {
  private key?: Buffer;
  constructor(encoded?: string) {
    if (encoded) {
      const key = Buffer.from(encoded, "base64");
      if (key.length !== 32 || key.toString("base64") !== encoded)
        throw new Error("Invalid account encryption key");
      this.key = Buffer.from(
        hkdfSync(
          "sha256",
          key,
          Buffer.from("agentstack:account:v1"),
          Buffer.from("totp-secrets"),
          32,
        ),
      );
    }
  }
  get available() {
    return !!this.key;
  }
  private requireKey() {
    if (!this.key)
      throw new AppError(
        503,
        "account_key_missing",
        "Account encryption is unavailable. Contact the installation administrator.",
      );
    return this.key;
  }
  encrypt(secret: string, userId: string, purpose: "pending" | "active") {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.requireKey(), nonce);
    cipher.setAAD(Buffer.from(`agentstack:account:v1:${userId}:${purpose}`));
    const bytes = Buffer.concat([
      cipher.update(secret, "utf8"),
      cipher.final(),
    ]);
    return [nonce, cipher.getAuthTag(), bytes]
      .map((v) => v.toString("base64"))
      .join(".");
  }
  decrypt(value: string, userId: string, purpose: "pending" | "active") {
    const key = this.requireKey();
    try {
      const parts = value.split(".");
      if (parts.length !== 3) throw Error();
      const [nonce, tag, bytes] = parts.map((v) => Buffer.from(v, "base64"));
      if (nonce!.length !== 12 || tag!.length !== 16) throw Error();
      const cipher = createDecipheriv("aes-256-gcm", key, nonce!);
      cipher.setAAD(Buffer.from(`agentstack:account:v1:${userId}:${purpose}`));
      cipher.setAuthTag(tag!);
      return Buffer.concat([cipher.update(bytes!), cipher.final()]).toString(
        "utf8",
      );
    } catch {
      throw new AppError(
        503,
        "account_secret_unavailable",
        "Account security could not be read. Restore the matching installation encryption key.",
      );
    }
  }
}
