# Personal account API

All paths have prefix `/api/v1`. Except MFA login verification, account endpoints require a human cookie session. Project-scoped agent tokens are forbidden, including tokens created by an administrator. Cookie writes require the configured Origin and `X-AgentStack-Request: 1`. Responses use `Cache-Control: no-store`.

## Profile and preferences

`GET /account` returns `{user,version,preferences,avatarUrl,mfaEnabled,recoveryCodesRemaining}`. Preferences are `{locale:null|"ru"|"en",theme:"light"|"dark"|"auto",accent:"#rrggbb",onboardingCompleted:boolean}`. Null locale allows initial browser-language fallback. User is the existing safe user DTO.

`PATCH /account` accepts `{expectedVersion,name?,preferences?:partial}`. Unknown fields are rejected; name is trimmed and bounded; accent is a six-digit hexadecimal color. A stale version returns409. Names and preferences update only the caller's account. `GET /account/history` returns the most recent100 immutable safe events in reverse chronological order. It never includes passwords, TOTP secrets, challenge tokens, recovery hashes/codes or avatar bytes.

`PUT /account/avatar?expectedVersion=N` accepts one multipart file, up to2MiB. Actual decoded PNG/JPEG/WebP format and a16-megapixel limit are validated. The server normalizes orientation and crops/re-encodes to256×256WebP, stripping metadata. SVG, malformed and animated multi-page input are rejected. `GET /account/avatar` serves only the current user's avatar with a fixed image content type and nosniff; there are no public or remote URL uploads. `DELETE /account/avatar?expectedVersion=N` removes it. Upload and delete return the updated account; both require expectedVersion.

## Two-factor authentication

- `POST /account/mfa/setup {password}` verifies the current password and returns `{secret,otpauthUrl,expiresAt}` for a10-minute pending setup. UI must clear the secret on completion, close or logout. MFA is not yet enabled.
- `POST /account/mfa/confirm {code}` verifies a six-digit TOTP, enables MFA and returns `{account,recoveryCodes}`. The10random recovery codes are displayed only once. Other sessions and pending login challenges are revoked.
- `POST /account/mfa/recovery-codes {password,code}` replaces all recovery codes and returns `{account,recoveryCodes}`. A current TOTP or unused recovery code is required.
- `POST /account/mfa/disable {password,code}` disables MFA and returns `{account}`. A password alone is insufficient. Other sessions and challenges are revoked.

Authenticator codes use RFC6238 SHA1, six digits and30-second steps, with at most one adjacent step accepted. Already accepted steps cannot be reused. Recovery codes carry80bits of random entropy, are stored only as SHA256hashes and consumed atomically. Secrets are AES-256-GCM encrypted with a dedicated HKDF-derived key from `REPOSITORY_ENCRYPTION_KEY`, bound to user ID and pending/active purpose. Preserve the existing installation key in protected backups; missing/decryption-failed keys fail closed.

With MFA disabled, `POST /auth/login {email,password}` retains the existing `{user}` response and HttpOnly cookie. With MFA enabled it returns `{mfaRequired:true,challenge,expiresAt}` **without a session cookie**. `POST /auth/mfa/verify {challenge,code}` returns `{user}` and creates the session only after successful verification. Challenges are hashed, single-use, expire after5minutes and permit5attempts. They bind the account credential/security versions. Replacing a challenge does not reset the account's failed-factor count;5failures lock factor verification for15minutes. Confirmation attempts and replay checks are transactional. Sensitive routes also have per-actor/IP rate limits.

## Password and sessions

`POST /account/password {password,newPassword,code?}` requires the current password and, when MFA is enabled, a valid TOTP/recovery code. The new password has12–200characters. All sessions and challenges are revoked; the response clears the caller's cookie. Sign in again.

`GET /account/sessions` returns `{items:[{id,createdAt,expiresAt,current}]}`, bounded to100active sessions. Session IDs are public UUIDs, never authentication hashes/tokens. `DELETE /account/sessions/:id` revokes only an owned session. `POST /account/sessions/revoke-others {}` keeps the current session. Both return `{ok:true,currentRevoked:boolean}`; when the current session is revoked its cookie is cleared. Revocation operations are recorded in account history.

## Rollout

Schema5 adds account profiles, challenges, immutable account history and public session IDs. It leaves existing project data and sessions intact. Existing users start with MFA disabled and default preferences. No account is enrolled automatically. Back up both PostgreSQL and the matching installation key before upgrading. Older app readiness expects schema4; deploy a matching schema5 build or use a forward fix rather than restoring an old database over new writes.
