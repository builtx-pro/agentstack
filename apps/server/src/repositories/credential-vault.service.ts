import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "../shared/errors.js";
export class RepositoryCredentialVault {
  private readonly key?: Buffer;
  constructor(value?: string) {
    if (value) {
      const key = Buffer.from(value, "base64");
      if (key.length !== 32 || key.toString("base64") !== value)
        throw new Error(
          "REPOSITORY_ENCRYPTION_KEY must be a canonical base64-encoded 32-byte key",
        );
      this.key = key;
    }
  }
  encrypt(secret: string, projectId: string, connectionId: string) {
    if (!this.key)
      throw new AppError(
        503,
        "repository_key_missing",
        "Configure the repository encryption key before adding private credentials.",
      );
    const nonce = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    cipher.setAAD(
      Buffer.from(`agentstack:repository:v1:${projectId}:${connectionId}`),
    );
    const encrypted = Buffer.concat([
      cipher.update(secret, "utf8"),
      cipher.final(),
    ]);
    return [
      "v1",
      nonce.toString("base64"),
      cipher.getAuthTag().toString("base64"),
      encrypted.toString("base64"),
    ].join(".");
  }
  decrypt(value: string, projectId: string, connectionId: string) {
    if (!this.key)
      throw new AppError(
        503,
        "repository_key_missing",
        "The repository encryption key is unavailable.",
      );
    try {
      const [version, nonce, tag, ciphertext, ...rest] = value.split(".");
      if (version !== "v1" || rest.length || !nonce || !tag || !ciphertext)
        throw Error();
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        Buffer.from(nonce, "base64"),
      );
      decipher.setAAD(
        Buffer.from(`agentstack:repository:v1:${projectId}:${connectionId}`),
      );
      decipher.setAuthTag(Buffer.from(tag, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new AppError(
        503,
        "repository_credential_unavailable",
        "The repository credential could not be decrypted. Restore the matching encryption key or replace the credential.",
      );
    }
  }
}
