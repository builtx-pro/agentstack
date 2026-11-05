import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  accountPatchSchema,
  accountPasswordProofSchema,
  accountFactorProofSchema,
  passwordChangeSchema,
  mfaChallengeSchema,
  idSchema,
  factorCodeSchema,
} from "@agentstack/contracts";
import type { Database } from "../db/database.service.js";
import { parse, forbidden, AppError } from "../shared/errors.js";
import { hashToken } from "../shared/crypto.util.js";
import { AccountVault } from "./account-crypto.util.js";
import * as service from "./account.service.js";
export function setSession(
  reply: FastifyReply,
  secret: string,
  secure: boolean,
) {
  reply.setCookie("agentstack_session", secret, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure,
    maxAge: 7 * 86400,
  });
}
export function registerAccountRoutes(
  app: FastifyInstance,
  database: Database,
  key: string | undefined,
  secure: boolean,
) {
  const vault = new AccountVault(key);
  const prefix = "/api/v1";
  const principal = (r: FastifyRequest) => {
    if (!r.principal) throw forbidden();
    return service.accountHuman(r.principal);
  };
  const current = (r: FastifyRequest) =>
    hashToken(r.cookies.agentstack_session ?? "");
  const limited = {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  };
  app.get(prefix + "/account", async (r) =>
    service.getAccount(database, principal(r)),
  );
  app.patch(prefix + "/account", async (r) =>
    service.patchAccount(
      database,
      principal(r),
      parse(accountPatchSchema, r.body),
    ),
  );
  app.get(prefix + "/account/avatar", async (r, reply) =>
    reply
      .type("image/webp")
      .header("Content-Disposition", 'inline; filename="avatar.webp"')
      .send(await service.getAvatar(database, principal(r))),
  );
  const version = (r: FastifyRequest) =>
    parse(
      z
        .object({ expectedVersion: z.coerce.number().int().positive() })
        .strict(),
      r.query,
    ).expectedVersion;
  app.put(
    prefix + "/account/avatar",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (r) => {
      const p = principal(r);
      const expectedVersion = version(r);
      const part = await r.file({
        limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
      });
      if (!part)
        throw new AppError(
          400,
          "invalid_avatar",
          "Choose a PNG, JPEG or WebP image.",
        );
      const bytes = await part.toBuffer();
      if (part.file.truncated)
        throw new AppError(
          413,
          "avatar_too_large",
          "Choose an image up to 2 MiB.",
        );
      return service.uploadAvatar(database, p, bytes, expectedVersion);
    },
  );
  app.delete(prefix + "/account/avatar", async (r) =>
    service.removeAvatar(database, principal(r), version(r)),
  );
  app.post(prefix + "/account/mfa/setup", limited, async (r) =>
    service.setupMfa(
      database,
      principal(r),
      parse(accountPasswordProofSchema, r.body).password,
      vault,
    ),
  );
  app.post(prefix + "/account/mfa/confirm", limited, async (r) =>
    service.confirmMfa(
      database,
      principal(r),
      parse(z.object({ code: factorCodeSchema }).strict(), r.body).code,
      vault,
      current(r),
    ),
  );
  app.post(prefix + "/account/mfa/disable", limited, async (r) =>
    service.changeMfa(
      database,
      principal(r),
      parse(accountFactorProofSchema, r.body),
      vault,
      current(r),
      true,
    ),
  );
  app.post(prefix + "/account/mfa/recovery-codes", limited, async (r) =>
    service.changeMfa(
      database,
      principal(r),
      parse(accountFactorProofSchema, r.body),
      vault,
      current(r),
      false,
    ),
  );
  app.post(prefix + "/account/password", limited, async (r, reply) => {
    const result = await service.changePassword(
      database,
      principal(r),
      parse(passwordChangeSchema, r.body),
      vault,
    );
    reply.clearCookie("agentstack_session", { path: "/" });
    return result;
  });
  app.get(prefix + "/account/sessions", async (r) =>
    service.listSessions(database, principal(r), current(r)),
  );
  app.delete(prefix + "/account/sessions/:id", async (r, reply) => {
    const result = await service.revokeSessions(
      database,
      principal(r),
      current(r),
      parse(z.object({ id: idSchema }), r.params).id,
    );
    if (result.currentRevoked)
      reply.clearCookie("agentstack_session", { path: "/" });
    return result;
  });
  app.post(prefix + "/account/sessions/revoke-others", async (r) =>
    service.revokeSessions(database, principal(r), current(r)),
  );
  app.get(prefix + "/account/history", async (r) => {
    const p = principal(r);
    return database.transaction(p, async (db) => ({
      items: (
        await db.query(
          'SELECT id,version,action,snapshot,created_at AS "createdAt" FROM account_history WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100',
          [p.id],
        )
      ).rows,
    }));
  });
  app.post(
    prefix + "/auth/mfa/verify",
    { config: { rateLimit: { max: 15, timeWindow: "1 minute" } } },
    async (r, reply) => {
      const result = await service.finishLogin(
        database,
        parse(mfaChallengeSchema, r.body),
        vault,
      );
      setSession(reply, result.secret, secure);
      return { user: result.user };
    },
  );
}
