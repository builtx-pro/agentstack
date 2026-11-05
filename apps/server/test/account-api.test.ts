import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { buildApp } from "../src/app.js";
import { migrate } from "../src/db/migrate.js";
import { hashPassword, hashToken } from "../src/shared/crypto.util.js";
import { totp } from "../src/account/account-crypto.util.js";
let app: Awaited<ReturnType<typeof buildApp>>,
  owner: Pool,
  storage: string,
  passwordHash: string;
const password = "synthetic-account-password-123",
  origin = "http://localhost:4100";
let requestIp = 1;
const req = (method: string, path: string, body?: unknown, cookie?: string) =>
  app.inject({
    method: method as "GET",
    url: "/api/v1" + path,
    payload: body === undefined ? undefined : JSON.stringify(body),
    remoteAddress: `127.0.0.${(requestIp++ % 250) + 1}`,
    headers: {
      "content-type": "application/json",
      origin,
      "x-agentstack-request": "1",
      ...(cookie ? { cookie } : {}),
    },
  });
const cookieOf = (r: any) => String(r.headers["set-cookie"]).split(";")[0]!;
async function actor() {
  const id = randomUUID(),
    email = `account-${id}@example.test`;
  await owner.query(
    "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)",
    [id, email, "Account tester", passwordHash],
  );
  const login = await req("POST", "/auth/login", { email, password });
  expect(login.statusCode, login.body).toBe(200);
  return { id, email, cookie: cookieOf(login) };
}
async function enable(a: Awaited<ReturnType<typeof actor>>) {
  const setup = await req("POST", "/account/mfa/setup", { password }, a.cookie);
  expect(setup.statusCode, setup.body).toBe(200);
  const confirmedCode = totp(
    setup.json().secret,
    Math.floor(Date.now() / 30000),
  );
  const result = await req(
    "POST",
    "/account/mfa/confirm",
    { code: confirmedCode },
    a.cookie,
  );
  expect(result.statusCode, result.body).toBe(200);
  return { ...result.json(), secret: setup.json().secret, confirmedCode };
}
beforeAll(async () => {
  if (!process.env.TEST_DATABASE_OWNER_URL)
    throw Error("Use isolated test runner");
  await migrate(
    process.env.TEST_DATABASE_OWNER_URL,
    process.env.APP_DATABASE_PASSWORD!,
  );
  owner = new Pool({ connectionString: process.env.TEST_DATABASE_OWNER_URL });
  passwordHash = await hashPassword(password);
  storage = await mkdtemp(join(tmpdir(), "agentstack-account-"));
  app = await buildApp({
    databaseUrl: process.env.TEST_DATABASE_URL!,
    allowedOrigin: origin,
    storageDir: storage,
    secureCookies: false,
    logger: false,
    repositoryEncryptionKey: randomBytes(32).toString("base64"),
    authRateLimit: 1000,
    apiRateLimit: 10000,
  });
});
afterAll(async () => {
  await app?.close();
  await owner?.end();
  if (storage) await rm(storage, { recursive: true, force: true });
});
describe("personal account API", () => {
  it("persists own preferences/name with CAS and keeps safe private history", async () => {
    const a = await actor(),
      b = await actor();
    const initial = (await req("GET", "/account", undefined, a.cookie)).json();
    expect(initial.preferences).toEqual({
      locale: null,
      theme: "auto",
      accent: "#7950f2",
      onboardingCompleted: false,
    });
    const update = await req(
      "PATCH",
      "/account",
      {
        expectedVersion: initial.version,
        name: "New reviewer",
        preferences: {
          locale: "ru",
          theme: "dark",
          accent: "#AABBCC",
          onboardingCompleted: true,
        },
      },
      a.cookie,
    );
    expect(update.statusCode, update.body).toBe(200);
    expect(update.json().preferences.accent).toBe("#aabbcc");
    expect(update.json().user.name).toBe("New reviewer");
    expect(
      (
        await req(
          "PATCH",
          "/account",
          { expectedVersion: initial.version, name: "Stale" },
          a.cookie,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (await req("GET", "/account", undefined, b.cookie)).json().user.name,
    ).toBe("Account tester");
    const history = (
      await req("GET", "/account/history", undefined, a.cookie)
    ).json();
    expect(history.items).toHaveLength(1);
    expect(JSON.stringify(history)).not.toMatch(
      /password_hash|mfa_secret|recovery_hashes/,
    );
    expect(
      (
        await req(
          "PATCH",
          "/account",
          {
            expectedVersion: 2,
            preferences: { accent: "url(javascript:alert(1))" },
          },
          a.cookie,
        )
      ).statusCode,
    ).toBe(400);
  });
  it("rejects anonymous requests and cross-origin writes", async () => {
    expect((await req("GET", "/account")).statusCode).toBe(401);
    const a = await actor();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/account",
      headers: {
        cookie: a.cookie,
        "content-type": "application/json",
        origin: "https://evil.example",
        "x-agentstack-request": "1",
      },
      payload: JSON.stringify({ expectedVersion: 1, name: "Forged" }),
    });
    expect(response.statusCode).toBe(403);
  });
  it("accepts and normalizes real avatars, rejects SVG/malformed data and protects versions", async () => {
    const a = await actor();
    const png = await sharp({
      create: { width: 40, height: 25, channels: 3, background: "#7950f2" },
    })
      .png()
      .toBuffer();
    async function upload(bytes: Buffer, version = 1) {
      const boundary = "account-test";
      return app.inject({
        method: "PUT",
        url: `/api/v1/account/avatar?expectedVersion=${version}`,
        headers: {
          cookie: a.cookie,
          origin,
          "x-agentstack-request": "1",
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload: Buffer.concat([
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="avatar.png"\r\nContent-Type: image/png\r\n\r\n`,
          ),
          bytes,
          Buffer.from(`\r\n--${boundary}--\r\n`),
        ]),
      });
    }
    const result = await upload(png);
    expect(result.statusCode, result.body).toBe(200);
    const avatar = await req("GET", "/account/avatar", undefined, a.cookie);
    expect(avatar.headers["content-type"]).toContain("image/webp");
    expect((await sharp(avatar.rawPayload).metadata()).width).toBe(256);
    expect((await upload(png)).statusCode).toBe(409);
    expect(
      (
        await upload(
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
          2,
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (await upload(Buffer.alloc(2 * 1024 * 1024 + 1), 2)).statusCode,
    ).toBe(413);
    expect(
      (await req("DELETE", "/account/avatar?expectedVersion=2", {}, a.cookie))
        .statusCode,
    ).toBe(200);
    expect(
      (await req("GET", "/account/avatar", undefined, a.cookie)).statusCode,
    ).toBe(404);
  });
  it("completes MFA login only after proof, rejects TOTP replay and one-use recovery races", async () => {
    const a = await actor();
    const second = await req("POST", "/auth/login", {
      email: a.email,
      password,
    });
    const enrolled = await enable(a);
    expect(enrolled.recoveryCodes).toHaveLength(10);
    expect(
      (await req("GET", "/account", undefined, cookieOf(second))).statusCode,
    ).toBe(401);
    const login = await req("POST", "/auth/login", {
      email: a.email,
      password,
    });
    expect(login.json().mfaRequired).toBe(true);
    expect(login.headers["set-cookie"]).toBeUndefined();
    const replay = await req("POST", "/auth/mfa/verify", {
      challenge: login.json().challenge,
      code: enrolled.confirmedCode,
    });
    expect(replay.statusCode).toBe(401);
    const requests = await Promise.all(
      [1, 2].map(() =>
        req("POST", "/auth/mfa/verify", {
          challenge: login.json().challenge,
          code: enrolled.recoveryCodes[0],
        }),
      ),
    );
    expect(requests.map((r) => r.statusCode).sort()).toEqual([200, 401]);
    const success = requests.find((r) => r.statusCode === 200)!;
    expect(
      (await req("GET", "/account", undefined, cookieOf(success))).json()
        .recoveryCodesRemaining,
    ).toBe(9);
    const next = await req("POST", "/auth/login", { email: a.email, password });
    expect(
      (
        await req("POST", "/auth/mfa/verify", {
          challenge: next.json().challenge,
          code: enrolled.recoveryCodes[0],
        })
      ).statusCode,
    ).toBe(401);
    const raw = (
      await owner.query("SELECT * FROM account_profiles WHERE user_id=$1", [
        a.id,
      ])
    ).rows[0];
    expect(JSON.stringify(raw)).not.toContain(enrolled.secret);
    expect(JSON.stringify(raw)).not.toContain(enrolled.recoveryCodes[0]);
  });
  it("persists failed factor attempts across newly created challenges and enforces expiry", async () => {
    const a = await actor();
    await enable(a);
    for (let i = 0; i < 5; i++) {
      const login = await req("POST", "/auth/login", {
        email: a.email,
        password,
      });
      expect(login.statusCode).toBe(200);
      expect(
        (
          await req("POST", "/auth/mfa/verify", {
            challenge: login.json().challenge,
            code: "not-a-code",
          })
        ).statusCode,
      ).toBe(401);
    }
    expect(
      (await req("POST", "/auth/login", { email: a.email, password }))
        .statusCode,
    ).toBe(429);
    await owner.query(
      "UPDATE account_profiles SET locked_until=now()-interval '1 second',failed_attempts=0 WHERE user_id=$1",
      [a.id],
    );
    const login = await req("POST", "/auth/login", {
      email: a.email,
      password,
    });
    await owner.query(
      "UPDATE account_challenges SET expires_at=now()-interval '1 second' WHERE user_id=$1",
      [a.id],
    );
    expect(
      (
        await req("POST", "/auth/mfa/verify", {
          challenge: login.json().challenge,
          code: "not-a-code",
        })
      ).statusCode,
    ).toBe(401);
  });
  it("requires password and factor to replace or disable MFA and invalidates old recovery codes", async () => {
    const a = await actor();
    const enrolled = await enable(a);
    expect(
      (
        await req(
          "POST",
          "/account/mfa/disable",
          { password, code: "not-a-code" },
          a.cookie,
        )
      ).statusCode,
    ).toBe(401);
    const replaced = await req(
      "POST",
      "/account/mfa/recovery-codes",
      { password, code: enrolled.recoveryCodes[0] },
      a.cookie,
    );
    expect(replaced.statusCode, replaced.body).toBe(200);
    expect(
      (
        await req(
          "POST",
          "/account/mfa/disable",
          { password, code: enrolled.recoveryCodes[1] },
          a.cookie,
        )
      ).statusCode,
    ).toBe(401);
    const disabled = await req(
      "POST",
      "/account/mfa/disable",
      { password, code: replaced.json().recoveryCodes[0] },
      a.cookie,
    );
    expect(disabled.statusCode, disabled.body).toBe(200);
    expect(disabled.json().account.mfaEnabled).toBe(false);
    expect(
      (await req("POST", "/auth/login", { email: a.email, password })).json()
        .mfaRequired,
    ).toBeUndefined();
  });
  it("revokes only owned sessions and password changes revoke all sessions and challenges", async () => {
    const a = await actor(),
      b = await actor();
    const second = cookieOf(
      await req("POST", "/auth/login", { email: a.email, password }),
    );
    const bSession = (
      await req("GET", "/account/sessions", undefined, b.cookie)
    ).json().items[0];
    expect(
      (await req("DELETE", `/account/sessions/${bSession.id}`, {}, a.cookie))
        .statusCode,
    ).toBe(404);
    const sessions = (
      await req("GET", "/account/sessions", undefined, a.cookie)
    ).json().items;
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((r: any) => r.current)).toHaveLength(1);
    expect(JSON.stringify(sessions)).not.toContain("hash");
    expect(
      (await req("POST", "/account/sessions/revoke-others", {}, a.cookie))
        .statusCode,
    ).toBe(200);
    expect((await req("GET", "/account", undefined, second)).statusCode).toBe(
      401,
    );
    expect(
      (
        await req(
          "POST",
          "/account/password",
          { password, newPassword: "new-synthetic-password-123" },
          a.cookie,
        )
      ).statusCode,
    ).toBe(200);
    expect((await req("GET", "/account", undefined, a.cookie)).statusCode).toBe(
      401,
    );
    expect(
      (await req("POST", "/auth/login", { email: a.email, password }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await req("POST", "/auth/login", {
          email: a.email,
          password: "new-synthetic-password-123",
        })
      ).statusCode,
    ).toBe(200);
  });
  it("enforces row-level isolation with positive owner control and immutable history", async () => {
    const a = await actor(),
      b = await actor();
    await req(
      "PATCH",
      "/account",
      { expectedVersion: 1, name: "Own history" },
      a.cookie,
    );
    const restricted = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const db = await restricted.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('agentstack.user_id',$1,true)", [a.id]);
      expect(
        (
          await db.query(
            "SELECT user_id FROM account_profiles WHERE user_id=$1",
            [a.id],
          )
        ).rowCount,
      ).toBe(1);
      expect(
        (
          await db.query(
            "SELECT user_id FROM account_profiles WHERE user_id=$1",
            [b.id],
          )
        ).rowCount,
      ).toBe(0);
      expect(
        (
          await db.query("SELECT id FROM account_history WHERE user_id=$1", [
            a.id,
          ])
        ).rowCount,
      ).toBe(1);
      await expect(
        db.query("DELETE FROM account_history WHERE user_id=$1", [a.id]),
      ).rejects.toThrow();
      await db.query("ROLLBACK");
    } finally {
      db.release();
      await restricted.end();
    }
  });
  it("forbids valid agent tokens on every personal account surface", async () => {
    const a = await actor(),
      project = randomUUID(),
      token = randomBytes(32).toString("base64url");
    await owner.query("INSERT INTO projects(id,name,slug) VALUES($1,$2,$3)", [
      project,
      "Synthetic account scope",
      project,
    ]);
    await owner.query(
      "INSERT INTO tokens(id,project_id,user_id,hash,name,scopes,expires_at) VALUES($1,$2,$3,$4,'Synthetic',ARRAY['read'],now()+interval '1 hour')",
      [randomUUID(), project, a.id, hashToken(token)],
    );
    for (const path of [
      "/account",
      "/account/sessions",
      "/account/avatar",
      "/account/history",
    ]) {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1" + path,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode, response.body).toBe(403);
    }
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/account",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      payload: JSON.stringify({ expectedVersion: 1, name: "Forbidden" }),
    });
    expect(response.statusCode).toBe(403);
  });
  it("expires pending setup and invalidates it after credential changes", async () => {
    const a = await actor();
    const setup = await req(
      "POST",
      "/account/mfa/setup",
      { password },
      a.cookie,
    );
    expect(setup.statusCode).toBe(200);
    await owner.query(
      "UPDATE account_profiles SET pending_expires_at=now()-interval '1 second' WHERE user_id=$1",
      [a.id],
    );
    expect(
      (
        await req(
          "POST",
          "/account/mfa/confirm",
          { code: totp(setup.json().secret, Math.floor(Date.now() / 30000)) },
          a.cookie,
        )
      ).statusCode,
    ).toBe(409);
    await req("POST", "/account/mfa/setup", { password }, a.cookie);
    await owner.query("UPDATE users SET version=version+1 WHERE id=$1", [a.id]);
    expect(
      (await req("POST", "/account/mfa/confirm", { code: "123456" }, a.cookie))
        .statusCode,
    ).toBe(409);
  });
  it("requires the factor for password change and invalidates outstanding challenges", async () => {
    const a = await actor();
    const enabled = await enable(a);
    const challenge = await req("POST", "/auth/login", {
      email: a.email,
      password,
    });
    expect(
      (
        await req(
          "POST",
          "/account/password",
          { password, newPassword: "new-protected-password" },
          a.cookie,
        )
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await req(
          "POST",
          "/account/password",
          {
            password,
            newPassword: "new-protected-password",
            code: enabled.recoveryCodes[0],
          },
          a.cookie,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await req("POST", "/auth/mfa/verify", {
          challenge: challenge.json().challenge,
          code: enabled.recoveryCodes[1],
        })
      ).statusCode,
    ).toBe(401);
  });
  it("accepts a fresh authenticator step once and fails closed when its key is unavailable", async () => {
    const a = await actor();
    const enrolled = await enable(a);
    const fresh = totp(enrolled.secret, Math.floor(Date.now() / 30000) + 1);
    const login = await req("POST", "/auth/login", {
      email: a.email,
      password,
    });
    const verified = await req("POST", "/auth/mfa/verify", {
      challenge: login.json().challenge,
      code: fresh,
    });
    expect(verified.statusCode, verified.body).toBe(200);
    const next = await req("POST", "/auth/login", { email: a.email, password });
    expect(
      (
        await req("POST", "/auth/mfa/verify", {
          challenge: next.json().challenge,
          code: fresh,
        })
      ).statusCode,
    ).toBe(401);
    const noKey = await buildApp({
      databaseUrl: process.env.TEST_DATABASE_URL!,
      allowedOrigin: origin,
      storageDir: storage,
      secureCookies: false,
      logger: false,
    });
    try {
      const response = await noKey.inject({
        method: "POST",
        url: "/api/v1/auth/mfa/verify",
        headers: {
          origin,
          "x-agentstack-request": "1",
          "content-type": "application/json",
        },
        payload: JSON.stringify({
          challenge: next.json().challenge,
          code: enrolled.confirmedCode,
        }),
      });
      expect(response.statusCode).toBe(503);
      expect(response.body).not.toContain(enrolled.secret);
    } finally {
      await noKey.close();
    }
  });
  it("does not overwrite a name changed concurrently by an administrator", async () => {
    const a = await actor();
    const before = (await req("GET", "/account", undefined, a.cookie)).json();
    await owner.query(
      "UPDATE users SET name='Changed by administrator',version=version+1 WHERE id=$1",
      [a.id],
    );
    const stale = await req(
      "PATCH",
      "/account",
      { expectedVersion: before.version, name: "Old tab name" },
      a.cookie,
    );
    expect(stale.statusCode).toBe(409);
    expect(
      (await req("GET", "/account", undefined, a.cookie)).json().user.name,
    ).toBe("Changed by administrator");
  });
});
