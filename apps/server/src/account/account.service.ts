import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Account } from "@agentstack/contracts";
import type { Database, Principal } from "../db/database.service.js";
import { AppError, conflict, forbidden, missing } from "../shared/errors.js";
import {
  hashPassword,
  hashToken,
  newSecret,
  verifyPassword,
} from "../shared/crypto.util.js";
import { publicUser } from "../auth/auth.service.js";
import {
  AccountVault,
  encodeBase32,
  matchTotp,
} from "./account-crypto.util.js";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
type Row = Record<string, any>;
const badFactor = () =>
  new AppError(
    401,
    "invalid_factor",
    "The verification code is invalid, expired or already used.",
  );
export const accountHuman = (p: Principal) => {
  if (p.type !== "human") throw forbidden();
  return p;
};
async function loadLocked(db: PoolClient, id: string) {
  const user = (
    await db.query(
      "SELECT * FROM users WHERE id=$1 AND NOT disabled FOR UPDATE",
      [id],
    )
  ).rows[0];
  if (!user) throw missing();
  await db.query(
    "INSERT INTO account_profiles(user_id) VALUES($1) ON CONFLICT DO NOTHING",
    [id],
  );
  const profile = (
    await db.query(
      "SELECT * FROM account_profiles WHERE user_id=$1 FOR UPDATE",
      [id],
    )
  ).rows[0];
  return { user, profile };
}
function accountVersion(user: Row, p: Row) {
  return Number(user.version) + Number(p.version) - 1;
}
export function serializeAccount(user: Row, p: Row): Account {
  return {
    user: publicUser(user),
    version: accountVersion(user, p),
    preferences: {
      locale: p.locale,
      theme: p.theme,
      accent: p.accent,
      onboardingCompleted: p.onboarding_completed,
    },
    avatarUrl: p.avatar_hash
      ? `/api/v1/account/avatar?v=${accountVersion(user, p)}`
      : null,
    mfaEnabled: !!p.mfa_secret,
    recoveryCodesRemaining: p.recovery_hashes.length,
  };
}
async function history(db: PoolClient, user: Row, p: Row, action: string) {
  const snapshot = {
    name: user.name,
    preferences: {
      locale: p.locale,
      theme: p.theme,
      accent: p.accent,
      onboardingCompleted: p.onboarding_completed,
    },
    hasAvatar: !!p.avatar_hash,
    avatarHash: p.avatar_hash,
    mfaEnabled: !!p.mfa_secret,
  };
  await db.query(
    "INSERT INTO account_history(id,user_id,version,action,snapshot) VALUES($1,$2,$3,$4,$5)",
    [
      randomUUID(),
      user.id,
      accountVersion(user, p),
      action,
      JSON.stringify(snapshot),
    ],
  );
}
async function bump(db: PoolClient, user: Row, action: string) {
  const p = (
    await db.query(
      "UPDATE account_profiles SET version=version+1,updated_at=now() WHERE user_id=$1 RETURNING *",
      [user.id],
    )
  ).rows[0];
  await history(db, user, p, action);
  return serializeAccount(user, p);
}
export async function getAccount(database: Database, principal: Principal) {
  accountHuman(principal);
  return database.transaction(principal, async (db) => {
    const { user, profile } = await loadLocked(db, principal.id);
    return serializeAccount(user, profile);
  });
}
export async function patchAccount(
  database: Database,
  principal: Principal,
  input: {
    expectedVersion: number;
    name?: string;
    preferences?: Partial<Account["preferences"]>;
  },
) {
  accountHuman(principal);
  return database.transaction(principal, async (db) => {
    let { user, profile } = await loadLocked(db, principal.id);
    if (accountVersion(user, profile) !== input.expectedVersion)
      throw conflict();
    const prefs = input.preferences ?? {};
    if (input.name !== undefined && input.name !== user.name)
      user = (
        await db.query(
          "UPDATE users SET name=$2,version=version+1 WHERE id=$1 RETURNING *",
          [principal.id, input.name],
        )
      ).rows[0];
    await db.query(
      "UPDATE account_profiles SET locale=$2,theme=$3,accent=$4,onboarding_completed=$5 WHERE user_id=$1",
      [
        principal.id,
        prefs.locale === undefined ? profile.locale : prefs.locale,
        prefs.theme ?? profile.theme,
        prefs.accent?.toLowerCase() ?? profile.accent,
        prefs.onboardingCompleted ?? profile.onboarding_completed,
      ],
    );
    return bump(db, user, "profile.updated");
  });
}
async function passwordProof(user: Row, password: string) {
  if (!(await verifyPassword(password, user.password_hash)))
    throw new AppError(
      401,
      "invalid_credentials",
      "The current password is incorrect.",
    );
}
function ensureUnlocked(p: Row) {
  if (p.locked_until && new Date(p.locked_until).getTime() > Date.now())
    throw new AppError(
      429,
      "factor_locked",
      "Too many verification attempts. Try again in 15 minutes.",
    );
}
async function failFactor(db: PoolClient, p: Row) {
  await db.query(
    "UPDATE account_profiles SET failed_attempts=CASE WHEN locked_until IS NOT NULL AND locked_until<=now() THEN 1 ELSE failed_attempts+1 END,locked_until=CASE WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until<=now() THEN 1 ELSE failed_attempts+1 END)>=5 THEN now()+interval '15 minutes' ELSE NULL END WHERE user_id=$1",
    [p.user_id],
  );
}
async function verifyFactor(
  db: PoolClient,
  p: Row,
  code: string,
  vault: AccountVault,
) {
  ensureUnlocked(p);
  if (!p.mfa_secret) return false;
  const normalized = code.replace(/[-\s]/g, "").toUpperCase();
  const hash = hashToken(normalized);
  if (p.recovery_hashes.includes(hash)) {
    await db.query(
      "UPDATE account_profiles SET recovery_hashes=array_remove(recovery_hashes,$2),failed_attempts=0,locked_until=NULL WHERE user_id=$1",
      [p.user_id, hash],
    );
    return true;
  }
  const counter = matchTotp(
    vault.decrypt(p.mfa_secret, p.user_id, "active"),
    code,
    Date.now(),
    Number(p.last_counter),
  );
  if (counter !== null) {
    await db.query(
      "UPDATE account_profiles SET last_counter=$2,failed_attempts=0,locked_until=NULL WHERE user_id=$1",
      [p.user_id, counter],
    );
    return true;
  }
  await failFactor(db, p);
  return false;
}
function recovery() {
  const codes = Array.from({ length: 10 }, () =>
    randomBytes(10).toString("hex").toUpperCase(),
  );
  return {
    codes: codes.map((c) => c.match(/.{1,5}/g)!.join("-")),
    hashes: codes.map(hashToken),
  };
}
export async function setupMfa(
  database: Database,
  principal: Principal,
  password: string,
  vault: AccountVault,
) {
  accountHuman(principal);
  return database.transaction(principal, async (db) => {
    const { user, profile } = await loadLocked(db, principal.id);
    await passwordProof(user, password);
    ensureUnlocked(profile);
    if (profile.mfa_secret)
      throw new AppError(
        409,
        "mfa_enabled",
        "Two-factor authentication is already enabled.",
      );
    const secret = encodeBase32(randomBytes(20));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await db.query(
      "UPDATE account_profiles SET pending_secret=$2,pending_expires_at=$3,pending_user_version=$4,pending_attempts=0 WHERE user_id=$1",
      [
        principal.id,
        vault.encrypt(secret, principal.id, "pending"),
        expiresAt,
        user.version,
      ],
    );
    return {
      secret,
      otpauthUrl: `otpauth://totp/${encodeURIComponent(`AgentStack:${user.email}`)}?secret=${secret}&issuer=AgentStack&algorithm=SHA1&digits=6&period=30`,
      expiresAt,
    };
  });
}
export async function confirmMfa(
  database: Database,
  principal: Principal,
  code: string,
  vault: AccountVault,
  currentHash: string,
) {
  accountHuman(principal);
  const result = await database.transaction(principal, async (db) => {
    const { user, profile: p } = await loadLocked(db, principal.id);
    ensureUnlocked(p);
    if (
      p.mfa_secret ||
      !p.pending_secret ||
      p.pending_user_version !== user.version ||
      new Date(p.pending_expires_at).getTime() < Date.now() ||
      p.pending_attempts >= 5
    )
      throw new AppError(
        409,
        "mfa_setup_expired",
        "Start two-factor authentication setup again.",
      );
    const secret = vault.decrypt(p.pending_secret, principal.id, "pending");
    const counter = matchTotp(secret, code);
    if (counter === null) {
      await db.query(
        "UPDATE account_profiles SET pending_attempts=pending_attempts+1 WHERE user_id=$1",
        [principal.id],
      );
      await failFactor(db, p);
      return null;
    }
    const backup = recovery();
    await db.query(
      "UPDATE account_profiles SET mfa_secret=$2,pending_secret=NULL,pending_expires_at=NULL,last_counter=$3,recovery_hashes=$4,security_version=security_version+1,failed_attempts=0,locked_until=NULL WHERE user_id=$1",
      [
        principal.id,
        vault.encrypt(secret, principal.id, "active"),
        counter,
        backup.hashes,
      ],
    );
    await db.query("DELETE FROM account_challenges WHERE user_id=$1", [
      principal.id,
    ]);
    await db.query("DELETE FROM sessions WHERE user_id=$1 AND hash<>$2", [
      principal.id,
      currentHash,
    ]);
    return {
      account: await bump(db, user, "mfa.enabled"),
      recoveryCodes: backup.codes,
    };
  });
  if (!result) throw badFactor();
  return result;
}
export async function changeMfa(
  database: Database,
  principal: Principal,
  input: { password: string; code: string },
  vault: AccountVault,
  currentHash: string,
  disable: boolean,
) {
  accountHuman(principal);
  const result = await database.transaction(principal, async (db) => {
    const { user, profile } = await loadLocked(db, principal.id);
    await passwordProof(user, input.password);
    if (!profile.mfa_secret)
      throw new AppError(
        409,
        "mfa_disabled",
        "Two-factor authentication is not enabled.",
      );
    if (!(await verifyFactor(db, profile, input.code, vault))) return null;
    const backup = recovery();
    await db.query(
      "UPDATE account_profiles SET mfa_secret=CASE WHEN $2 THEN NULL ELSE mfa_secret END,recovery_hashes=$3,security_version=security_version+1,pending_secret=NULL,pending_expires_at=NULL WHERE user_id=$1",
      [principal.id, disable, disable ? [] : backup.hashes],
    );
    await db.query("DELETE FROM account_challenges WHERE user_id=$1", [
      principal.id,
    ]);
    await db.query("DELETE FROM sessions WHERE user_id=$1 AND hash<>$2", [
      principal.id,
      currentHash,
    ]);
    return {
      account: await bump(
        db,
        user,
        disable ? "mfa.disabled" : "mfa.recovery_regenerated",
      ),
      ...(disable ? {} : { recoveryCodes: backup.codes }),
    };
  });
  if (!result) throw badFactor();
  return result;
}
export async function changePassword(
  database: Database,
  principal: Principal,
  input: { password: string; newPassword: string; code?: string },
  vault: AccountVault,
) {
  accountHuman(principal);
  const passwordHash = await hashPassword(input.newPassword);
  const ok = await database.transaction(principal, async (db) => {
    let { user, profile } = await loadLocked(db, principal.id);
    await passwordProof(user, input.password);
    if (
      profile.mfa_secret &&
      !(await verifyFactor(db, profile, input.code ?? "", vault))
    )
      return false;
    user = (
      await db.query(
        "UPDATE users SET password_hash=$2,version=version+1 WHERE id=$1 RETURNING *",
        [principal.id, passwordHash],
      )
    ).rows[0];
    await db.query(
      "UPDATE account_profiles SET security_version=security_version+1,pending_secret=NULL,pending_expires_at=NULL WHERE user_id=$1",
      [principal.id],
    );
    await db.query("DELETE FROM sessions WHERE user_id=$1", [principal.id]);
    await db.query("DELETE FROM account_challenges WHERE user_id=$1", [
      principal.id,
    ]);
    await bump(db, user, "password.changed");
    return true;
  });
  if (!ok) throw badFactor();
  return { ok: true };
}
export async function beginLogin(
  database: Database,
  email: string,
  password: string,
) {
  const row = (
    await database.pool.query(
      "SELECT * FROM users WHERE email=$1 AND NOT disabled",
      [email],
    )
  ).rows[0];
  if (
    !(await verifyPassword(
      password,
      row?.password_hash ??
        "scrypt:00000000000000000000000000000000:" + "00".repeat(64),
    )) ||
    !row
  )
    throw new AppError(
      401,
      "invalid_credentials",
      "Email or password is incorrect.",
    );
  return database.transaction(null, async (db) => {
    await db.query("SELECT set_config('agentstack.user_id',$1,true)", [row.id]);
    const { user, profile } = await loadLocked(db, row.id);
    if (
      user.version !== row.version ||
      user.password_hash !== row.password_hash
    )
      throw new AppError(
        401,
        "invalid_credentials",
        "Account credentials changed. Sign in again.",
      );
    if (profile.mfa_secret) {
      ensureUnlocked(profile);
      await db.query("DELETE FROM account_challenges WHERE user_id=$1", [
        row.id,
      ]);
      const challenge = newSecret();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      await db.query(
        "INSERT INTO account_challenges(hash,user_id,user_version,security_version,expires_at) VALUES($1,$2,$3,$4,$5)",
        [
          hashToken(challenge),
          row.id,
          user.version,
          profile.security_version,
          expiresAt,
        ],
      );
      return { mfaRequired: true as const, challenge, expiresAt };
    }
    const secret = newSecret();
    await db.query(
      "INSERT INTO sessions(hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
      [hashToken(secret), row.id],
    );
    return { user: publicUser(user), secret };
  });
}
export async function finishLogin(
  database: Database,
  input: { challenge: string; code: string },
  vault: AccountVault,
) {
  const result = await database.transaction(null, async (db) => {
    const hash = hashToken(input.challenge);
    await db.query("SELECT set_config('agentstack.challenge_hash',$1,true)", [
      hash,
    ]);
    const peek = (
      await db.query("SELECT user_id FROM account_challenges WHERE hash=$1", [
        hash,
      ])
    ).rows[0];
    if (!peek) return null;
    await db.query("SELECT set_config('agentstack.user_id',$1,true)", [
      peek.user_id,
    ]);
    const { user, profile } = await loadLocked(db, peek.user_id);
    const challenge = (
      await db.query(
        "SELECT * FROM account_challenges WHERE hash=$1 FOR UPDATE",
        [hash],
      )
    ).rows[0];
    if (
      !challenge ||
      challenge.attempts >= 5 ||
      new Date(challenge.expires_at).getTime() < Date.now() ||
      challenge.user_version !== user.version ||
      challenge.security_version !== profile.security_version
    )
      return null;
    await db.query(
      "UPDATE account_challenges SET attempts=attempts+1 WHERE hash=$1",
      [hash],
    );
    if (!(await verifyFactor(db, profile, input.code, vault))) return null;
    await db.query("DELETE FROM account_challenges WHERE user_id=$1", [
      user.id,
    ]);
    const secret = newSecret();
    await db.query(
      "INSERT INTO sessions(hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
      [hashToken(secret), user.id],
    );
    return { user: publicUser(user), secret };
  });
  if (!result) throw badFactor();
  return result;
}
export async function uploadAvatar(
  database: Database,
  principal: Principal,
  input: Buffer,
  expectedVersion: number,
) {
  accountHuman(principal);
  if (input.length > 2 * 1024 * 1024)
    throw new AppError(413, "avatar_too_large", "Choose an image up to 2 MiB.");
  let bytes: Buffer;
  try {
    const detected = await fileTypeFromBuffer(input);
    if (
      !detected ||
      !["image/png", "image/jpeg", "image/webp"].includes(detected.mime)
    )
      throw Error();
    const decoder = sharp(input, {
      limitInputPixels: 16_000_000,
      animated: false,
      failOn: "warning",
    });
    const metadata = await decoder.metadata();
    if (
      !["png", "jpeg", "webp"].includes(metadata.format ?? "") ||
      (metadata.pages ?? 1) > 1 ||
      !metadata.width ||
      !metadata.height
    )
      throw Error();
    bytes = await decoder
      .rotate()
      .resize(256, 256, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new AppError(
      400,
      "invalid_avatar",
      "Choose a valid PNG, JPEG or WebP image up to 16 megapixels.",
    );
  }
  return database.transaction(principal, async (db) => {
    const { user, profile } = await loadLocked(db, principal.id);
    if (accountVersion(user, profile) !== expectedVersion) throw conflict();
    await db.query(
      "UPDATE account_profiles SET avatar=$2,avatar_hash=$3 WHERE user_id=$1",
      [principal.id, bytes, hashToken(bytes.toString("base64"))],
    );
    return bump(db, user, "avatar.updated");
  });
}
export async function removeAvatar(
  database: Database,
  principal: Principal,
  expectedVersion: number,
) {
  accountHuman(principal);
  return database.transaction(principal, async (db) => {
    const { user, profile } = await loadLocked(db, principal.id);
    if (accountVersion(user, profile) !== expectedVersion) throw conflict();
    await db.query(
      "UPDATE account_profiles SET avatar=NULL,avatar_hash=NULL WHERE user_id=$1",
      [principal.id],
    );
    return bump(db, user, "avatar.removed");
  });
}
export async function getAvatar(database: Database, principal: Principal) {
  accountHuman(principal);
  return database.transaction(principal, async (db) => {
    const row = (
      await db.query("SELECT avatar FROM account_profiles WHERE user_id=$1", [
        principal.id,
      ])
    ).rows[0];
    if (!row?.avatar) throw missing();
    return row.avatar as Buffer;
  });
}
export async function listSessions(
  database: Database,
  principal: Principal,
  currentHash: string,
) {
  accountHuman(principal);
  const rows = (
    await database.pool.query(
      "SELECT id,created_at,expires_at,hash=$2 AS current FROM sessions WHERE user_id=$1 AND expires_at>now() ORDER BY created_at DESC LIMIT 100",
      [principal.id, currentHash],
    )
  ).rows;
  return {
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at.toISOString(),
      expiresAt: r.expires_at.toISOString(),
      current: r.current,
    })),
  };
}
export async function revokeSessions(
  database: Database,
  principal: Principal,
  currentHash: string,
  id?: string,
) {
  accountHuman(principal);
  return database.transaction(principal, async (db) => {
    const { user } = await loadLocked(db, principal.id);
    const rows = id
      ? await db.query(
          "DELETE FROM sessions WHERE user_id=$1 AND id=$2 RETURNING hash=$3 AS current",
          [principal.id, id, currentHash],
        )
      : await db.query(
          "DELETE FROM sessions WHERE user_id=$1 AND hash<>$2 RETURNING false AS current",
          [principal.id, currentHash],
        );
    if (id && !rows.rowCount) throw missing();
    await bump(db, user, id ? "session.revoked" : "sessions.revoked");
    return { ok: true, currentRevoked: rows.rows.some((r) => r.current) };
  });
}
