import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { buildApp } from "../src/app.js";
import { migrate } from "../src/db/migrate.js";
import { bootstrap } from "../src/auth/bootstrap.service.js";
const origin = "http://localhost:4100";
let app: Awaited<ReturnType<typeof buildApp>>,
  storage: string,
  admin: string,
  developer: string,
  customer: string,
  foreign: string,
  pid: string,
  pid2: string,
  devId: string;
const req = (
  method: string,
  url: string,
  body?: unknown,
  cookie = admin,
  extra: Record<string, string> = {},
) =>
  app.inject({
    method: method as "GET",
    url: "/api/v1" + url,
    payload: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      origin,
      "x-agentstack-request": "1",
      ...(cookie ? { cookie } : {}),
      ...extra,
    },
  });
const createObject = async (
  kind: string,
  title: string,
  data: Record<string, unknown> = {},
  visibility = "customer",
  cookie = admin,
) => {
  const r = await req(
    "POST",
    `/projects/${pid}/objects`,
    { key: randomUUID(), kind, title, data, visibility },
    cookie,
    { "idempotency-key": randomUUID() },
  );
  expect(r.statusCode, r.body).toBe(201);
  return r.json();
};
beforeAll(async () => {
  if (!process.env.TEST_DATABASE_OWNER_URL || !process.env.TEST_DATABASE_URL)
    throw new Error("Use npm test to run on an isolated database");
  await migrate(
    process.env.TEST_DATABASE_OWNER_URL,
    process.env.APP_DATABASE_PASSWORD!,
  );
  await bootstrap(process.env.TEST_DATABASE_OWNER_URL, {
    email: "admin@example.test",
    name: "Admin",
    password: "a-random-test-password-1",
  });
  storage = await mkdtemp(join(tmpdir(), "agentstack-api-"));
  app = await buildApp({
    databaseUrl: process.env.TEST_DATABASE_URL,
    allowedOrigin: origin,
    storageDir: storage,
    secureCookies: false,
    logger: false,
  });
  const login = await req(
    "POST",
    "/auth/login",
    { email: "admin@example.test", password: "a-random-test-password-1" },
    "",
  );
  expect(login.statusCode).toBe(200);
  admin = String(login.headers["set-cookie"]).split(";")[0]!;
  for (const [email, role] of [
    ["dev@example.test", "developer"],
    ["customer@example.test", "customer"],
    ["other@example.test", "customer"],
  ]) {
    const u = await req("POST", "/users", {
      email,
      name: role,
      password: "a-random-test-password-2",
    });
    expect(u.statusCode, u.body).toBe(201);
    if (role === "developer") devId = u.json().id;
    const l = await req(
      "POST",
      "/auth/login",
      { email, password: "a-random-test-password-2" },
      "",
    );
    const c = String(l.headers["set-cookie"]).split(";")[0]!;
    if (email!.startsWith("dev")) developer = c;
    else if (email!.startsWith("customer")) customer = c;
    else foreign = c;
  }
  const p = await req("POST", "/projects", {
    name: "Project A",
    slug: "project-a",
  });
  expect(p.statusCode, p.body).toBe(201);
  pid = p.json().id;
  pid2 = (
    await req("POST", "/projects", { name: "Project B", slug: "project-b" })
  ).json().id;
  const users = (await req("GET", "/users")).json().items;
  for (const u of users.filter(
    (u: { isAdmin: boolean; email: string }) =>
      !u.isAdmin && u.email !== "other@example.test",
  ))
    expect(
      (
        await req("POST", `/projects/${pid}/members`, {
          userId: u.id,
          role: u.email.startsWith("dev") ? "developer" : "customer",
        })
      ).statusCode,
    ).toBe(201);
}, 120000);
afterAll(async () => {
  await app?.close();
  if (storage) await rm(storage, { recursive: true, force: true });
});
describe("authorization and sessions", () => {
  it("bounds larger catalog pages without widening other lists or customer access", async () => {
    const visible = await createObject("screen", "Bulk page visible", {screenId:"bulk-visible"});
    const hidden = await createObject("document", "Bulk page hidden", {markdown:"Team only"}, "team");
    const response = await req("GET", `/projects/${pid}/objects?limit=1000`, undefined, customer);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().items.some((item: {id:string}) => item.id === visible.id)).toBe(true);
    expect(response.json().items.some((item: {id:string}) => item.id === hidden.id)).toBe(false);
    expect((await req("GET", `/projects/${pid}/objects?limit=1001`)).statusCode).toBe(400);
    expect((await req("GET", "/projects?limit=101")).statusCode).toBe(400);
    expect((await req("GET", `/projects/${pid2}/objects?limit=1000`, undefined, customer)).statusCode).toBe(404);
  });
  it("returns only permitted projects and hides foreign IDs", async () => {
    expect(
      (await req("GET", "/projects", undefined, developer))
        .json()
        .items.map((p: { id: string }) => p.id),
    ).toEqual([pid]);
    expect(
      (await req("GET", `/projects/${pid2}`, undefined, developer)).statusCode,
    ).toBe(404);
    expect(
      (await req("GET", `/projects/${pid}`, undefined, foreign)).statusCode,
    ).toBe(404);
  });
  it("rejects CSRF and customer mutation", async () => {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/projects",
          headers: { cookie: admin },
          payload: { name: "No", slug: "no" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await req(
          "POST",
          `/projects/${pid}/objects`,
          { key: "x", kind: "document", title: "x", data: { markdown: "x" } },
          customer,
          { "idempotency-key": randomUUID() },
        )
      ).statusCode,
    ).toBe(403);
  });
  it("enforces RLS with the application role and no tenant context", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    try {
      const role = (
        await pool.query(
          "select rolsuper,rolbypassrls from pg_roles where rolname=current_user",
        )
      ).rows[0];
      expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
      expect((await pool.query("select id from objects")).rows).toEqual([]);
    } finally {
      await pool.end();
    }
  });
});
describe("versioned objects and history", () => {
  it("retains history, conflicts atomically and does not reveal old internal revisions", async () => {
    const o = await createObject(
      "document",
      "Private",
      { markdown: "private notes" },
      "team",
    );
    expect(
      (
        await req(
          "GET",
          `/projects/${pid}/objects/${o.id}`,
          undefined,
          customer,
          { "idempotency-key": randomUUID() },
        )
      ).statusCode,
    ).toBe(404);
    const updated = await req("PATCH", `/projects/${pid}/objects/${o.id}`, {
      expectedVersion: 1,
      title: "Shared",
      visibility: "customer",
      data: { markdown: "public copy" },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json().version).toBe(2);
    const conflict = await req("PATCH", `/projects/${pid}/objects/${o.id}`, {
      expectedVersion: 1,
      title: "Lost",
    });
    expect(conflict.statusCode).toBe(409);
    const hist = (
      await req(
        "GET",
        `/projects/${pid}/objects/${o.id}/history`,
        undefined,
        customer,
      )
    ).json();
    expect(hist.items).toHaveLength(1);
    expect(JSON.stringify(hist)).not.toContain("private notes");
    const restored = await req(
      "POST",
      `/projects/${pid}/objects/${o.id}/restore`,
      { expectedVersion: 2, revisionVersion: 1, reason: "Restore old copy" },
    );
    expect(restored.statusCode, restored.body).toBe(409);
  });
  it("restores content as a new version and preserves operational fields", async () => {
    const o = await createObject("document", "Draft", { markdown: "one" });
    await req("PATCH", `/projects/${pid}/objects/${o.id}`, {
      expectedVersion: 1,
      title: "New",
      archived: true,
      data: { markdown: "two" },
    });
    const r = await req("POST", `/projects/${pid}/objects/${o.id}/restore`, {
      expectedVersion: 2,
      revisionVersion: 1,
      reason: "Compare old version",
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      title: "Draft",
      version: 3,
      archived: true,
      data: { markdown: "one" },
    });
    expect(
      (await req("GET", `/projects/${pid}/objects/${o.id}/history`)).json()
        .items,
    ).toHaveLength(3);
  });
  it("idempotent create and foreign references fail without duplicate data", async () => {
    const key = randomUUID(),
      draft = { key: "stable-" + key, kind: "wave", title: "Wave", data: {} };
    const a = await req("POST", `/projects/${pid}/objects`, draft, admin, {
      "idempotency-key": key,
    });
    const b = await req("POST", `/projects/${pid}/objects`, draft, admin, {
      "idempotency-key": key,
    });
    expect(a.json().id).toBe(b.json().id);
    expect(
      (
        await req(
          "POST",
          `/projects/${pid}/objects`,
          { ...draft, title: "Changed" },
          admin,
          { "idempotency-key": key },
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await req(
          "POST",
          `/projects/${pid}/objects`,
          {
            key: randomUUID(),
            kind: "story",
            title: "Bad",
            data: { epicId: randomUUID() },
          },
          admin,
          { "idempotency-key": randomUUID() },
        )
      ).statusCode,
    ).toBe(422);
  });
});
describe("review loop and restricted agent", () => {
  it("enforces claims, evidence and human acceptance", async () => {
    const o = await createObject("screen", "Login", {
      screenId: "login",
      variant: "a",
    });
    const n = (
      await req(
        "POST",
        `/projects/${pid}/notes`,
        { targetId: o.id, targetVersion: 1, body: "Improve the button" },
        customer,
        { "idempotency-key": randomUUID() },
      )
    ).json();
    const token = (
      await req("POST", `/projects/${pid}/tokens`, {
        name: "Test Agent",
        scopes: ["read", "write", "review"],
        expiresInDays: 1,
      })
    ).json().token;
    expect(token).toBeTruthy();
    const bearer = { authorization: `Bearer ${token}` };
    const claim = await req(
      "POST",
      `/projects/${pid}/notes/${n.id}/transition`,
      { expectedVersion: 1, action: "claim" },
      "",
      bearer,
    );
    expect(claim.statusCode, claim.body).toBe(200);
    const competing = await req(
      "POST",
      `/projects/${pid}/notes/${n.id}/transition`,
      { expectedVersion: 2, action: "claim" },
      developer,
    );
    expect(competing.statusCode).toBe(409);
    const result = {
      summary: "Changed button",
      revision: "abc123",
      checks: [{ name: "browser", result: "passed" }],
      evidenceSource: "human",
    };
    const submit = await req(
      "POST",
      `/projects/${pid}/notes/${n.id}/transition`,
      { expectedVersion: 2, action: "submit", result },
      "",
      bearer,
    );
    expect(submit.statusCode, submit.body).toBe(200);
    expect(submit.json().result.evidenceSource).toBe("agent");
    expect(
      (
        await req(
          "POST",
          `/projects/${pid}/notes/${n.id}/transition`,
          { expectedVersion: 3, action: "resolve", reason: "Self approval" },
          "",
          bearer,
        )
      ).statusCode,
    ).toBe(403);
    const accept = await req(
      "POST",
      `/projects/${pid}/notes/${n.id}/transition`,
      { expectedVersion: 3, action: "resolve", reason: "Looks good" },
      customer,
    );
    expect(accept.statusCode, accept.body).toBe(200);
    expect(accept.json().status).toBe("resolved");
    expect(
      (await req("GET", `/projects/${pid2}/objects`, undefined, "", bearer))
        .statusCode,
    ).toBe(404);
    const rule = await createObject(
      "rule",
      "Rules",
      { markdown: "Human rules" },
      "team",
    );
    expect(
      (
        await req(
          "PATCH",
          `/projects/${pid}/objects/${rule.id}`,
          { expectedVersion: 1, data: { markdown: "Override" } },
          "",
          bearer,
        )
      ).statusCode,
    ).toBe(403);
    const story = await createObject("story", "Work", {});
    expect(
      (
        await req(
          "PATCH",
          `/projects/${pid}/objects/${story.id}`,
          { expectedVersion: 1, status: "done" },
          "",
          bearer,
        )
      ).statusCode,
    ).toBe(403);
  });
});
describe("plan and import", () => {
  it("counts unique stories and honors parent archive", async () => {
    const wave = await createObject("wave", "W");
    const epic = await createObject("epic", "E", { waveId: wave.id });
    const sprint = await createObject("sprint", "Sprint");
    const feature = await createObject("feature", "Feature");
    const story = await createObject("story", "Done", {
      epicId: epic.id,
      sprintId: sprint.id,
      featureIds: [feature.id],
    });
    await req("PATCH", `/projects/${pid}/objects/${story.id}`, {
      expectedVersion: 1,
      status: "done",
    });
    const p = (await req("GET", `/projects/${pid}/progress`)).json();
    expect(
      p.groups.find((x: { id: string }) => x.id === wave.id),
    ).toMatchObject({ total: 1, done: 1, percent: 100 });
    await req("PATCH", `/projects/${pid}/objects/${wave.id}`, {
      expectedVersion: 1,
      archived: true,
    });
    const p2 = (await req("GET", `/projects/${pid}/progress`)).json();
    expect(p2.total).toBe(p.total - 1);
    expect(p2.done).toBe(p.done - 1);
  });
  it("imports key references atomically and dry run changes nothing", async () => {
    const manifest = {
      schemaVersion: 1,
      objects: [
        {
          key: "import-epic",
          kind: "epic",
          title: "Import epic",
          data: { waveId: "@import-wave" },
        },
        { key: "import-wave", kind: "wave", title: "Import wave", data: {} },
      ],
    };
    const dry = await req("POST", `/projects/${pid}/import`, {
      manifest,
      dryRun: true,
    });
    expect(dry.statusCode, dry.body).toBe(200);
    expect(
      (await req("GET", `/projects/${pid}/objects?q=import-wave`)).json().items,
    ).toHaveLength(0);
    const real = await req("POST", `/projects/${pid}/import`, {
      manifest,
      dryRun: false,
    });
    expect(real.statusCode, real.body).toBe(200);
    expect(real.json().created).toBe(2);
    const again = await req("POST", `/projects/${pid}/import`, {
      manifest,
      dryRun: false,
    });
    expect(again.statusCode, again.body).toBe(200);
    expect(again.json().unchanged).toBe(2);
  });
});

describe("security and concurrency regressions", () => {
  it("rejects unsafe object data and preserves no partial manifest writes", async () => {
    const manifest = {
      schemaVersion: 1,
      objects: [
        { key: "must-rollback", kind: "wave", title: "Atomic", data: {} },
        {
          key: "must-fail",
          kind: "story",
          title: "Invalid",
          data: { epicId: randomUUID() },
        },
      ],
    };
    expect(
      (await req("POST", `/projects/${pid}/import`, { manifest })).statusCode,
    ).toBe(422);
    expect(
      (await req("GET", `/projects/${pid}/objects?q=must-rollback`)).json()
        .items,
    ).toHaveLength(0);
    expect(
      (
        await req(
          "POST",
          `/projects/${pid}/objects`,
          {
            key: "unsafe-preview",
            kind: "screen",
            title: "No script",
            data: { previewUrl: "javascript:alert(1)" },
          },
          admin,
          { "idempotency-key": randomUUID() },
        )
      ).statusCode,
    ).toBe(400);
  });
  it("one of two concurrent writes wins and both audit/content remain consistent", async () => {
    const o = await createObject("document", "Concurrent", {
      markdown: "base",
    });
    const changes = await Promise.all(
      ["one", "two"].map((markdown) =>
        req(
          "PATCH",
          `/projects/${pid}/objects/${o.id}`,
          { expectedVersion: 1, data: { markdown } },
          developer,
        ),
      ),
    );
    expect(changes.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const hist = (
      await req("GET", `/projects/${pid}/objects/${o.id}/history`)
    ).json().items;
    expect(hist.map((h: { version: number }) => h.version).sort()).toEqual([
      1, 2,
    ]);
  });
  it("blocks agent acceptance through import and restore", async () => {
    const rule = await createObject(
      "rule",
      "Protected rule",
      { markdown: "Rule" },
      "team",
    );
    const token = (
      await req("POST", `/projects/${pid}/tokens`, {
        name: "Restricted",
        scopes: ["read", "write", "review"],
      })
    ).json().token;
    const bearer = { authorization: `Bearer ${token}` };
    expect(
      (
        await req(
          "POST",
          `/projects/${pid}/objects/${rule.id}/restore`,
          { expectedVersion: 1, revisionVersion: 1, reason: "Try bypass" },
          "",
          bearer,
        )
      ).statusCode,
    ).toBe(403);
    const manifest = {
      schemaVersion: 1,
      objects: [
        {
          key: "agent-completed",
          kind: "story",
          title: "Not accepted",
          status: "done",
          data: {},
        },
      ],
    };
    expect(
      (await req("POST", `/projects/${pid}/import`, { manifest }, "", bearer))
        .statusCode,
    ).toBe(403);
  });
  it("revokes access immediately when a developer membership is removed", async () => {
    const draft = { name: "Own Token", scopes: ["read", "write"] };
    const token = (
      await req("POST", `/projects/${pid}/tokens`, draft, developer)
    ).json().token;
    expect(
      (
        await req("GET", `/projects/${pid}/objects`, undefined, "", {
          authorization: `Bearer ${token}`,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await req("DELETE", `/projects/${pid}/members/${devId}`, {
          expectedVersion: 1,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await req("GET", `/projects/${pid}/objects`, undefined, "", {
          authorization: `Bearer ${token}`,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await req("GET", `/projects/${pid}`, undefined, developer)).statusCode,
    ).toBe(404);
    await req("POST", `/projects/${pid}/members`, {
      userId: devId,
      role: "developer",
      expectedVersion: 2,
    });
  });
  it("handles invitation single-use, revocation and existing accounts without replacing passwords", async () => {
    const invite = await req("POST", `/projects/${pid}/invitations`, {
      email: "invite@example.test",
      role: "customer",
    });
    expect(invite.statusCode).toBe(201);
    const input = {
      token: invite.json().token,
      name: "Invited",
      password: "invitation-test-password",
    };
    expect(
      (await req("POST", "/auth/accept-invitation", input, "")).statusCode,
    ).toBe(200);
    expect(
      (await req("POST", "/auth/accept-invitation", input, "")).statusCode,
    ).toBe(404);
    const revoked = (
      await req("POST", `/projects/${pid}/invitations`, {
        email: "revoke@example.test",
        role: "customer",
      })
    ).json();
    expect(
      (await req("DELETE", `/projects/${pid}/invitations/${revoked.id}`, {}))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await req(
          "POST",
          "/auth/accept-invitation",
          { ...input, token: revoked.token },
          "",
        )
      ).statusCode,
    ).toBe(404);
  });
  it("RLS denies another tenant and cross-project inserts with positive controls", async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT set_config('agentstack.project_id',$1,true)", [
        pid,
      ]);
      expect(
        (await db.query("SELECT id FROM objects WHERE project_id=$1", [pid]))
          .rowCount,
      ).toBeGreaterThan(0);
      expect(
        (await db.query("SELECT id FROM objects WHERE project_id=$1", [pid2]))
          .rows,
      ).toHaveLength(0);
      await expect(
        db.query(
          "INSERT INTO objects(id,project_id,key,kind,title,visibility,status) VALUES($1,$2,'wrong-tenant','wave','No','team','backlog')",
          [randomUUID(), pid2],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await db.query("ROLLBACK");
      db.release();
      await pool.end();
    }
  });
  it("idempotent retries cannot recover a now-private proposal", async () => {
    const key = randomUUID(),
      draft = {
        key: "private-after-" + key,
        kind: "proposal",
        title: "Feedback",
        visibility: "customer",
        data: { proposalType: "feature" },
      };
    const initial = await req(
      "POST",
      `/projects/${pid}/objects`,
      draft,
      customer,
      { "idempotency-key": key },
    );
    expect(initial.statusCode).toBe(201);
    await req("PATCH", `/projects/${pid}/objects/${initial.json().id}`, {
      expectedVersion: 1,
      visibility: "team",
    });
    expect(
      (
        await req("POST", `/projects/${pid}/objects`, draft, customer, {
          "idempotency-key": key,
        })
      ).statusCode,
    ).toBe(404);
  });
});

describe("protected files and historical references", () => {
  const upload = async (name: string, content: string) => {
    const boundary = "agentstack-test-boundary";
    return app.inject({
      method: "POST",
      url: `/api/v1/projects/${pid}/files`,
      headers: {
        cookie: admin,
        origin,
        "x-agentstack-request": "1",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: image/svg+xml\r\n\r\n${content}\r\n--${boundary}--\r\n`,
      ),
    });
  };
  it("rejects executable SVG, serves static SVG with restrictive headers and checks current/revision visibility", async () => {
    expect(
      (
        await upload(
          "bad.svg",
          '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        )
      ).statusCode,
    ).toBe(422);
    const original =
      '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="purple"/></svg>';
    const file = await upload("static.svg", original);
    expect(file.statusCode, file.body).toBe(201);
    const fid = file.json().id;
    expect(
      (await req("GET", `/projects/${pid}/files/${fid}`, undefined, customer))
        .statusCode,
    ).toBe(404);
    const asset = await createObject(
      "asset",
      "Internal image",
      { fileId: fid },
      "team",
    );
    expect(
      (await req("GET", `/projects/${pid}/files/${fid}`, undefined, customer))
        .statusCode,
    ).toBe(404);
    const next = await upload(
      "public.svg",
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="20"/></svg>',
    );
    await req("PATCH", `/projects/${pid}/objects/${asset.id}`, {
      expectedVersion: 1,
      visibility: "customer",
      data: { fileId: next.json().id },
    });
    expect(
      (await req("GET", `/projects/${pid}/files/${fid}`, undefined, customer))
        .statusCode,
    ).toBe(404);
    const visible = await req(
      "GET",
      `/projects/${pid}/files/${next.json().id}`,
      undefined,
      customer,
    );
    expect(visible.statusCode).toBe(200);
    expect(visible.headers["content-type"]).toBe("image/svg+xml");
    expect(visible.headers["content-disposition"]).toContain("attachment");
    expect(visible.headers["content-security-policy"]).toContain("sandbox");
    expect(
      (await req("GET", `/projects/${pid2}/files/${fid}`)).statusCode,
    ).toBe(404);
    await req("PATCH", `/projects/${pid}/objects/${asset.id}`, {
      expectedVersion: 2,
      visibility: "team",
    });
    expect(
      (
        await req(
          "GET",
          `/projects/${pid}/files/${next.json().id}`,
          undefined,
          customer,
        )
      ).statusCode,
    ).toBe(404);
  });
  it("dry-run validates declared files without uploading or leaking paths", async () => {
    const manifest = {
      schemaVersion: 1,
      files: [
        {
          key: "demo",
          sha256: "a".repeat(64),
          size: 100,
          mimeType: "image/png",
        },
      ],
      objects: [
        {
          key: "dry-file-image",
          kind: "asset",
          title: "Dry",
          data: { fileId: "@file:demo" },
        },
      ],
    };
    const dry = await req("POST", `/projects/${pid}/import`, {
      manifest,
      dryRun: true,
    });
    expect(dry.statusCode, dry.body).toBe(200);
    expect(dry.json().created).toBe(1);
    expect(
      (await req("GET", `/projects/${pid}/objects?q=dry-file-image`)).json()
        .items,
    ).toHaveLength(0);
    expect(
      (
        await req("POST", `/projects/${pid}/import`, {
          manifest,
          dryRun: false,
        })
      ).statusCode,
    ).toBe(422);
  });
});

it("refuses privileged database credentials for the HTTP runtime", async () => {
  await expect(
    buildApp({
      databaseUrl: process.env.TEST_DATABASE_OWNER_URL!,
      allowedOrigin: origin,
      storageDir: storage,
      secureCookies: false,
      logger: false,
    }),
  ).rejects.toThrow("non-owner PostgreSQL role");
});

// SECURITY-GATE-002: regressions for proxy limits, administrator history and migration safety.
describe("security gate 002", () => {
  it("keeps authenticated API limits per principal and excludes image/static requests", async () => {
    const isolated = await buildApp({
      databaseUrl: process.env.TEST_DATABASE_URL!,
      allowedOrigin: origin,
      storageDir: storage,
      secureCookies: false,
      logger: false,
      trustProxy: "loopback",
      apiRateLimit: 1,
      authRateLimit: 2,
    });
    try {
      const get = (url: string, cookie: string) =>
        isolated.inject({
          method: "GET",
          url: "/api/v1" + url,
          headers: { cookie, "x-forwarded-for": "198.51.100.1" },
          remoteAddress: "127.0.0.1",
        });
      for (let n = 0; n < 4; n++)
        expect(
          (await get(`/projects/${pid}/files/${randomUUID()}`, admin))
            .statusCode,
        ).toBe(404);
      expect((await get("/auth/me", admin)).statusCode).toBe(200);
      expect((await get("/auth/me", admin)).statusCode).toBe(429);
      expect((await get("/auth/me", customer)).statusCode).toBe(200);
      expect(
        (await isolated.inject({ method: "GET", url: "/unknown-static" }))
          .statusCode,
      ).toBe(404);
      expect((await get("/health", admin)).statusCode).toBe(200);
      expect(
        (await get(`/projects/${pid}/files/${randomUUID()}`, "")).statusCode,
      ).toBe(401);
    } finally {
      await isolated.close();
    }
  });
  it("separates trusted proxy clients for login and ignores untrusted forwarding spoofing", async () => {
    const isolated = await buildApp({
      databaseUrl: process.env.TEST_DATABASE_URL!,
      allowedOrigin: origin,
      storageDir: storage,
      secureCookies: false,
      logger: false,
      trustProxy: "loopback",
      authRateLimit: 2,
    });
    try {
      const badLogin = (client: string, remoteAddress = "127.0.0.1") =>
        isolated.inject({
          method: "POST",
          url: "/api/v1/auth/login",
          headers: {
            origin,
            "x-agentstack-request": "1",
            "content-type": "application/json",
            "x-forwarded-for": client,
          },
          payload: {
            email: "nobody@example.test",
            password: "incorrect-password",
          },
          remoteAddress,
        });
      expect((await badLogin("198.51.100.1")).statusCode).toBe(401);
      expect((await badLogin("198.51.100.1")).statusCode).toBe(401);
      expect((await badLogin("198.51.100.1")).statusCode).toBe(429);
      expect((await badLogin("198.51.100.2")).statusCode).toBe(401);
      expect((await badLogin("198.51.100.3", "203.0.113.8")).statusCode).toBe(
        401,
      );
      expect((await badLogin("198.51.100.4", "203.0.113.8")).statusCode).toBe(
        401,
      );
      expect((await badLogin("198.51.100.5", "203.0.113.8")).statusCode).toBe(
        429,
      );
    } finally {
      await isolated.close();
    }
  });
  it("validates proxy configuration before trusting forwarded addresses", async () => {
    const { parseTrustedProxies } =
      await import("../src/shared/proxy.config.js");
    expect(parseTrustedProxies(undefined)).toEqual([]);
    expect(parseTrustedProxies("loopback,10.24.0.0/16,::1")).toEqual([
      "loopback",
      "10.24.0.0/16",
      "::1",
    ]);
    for (const value of [
      "true",
      "*",
      "0.0.0.0/0",
      "::/0",
      "example.com",
      "10.0.0.1/33",
      "127.0.0.1,",
      "0.0.0.0/1,128.0.0.0/1",
    ])
      expect(() => parseTrustedProxies(value)).toThrow();
  });
  it("version-checks user changes and stores only immutable safe administrative history", async () => {
    const initial = await req("POST", "/users", {
      email: "audit-user@example.test",
      name: "Before",
      password: "audit-initial-password",
    });
    expect(initial.statusCode, initial.body).toBe(201);
    const user = initial.json();
    expect(user.version).toBe(1);
    const update = await req("PATCH", `/users/${user.id}`, {
      expectedVersion: 1,
      name: "After",
    });
    expect(update.statusCode, update.body).toBe(200);
    expect(update.json().version).toBe(2);
    expect(
      (
        await req("PATCH", `/users/${user.id}`, {
          expectedVersion: 1,
          name: "Lost",
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await req("PATCH", `/users/${user.id}`, {
          expectedVersion: 2,
          password: "audit-replaced-password",
        })
      ).json().version,
    ).toBe(3);
    expect(
      (
        await req("PATCH", `/users/${user.id}`, {
          expectedVersion: 3,
          disabled: true,
        })
      ).json().version,
    ).toBe(4);
    const history = await req("GET", `/users/${user.id}/history`);
    expect(history.statusCode).toBe(200);
    expect(
      history.json().items.map((x: { version: number }) => x.version),
    ).toEqual([4, 3, 2, 1]);
    expect(history.body).not.toContain("audit-initial-password");
    expect(history.body).not.toContain("audit-replaced-password");
    expect(history.body).not.toContain("password_hash");
    expect(history.body).not.toContain("scrypt:");
    expect(history.json().items[1].changes).toContain("password_changed");
    expect(history.json().items[2].before.name).toBe("Before");
    expect(history.json().items[2].after.name).toBe("After");
    expect(
      (await req("GET", "/admin/activity", undefined, customer)).statusCode,
    ).toBe(403);
    expect(
      (await req("GET", `/users/${user.id}/history`, undefined, developer))
        .statusCode,
    ).toBe(403);
    const token = (
      await req("POST", `/projects/${pid}/tokens`, {
        name: "No audit access",
        scopes: ["read"],
      })
    ).json().token;
    expect(
      (
        await req("GET", "/admin/activity", undefined, "", {
          authorization: `Bearer ${token}`,
        })
      ).statusCode,
    ).toBe(403);
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    try {
      expect(
        (await pool.query("SELECT id FROM installation_admin_audit")).rows,
      ).toHaveLength(0);
      await expect(
        pool.query("UPDATE installation_admin_audit SET action='tampered'"),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        pool.query("INSERT INTO schema_migrations(version) VALUES(99)"),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await pool.end();
    }
  });
  it("soft-revokes memberships with monotonic versions and rejects stale replacements", async () => {
    const user = (
      await req("POST", "/users", {
        email: "membership@example.test",
        name: "Member",
        password: "membership-test-password",
      })
    ).json();
    const first = await req("POST", `/projects/${pid}/members`, {
      userId: user.id,
      role: "developer",
      expectedVersion: 0,
    });
    expect(first.json().version).toBe(1);
    expect(
      (
        await req("POST", `/projects/${pid}/members`, {
          userId: user.id,
          role: "customer",
          expectedVersion: 0,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await req("DELETE", `/projects/${pid}/members/${user.id}`, {
          expectedVersion: 1,
        })
      ).json().version,
    ).toBe(2);
    const all = (
      await req("GET", `/projects/${pid}/members?includeRevoked=true`)
    ).json().items;
    expect(
      all.find((m: { userId: string }) => m.userId === user.id),
    ).toMatchObject({ version: 2 });
    expect(
      all.find((m: { userId: string }) => m.userId === user.id).revokedAt,
    ).toBeTruthy();
    expect(
      (
        await req("POST", `/projects/${pid}/members`, {
          userId: user.id,
          role: "customer",
          expectedVersion: 0,
        })
      ).statusCode,
    ).toBe(409);
    const readd = await req("POST", `/projects/${pid}/members`, {
      userId: user.id,
      role: "customer",
      expectedVersion: 2,
    });
    expect(readd.json()).toMatchObject({ version: 3, revokedAt: null });
    expect(
      (
        await req("DELETE", `/projects/${pid}/members/${user.id}`, {
          expectedVersion: 1,
        })
      ).statusCode,
    ).toBe(409);
  });
  it("does not change a future-version database or rotate its application credentials", async () => {
    const pool = new Pool({
      connectionString: process.env.TEST_DATABASE_OWNER_URL,
    });
    let added = false;
    try {
      const before = (
        await pool.query(
          "SELECT rolpassword FROM pg_authid WHERE rolname='agentstack_app'",
        )
      ).rows[0].rolpassword;
      await pool.query("INSERT INTO schema_migrations(version) VALUES(99)");
      added = true;
      await expect(
        migrate(
          process.env.TEST_DATABASE_OWNER_URL!,
          "a-different-long-application-password",
        ),
      ).rejects.toThrow("newer than this AgentStack release");
      const after = (
        await pool.query(
          "SELECT rolpassword FROM pg_authid WHERE rolname='agentstack_app'",
        )
      ).rows[0].rolpassword;
      expect(before === after).toBe(true);
    } finally {
      if (added)
        await pool.query("DELETE FROM schema_migrations WHERE version=99");
      await pool.end();
    }
  });
  it("limits context by bytes with explicit continuation and oversized document fetch instructions", async () => {
    const p = (
      await req("POST", "/projects", {
        name: "Context budget",
        slug: "context-budget",
      })
    ).json();
    const manifest = {
      schemaVersion: 1,
      objects: Array.from({ length: 30 }, (_, i) => ({
        key: `large-doc-${i}`,
        kind: "document",
        title: `Document ${i}`,
        data: { markdown: "A".repeat(200000) },
      })),
    };
    expect(
      (await req("POST", `/projects/${p.id}/import`, { manifest })).statusCode,
    ).toBe(200);
    const response = await req("GET", `/projects/${p.id}/context`);
    expect(response.statusCode, response.body.slice(0, 200)).toBe(200);
    expect(Buffer.byteLength(response.body)).toBeLessThanOrEqual(1024 * 1024);
    const data = response.json();
    expect(data.truncated.documents).toBe(true);
    expect(data.contextBudget.complete).toBe(false);
    expect(data.omittedObjects[0].reason).toBe("context_budget");
    expect(data.continuations.documents.query.kind).toBe("document");
    expect(
      (await req("GET", data.omittedObjects[0].path)).json().data.markdown,
    ).toHaveLength(200000);
  });
  it("reconstructs hidden archived ancestry before aggregating visible historical progress", async () => {
    const p = (
      await req("POST", "/projects", {
        name: "History scope",
        slug: "history-scope",
      })
    ).json();
    const customerId = (await req("GET", "/users"))
      .json()
      .items.find(
        (u: { email: string }) => u.email === "customer@example.test",
      ).id;
    await req("POST", `/projects/${p.id}/members`, {
      userId: customerId,
      role: "customer",
    });
    const ep = (
      await req(
        "POST",
        `/projects/${p.id}/objects`,
        {
          key: "secret-epic",
          kind: "epic",
          title: "SecretEpicTitle",
          visibility: "team",
          data: {},
        },
        admin,
        { "idempotency-key": randomUUID() },
      )
    ).json();
    const story = (
      await req(
        "POST",
        `/projects/${p.id}/objects`,
        {
          key: "visible-story",
          kind: "story",
          title: "Visible",
          visibility: "customer",
          data: { epicId: ep.id },
        },
        admin,
        { "idempotency-key": randomUUID() },
      )
    ).json();
    await req("PATCH", `/projects/${p.id}/objects/${story.id}`, {
      expectedVersion: 1,
      status: "done",
    });
    await req("PATCH", `/projects/${p.id}/objects/${ep.id}`, {
      expectedVersion: 1,
      archived: true,
    });
    const response = await req(
      "GET",
      `/projects/${p.id}/progress`,
      undefined,
      customer,
    );
    expect(response.statusCode, response.body).toBe(200);
    const progress = response.json();
    expect(progress).toMatchObject({ total: 0, done: 0 });
    expect(progress.timeline.at(-1)).toMatchObject({ total: 0, done: 0 });
    expect(response.body).not.toContain("SecretEpicTitle");
    expect(response.body).not.toContain(ep.id);
  });
  it("keeps exact file-manifest repeats unchanged and deduplicates uploads by content", async () => {
    const content =
        '<svg xmlns="http://www.w3.org/2000/svg"><rect width="92" height="63"/></svg>',
      sha256 = createHash("sha256").update(content).digest("hex");
    const original = {
      schemaVersion: 1,
      files: [
        {
          key: "dedup-file",
          sha256,
          size: Buffer.byteLength(content),
          mimeType: "image/svg+xml",
        },
      ],
      objects: [
        {
          key: "dedup-asset",
          kind: "asset",
          title: "Dedup",
          data: { fileId: "@file:dedup-file" },
        },
      ],
    };
    const dry = await req("POST", `/projects/${pid}/import`, {
      manifest: original,
      dryRun: true,
    });
    expect(dry.statusCode, dry.body).toBe(200);
    const upload = () => {
      const boundary = "file-dedup-boundary";
      return app.inject({
        method: "POST",
        url: `/api/v1/projects/${pid}/files`,
        headers: {
          cookie: admin,
          origin,
          "x-agentstack-request": "1",
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload: Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="dedup.svg"\r\nContent-Type: image/svg+xml\r\n\r\n${content}\r\n--${boundary}--\r\n`,
        ),
      });
    };
    const file = await upload();
    expect(file.statusCode, file.body).toBe(201);
    const resolved = {
      ...original,
      files: [],
      objects: [{ ...original.objects[0], data: { fileId: file.json().id } }],
    };
    const applied = await req("POST", `/projects/${pid}/import`, {
      manifest: resolved,
    });
    expect(applied.statusCode, applied.body).toBe(200);
    const repeat = await req("POST", `/projects/${pid}/import`, {
      manifest: original,
      dryRun: true,
    });
    expect(repeat.statusCode, repeat.body).toBe(200);
    expect(repeat.json().unchanged).toBe(1);
    const uploadedAgain = await upload();
    expect(uploadedAgain.json().id).toBe(file.json().id);
    expect(
      (
        await req("POST", `/projects/${pid}/import`, { manifest: resolved })
      ).json().unchanged,
    ).toBe(1);
    const history = (
      await req(
        "GET",
        `/projects/${pid}/objects/${applied.json().items[0].id}/history`,
      )
    ).json();
    expect(history.items).toHaveLength(1);
  });
  it("imports flow alternatives separately and validates all state references", async () => {
    const manifest = {
      schemaVersion: 1,
      objects: [
        { key: "flow-main-screen", kind: "screen", title: "Main", data: {} },
        { key: "flow-state-screen", kind: "screen", title: "Error", data: {} },
        {
          key: "flow-state-aware",
          kind: "flow",
          title: "Recovery",
          data: {
            screenIds: ["@flow-main-screen"],
            stateIds: ["@flow-state-screen"],
          },
        },
      ],
    };
    const imported = await req("POST", `/projects/${pid}/import`, { manifest });
    expect(imported.statusCode, imported.body).toBe(200);
    const flow = imported
      .json()
      .items.find((o: { key: string }) => o.key === "flow-state-aware");
    expect(
      (await req("GET", `/projects/${pid}/objects/${flow.id}`)).json().data
        .stateIds,
    ).toHaveLength(1);
  });
});

it("upgrades an existing v1 installation without losing users and records an explicit baseline", async () => {
  const databaseName = `agentstack_upgrade_${randomUUID().replaceAll("-", "")}`;
  const owner = new Pool({
    connectionString: process.env.TEST_DATABASE_OWNER_URL,
  });
  let created = false;
  let old: Pool | undefined;
  try {
    await owner.query(`CREATE DATABASE ${databaseName}`);
    created = true;
    const url = new URL(process.env.TEST_DATABASE_OWNER_URL!);
    url.pathname = "/" + databaseName;
    old = new Pool({ connectionString: url.toString() });
    const { readFile } = await import("node:fs/promises");
    await old.query(
      await readFile(
        new URL("../src/db/001-initial.sql", import.meta.url),
        "utf8",
      ),
    );
    const id = randomUUID();
    await old.query(
      "INSERT INTO users(id,email,name,password_hash,is_admin) VALUES($1,'legacy-admin@example.test','Existing administrator','disabled-legacy-login',true)",
      [id],
    );
    await migrate(url.toString(), process.env.APP_DATABASE_PASSWORD!);
    expect(
      (await old.query("SELECT id,name,version FROM users WHERE id=$1", [id]))
        .rows[0],
    ).toEqual({ id, name: "Existing administrator", version: 1 });
    const audit = (
      await old.query(
        "SELECT source,action,target_id,after_snapshot FROM installation_admin_audit WHERE target_id=$1",
        [id],
      )
    ).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      source: "migration",
      action: "user.baseline",
      target_id: id,
    });
    expect(JSON.stringify(audit)).not.toContain("disabled-legacy-login");
    await migrate(url.toString(), process.env.APP_DATABASE_PASSWORD!);
    expect(
      (
        await old.query(
          "SELECT count(*)::int AS count FROM installation_admin_audit",
        )
      ).rows[0].count,
    ).toBe(1);
  } finally {
    await old?.end();
    if (created) await owner.query(`DROP DATABASE ${databaseName}`);
    await owner.end();
  }
});


describe('legacy operator migration', () => {
  it('dry-runs, preserves asset history and private provenance, and retries without duplicates', async () => {
    const { importLegacyReview } = await import('../src/migration/legacy-import.service.js');
    const target = await createObject('asset','Historical asset');
    const payload = {
      schemaVersion:1,legacySource:'synthetic-migration',
      comments:[{id:77,request_id:'legacy-request-77',variant:'E',screen:'asset-old',palette:'assets',author:'Legacy reviewer',body:'Make the asset clearer',principal:'private-legacy-principal',status:'done',version:2,created_at:'2026-01-01T12:00:00Z',updated_at:'2026-01-02T12:00:00Z',resolved_at:'2026-01-02T12:00:00Z',resolved_by:'Old agent',resolution:'Updated illustration',targetKey:target.key,importedAuthorUnverified:true}],
      events:[{id:91,comment_id:77,status:'open',author:'Legacy reviewer',principal:'private-legacy-principal',note:'Created',created_at:'2026-01-01T12:00:00Z'},{id:92,comment_id:77,status:'done',author:'Old agent',principal:'private-legacy-agent',note:'Updated illustration',created_at:'2026-01-02T12:00:00Z'}],
    };
    const options={ownerUrl:process.env.TEST_DATABASE_OWNER_URL!,projectId:pid,operatorEmail:'admin@example.test',payload,dryRun:true};
    await expect(importLegacyReview({...options,payload:{...payload,events:payload.events.slice(1)}})).rejects.toThrow('Legacy event/version mismatch');
    expect((await importLegacyReview(options)).comments).toBe(1);
    expect((await req('GET',`/projects/${pid}/notes?targetId=${target.id}`)).json().items).toHaveLength(0);
    expect((await importLegacyReview({...options,dryRun:false})).events).toBe(2);
    expect((await importLegacyReview({...options,dryRun:false})).skipped).toBe(1);
    const response=await req('GET',`/projects/${pid}/notes?targetId=${target.id}`);
    const note=response.json().items[0];
    expect(note.status).toBe('resolved');expect(note.version).toBe(2);
    expect(note.authorName).toContain('unverified');
    expect(response.body).not.toContain('private-legacy-principal');
    expect((await req('GET',`/projects/${pid}/notes/${note.id}/history`)).json().items).toHaveLength(2);
    await expect(importLegacyReview({...options,dryRun:false,payload:{...payload,comments:[{...payload.comments[0],body:'Changed upstream'}]}})).rejects.toThrow('differs from the previous import');
    const owner = new Pool({connectionString:process.env.TEST_DATABASE_OWNER_URL});
    try {
      const links = (await owner.query("SELECT target_id,note_id FROM legacy_links WHERE project_id=$1 AND source='concepts' AND kind='comment' AND legacy_id='77'",[pid])).rows;
      expect(links).toEqual([{target_id:target.id,note_id:note.id}]);
      await owner.query("DELETE FROM legacy_links WHERE project_id=$1 AND source='concepts' AND legacy_id='77'",[pid]);
      expect((await importLegacyReview({...options,dryRun:false})).skipped).toBe(1);
      expect((await owner.query("SELECT note_id FROM legacy_links WHERE project_id=$1 AND legacy_id='77'",[pid])).rows[0].note_id).toBe(note.id);
    } finally { await owner.end(); }
    const restricted = new Pool({connectionString:process.env.TEST_DATABASE_URL});
    try { await expect(restricted.query('SELECT * FROM legacy_provenance')).rejects.toThrow(); } finally {await restricted.end();}
  });
  it('rejects inconsistent legacy final status without partial writes', async () => {
    const { importLegacyReview } = await import('../src/migration/legacy-import.service.js');
    const target = await createObject('asset','Invalid history asset');
    const payload={schemaVersion:1,legacySource:'invalid-synthetic',comments:[{id:1,request_id:'req',variant:'E',screen:'asset-x',palette:'assets',author:'A',body:'B',principal:'legacy',status:'done',version:1,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z',resolved_at:'2026-01-01T00:00:00Z',resolved_by:'A',resolution:'R',targetKey:target.key,importedAuthorUnverified:true}],events:[{id:1,comment_id:1,status:'open',author:'A',principal:'legacy',note:'Open',created_at:'2026-01-01T00:00:00Z'}]};
    await expect(importLegacyReview({ownerUrl:process.env.TEST_DATABASE_OWNER_URL!,projectId:pid,operatorEmail:'admin@example.test',payload,dryRun:false})).rejects.toThrow('final status');
    expect((await req('GET',`/projects/${pid}/notes?targetId=${target.id}`)).json().items).toHaveLength(0);
  });
});

// LEGACY-DEEP-LINK-RESOLVER: merge this block after the shared integration setup.
describe("protected legacy deep-link resolver", () => {
  const resolveLegacy = (
    projectId: string,
    kind: string,
    key: string,
    note?: string,
    cookie = admin,
  ) =>
    req(
      "GET",
      `/projects/${projectId}/legacy?${new URLSearchParams({ kind, key, ...(note ? { note } : {}) })}`,
      undefined,
      cookie,
    );
  const mapLegacy = async (
    legacyId: string,
    targetId: string,
    noteId: string,
    projectId = pid,
  ) => {
    const owner = new Pool({
      connectionString: process.env.TEST_DATABASE_OWNER_URL,
    });
    try {
      await owner.query(
        "INSERT INTO legacy_links(project_id,source,kind,legacy_id,target_id,note_id) VALUES($1,'concepts','comment',$2,$3,$4)",
        [projectId, legacyId, targetId, noteId],
      );
    } finally {
      await owner.end();
    }
  };
  const addLegacyNote = async (targetId: string, targetVersion = 1) => {
    const response = await req(
      "POST",
      `/projects/${pid}/notes`,
      { targetId, targetVersion, body: "Imported review reference" },
      admin,
      { "idempotency-key": randomUUID() },
    );
    expect(response.statusCode, response.body).toBe(201);
    return response.json();
  };
  it("resolves screen and asset keys, optional old comment IDs and archived targets without provenance", async () => {
    const screen = await createObject("screen", "Legacy screen", {
      screenId: "restore-login",
      variant: "E",
      palette: "day",
    });
    const note = await addLegacyNote(screen.id);
    await mapLegacy("7001", screen.id, note.id);
    const resolved = await resolveLegacy(
      pid,
      "screen",
      screen.key,
      "7001",
      customer,
    );
    expect(resolved.statusCode, resolved.body).toBe(200);
    expect(resolved.json()).toEqual({
      targetId: screen.id,
      noteId: note.id,
      section: "screens",
    });
    expect(resolved.body).not.toContain("source");
    expect(resolved.body).not.toContain("Imported review reference");
    expect(resolved.body).not.toContain("principal");
    await req("PATCH", `/projects/${pid}/objects/${screen.id}`, {
      expectedVersion: 1,
      archived: true,
    });
    expect(
      (
        await resolveLegacy(pid, "screen", screen.key, undefined, customer)
      ).json(),
    ).toEqual({ targetId: screen.id, section: "screens" });
    const asset = await createObject("asset", "Legacy illustration", {});
    expect(
      (
        await resolveLegacy(pid, "asset", asset.key, undefined, customer)
      ).json(),
    ).toEqual({ targetId: asset.id, section: "assets" });
    expect(
      (await resolveLegacy(pid, "asset", screen.key, undefined, customer))
        .statusCode,
    ).toBe(404);
  });
  it("hides foreign projects, missing and mismatched comments, and invalid query data", async () => {
    const screen = await createObject("screen", "Visible target", {}),
      other = await createObject("screen", "Other target", {});
    const note = await addLegacyNote(other.id);
    await mapLegacy("7002", other.id, note.id);
    expect(
      (await resolveLegacy(pid, "screen", screen.key, "7002", customer))
        .statusCode,
    ).toBe(404);
    expect(
      (await resolveLegacy(pid, "screen", screen.key, "7999", customer))
        .statusCode,
    ).toBe(404);
    expect(
      (await resolveLegacy(pid2, "screen", screen.key, "7002", customer))
        .statusCode,
    ).toBe(404);
    expect(
      (await resolveLegacy(pid, "screen", screen.key, undefined, foreign))
        .statusCode,
    ).toBe(404);
    expect(
      (await resolveLegacy(pid, "screen", screen.key, undefined, ""))
        .statusCode,
    ).toBe(401);
    expect((await resolveLegacy(pid, "document", screen.key)).statusCode).toBe(
      400,
    );
    expect(
      (await resolveLegacy(pid, "screen", screen.key, "not-an-id")).statusCode,
    ).toBe(400);
    // Even a malformed imported link cannot reveal a note whose actual target differs.
    await mapLegacy("7003", screen.id, note.id);
    expect(
      (await resolveLegacy(pid, "screen", screen.key, "7003", customer))
        .statusCode,
    ).toBe(404);
  });
  it("checks present object access and historical target visibility for legacy notes", async () => {
    const internal = await createObject(
      "screen",
      "Internal before publication",
      {},
      "team",
    );
    const note = await addLegacyNote(internal.id);
    await mapLegacy("7004", internal.id, note.id);
    expect(
      (await resolveLegacy(pid, "screen", internal.key, undefined, customer))
        .statusCode,
    ).toBe(404);
    await req("PATCH", `/projects/${pid}/objects/${internal.id}`, {
      expectedVersion: 1,
      visibility: "customer",
    });
    expect(
      (await resolveLegacy(pid, "screen", internal.key, undefined, customer))
        .statusCode,
    ).toBe(200);
    // Legacy imports may carry a customer-visible note attached to a private revision.
    const owner = new Pool({
      connectionString: process.env.TEST_DATABASE_OWNER_URL,
    });
    try {
      await owner.query("UPDATE notes SET visibility='customer' WHERE id=$1", [
        note.id,
      ]);
    } finally {
      await owner.end();
    }
    expect(
      (await resolveLegacy(pid, "screen", internal.key, "7004", customer))
        .statusCode,
    ).toBe(404);
    expect(
      (await resolveLegacy(pid, "screen", internal.key, "7004", admin)).json(),
    ).toEqual({ targetId: internal.id, noteId: note.id, section: "screens" });
    const publicNote = await addLegacyNote(internal.id, 2);
    await mapLegacy("7005", internal.id, publicNote.id);
    expect(
      (await resolveLegacy(pid, "screen", internal.key, "7005", customer))
        .statusCode,
    ).toBe(200);
    await req("PATCH", `/projects/${pid}/objects/${internal.id}`, {
      expectedVersion: 2,
      visibility: "team",
    });
    expect(
      (await resolveLegacy(pid, "screen", internal.key, "7005", customer))
        .statusCode,
    ).toBe(404);
  });
});

// PROGRESS-STORY-VISIBILITY-REGRESSION: append independently of operator migration tests.
it("reconstructs private story intervals without carrying forward previously public completion", async () => {
  const projectResponse = await req("POST", "/projects", {
    name: "Story visibility history", slug: "story-visibility-history",
  });
  expect(projectResponse.statusCode).toBe(201);
  const projectId = projectResponse.json().id;
  const customerId = (await req("GET", "/users")).json().items.find(
    (u: { email: string }) => u.email === "customer@example.test",
  ).id;
  expect((await req("POST", `/projects/${projectId}/members`, {
    userId: customerId, role: "customer", expectedVersion: 0,
  })).statusCode).toBe(201);
  const actorId = (await req("GET", "/auth/me")).json().user.id;
  const owner = new Pool({ connectionString: process.env.TEST_DATABASE_OWNER_URL });
  const storyId = randomUUID(), epicId = randomUUID();
  // Insert immutable historical fixtures directly, without disabling history triggers.
  try {
    for (const [id,kind,version,status] of [
      [storyId,"story",3,"done"], [epicId,"epic",1,"backlog"],
    ] as const) {
      await owner.query("INSERT INTO objects(id,project_id,key,kind,title,visibility,status,version,data) VALUES($1,$2,$3,$4,$5,'customer',$6,$7,'{}')",
        [id,projectId,id,kind,kind,status,version]);
    }
    for (const [id,kind,version,visibility,status,day,title] of [
      [storyId,"story",1,"customer","done",1,"Public story"],
      [storyId,"story",2,"team","backlog",2,"Private intermediate title"],
      [epicId,"epic",1,"customer","backlog",2,"Public epic"],
      [storyId,"story",3,"customer","done",3,"Public story"],
    ] as const) {
      const at = `2026-01-0${day}T12:00:00.000Z`;
      const snapshot = {id,projectId,key:id,kind,title,description:"",tags:[],visibility,status,version,archived:false,data:{},createdAt:at,updatedAt:at};
      await owner.query("INSERT INTO object_revisions(id,project_id,object_id,version,actor_id,actor_name,source,summary,visibility,snapshot,created_at) VALUES($1,$2,$3,$4,$5,'Admin','web','Fixture',$6,$7,$8)",
        [randomUUID(),projectId,id,version,actorId,visibility,JSON.stringify(snapshot),at]);
    }
  } finally { await owner.end(); }
  const response = await req("GET", `/projects/${projectId}/progress`, undefined, customer);
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({total:1,done:1});
  expect(response.json().timeline).toEqual([
    {date:"2026-01-01",total:1,done:1,percent:100},
    {date:"2026-01-02",total:0,done:0,percent:0},
    {date:"2026-01-03",total:1,done:1,percent:100},
  ]);
  expect(response.body).not.toContain("Private intermediate title");
  const history = await req("GET", `/projects/${projectId}/objects/${storyId}/history`, undefined, customer);
  expect(history.statusCode).toBe(200);
  expect(history.json().items.map((item: {version:number})=>item.version).sort()).toEqual([1,3]);
  expect(history.body).not.toContain("Private intermediate title");
});

// IDLE-POOL-ERROR-REGRESSION
it('survives an idle database disconnect and logs only a bounded error code', async () => {
  const {Database}=await import('../src/db/database.service.js');
  const events:unknown[]=[];
  const database=new Database(process.env.TEST_DATABASE_URL!,event=>events.push(event));
  const owner=new Pool({connectionString:process.env.TEST_DATABASE_OWNER_URL});
  try {
    const client=await database.pool.connect();
    const pid=(await client.query('SELECT pg_backend_pid() AS id')).rows[0].id;
    client.release();
    const failed=new Promise<void>(resolve=>database.pool.once('error',()=>resolve()));
    await owner.query('SELECT pg_terminate_backend($1)',[pid]);
    await failed;
    expect(events).toEqual([{event:'database_pool_error',code:'57P01'}]);
    expect((await database.pool.query('SELECT 42 AS value')).rows[0].value).toBe(42);
    database.pool.emit('error',Object.assign(new Error('postgres://private-credential'),{code:'secret-not-a-code'}));
    expect(events.at(-1)).toEqual({event:'database_pool_error',code:'unknown'});
  } finally {await database.close();await owner.end();}
});

// RULE-SNAPSHOT-AND-EXPIRATION-REGRESSIONS: append without replacing root tests.
describe("claimed rules and expiring credentials", () => {
  const result = {summary:"Updated",checks:[{name:"unit",result:"passed"}]};
  const token = async (projectId: string, scopes=["read","write","review"]) => {
    const response=await req("POST",`/projects/${projectId}/tokens`,{name:"Expiry test",scopes});
    expect(response.statusCode).toBe(201);
    return {...response.json(),headers:{authorization:`Bearer ${response.json().token}`}};
  };
  const note = async (projectId=pid) => {
    const screen=await req("POST",`/projects/${projectId}/objects`,{key:randomUUID(),kind:"screen",title:"Rules test screen",visibility:"customer",data:{}},admin,{"idempotency-key":randomUUID()});
    expect(screen.statusCode).toBe(201);
    const response=await req("POST",`/projects/${projectId}/notes`,{targetId:screen.json().id,targetVersion:1,body:"Fix this screen"},admin,{"idempotency-key":randomUUID()});
    expect(response.statusCode).toBe(201);return response.json();
  };
  const transition=(projectId:string,noteId:string,expectedVersion:number,action:string,headers:Record<string,string>,extra={})=>req("POST",`/projects/${projectId}/notes/${noteId}/transition`,{expectedVersion,action,...extra},"",headers);
  it("records server rules at claim, rejects changed rules, refreshes explicitly and hides internal rule IDs",async()=>{
    const p=(await req("POST","/projects",{name:"Claim rules",slug:"claim-rules"})).json();
    const customerId=(await req("GET","/users")).json().items.find((u:{email:string})=>u.email==="customer@example.test").id;
    await req("POST",`/projects/${p.id}/members`,{userId:customerId,role:"customer",expectedVersion:0});
    const rule=(await req("POST",`/projects/${p.id}/objects`,{key:"rule-1",kind:"rule",title:"Internal policy",visibility:"team",data:{markdown:"First rules"}},admin,{"idempotency-key":randomUUID()})).json();
    const n=await note(p.id), agent=await token(p.id);
    const claim=await transition(p.id,n.id,1,"claim",agent.headers);
    expect(claim.statusCode,claim.body).toBe(200);
    expect(claim.json().claimedRuleRevisions).toEqual([{id:rule.id,version:1}]);
    const bundle=(await req("GET",`/projects/${p.id}/context`,undefined,"",agent.headers)).json();
    expect(bundle.activeClaims.find((item:{id:string})=>item.id===n.id).claimedRuleRevisions).toEqual([{id:rule.id,version:1}]);
    const updated=await req("PATCH",`/projects/${p.id}/objects/${rule.id}`,{expectedVersion:1,data:{markdown:"Changed rules"}});
    expect(updated.statusCode).toBe(200);
    const stale=await transition(p.id,n.id,2,"submit",agent.headers,{result});
    expect(stale.statusCode).toBe(409);expect(stale.json().error.code).toBe("rules_changed");
    expect((await req("GET",`/projects/${p.id}/notes/${n.id}`)).json().version).toBe(2);
    const renewal=await transition(p.id,n.id,2,"claim",agent.headers);
    expect(renewal.json().claimedRuleRevisions).toEqual([{id:rule.id,version:2}]);
    const second=(await req("POST",`/projects/${p.id}/objects`,{key:"rule-2",kind:"rule",title:"New rule",data:{markdown:"New rule"}},admin,{"idempotency-key":randomUUID()})).json();
    expect((await transition(p.id,n.id,3,"submit",agent.headers,{result})).statusCode).toBe(409);
    const refreshed=await transition(p.id,n.id,3,"claim",agent.headers);
    expect(refreshed.json().claimedRuleRevisions).toHaveLength(2);
    await req("PATCH",`/projects/${p.id}/objects/${second.id}`,{expectedVersion:1,archived:true});
    expect((await transition(p.id,n.id,4,"submit",agent.headers,{result})).statusCode).toBe(409);
    const finalClaim=await transition(p.id,n.id,4,"claim",agent.headers);
    expect(finalClaim.json().claimedRuleRevisions).toEqual([{id:rule.id,version:2}]);
    const submitted=await transition(p.id,n.id,5,"submit",agent.headers,{result});
    expect(submitted.statusCode,submitted.body).toBe(200);
    expect(submitted.json().claimedRuleRevisions).toEqual([{id:rule.id,version:2}]);
    expect((await transition(p.id,n.id,6,"resolve",agent.headers,{reason:"self accept"})).statusCode).toBe(403);
    const internalHistory=(await req("GET",`/projects/${p.id}/notes/${n.id}/history`)).json();
    expect(internalHistory.items.find((item:{version:number})=>item.version===2).snapshot.claimedRuleRevisions).toEqual([{id:rule.id,version:1}]);
    for(const path of [`/notes/${n.id}`,`/notes/${n.id}/history`,"/notes"]){
      const visible=await req("GET",`/projects/${p.id}${path}`,undefined,customer);
      expect(visible.statusCode).toBe(200);expect(visible.body).not.toContain(rule.id);expect(visible.body).not.toContain("claimedRuleRevisions");
    }
  });
  it("requires explicit fresh claim when an old lease has no known rule snapshot",async()=>{
    const n=await note(),agent=await token(pid);
    expect((await transition(pid,n.id,1,"claim",agent.headers)).statusCode).toBe(200);
    const owner=new Pool({connectionString:process.env.TEST_DATABASE_OWNER_URL});
    try{await owner.query("UPDATE notes SET claimed_rule_revisions=NULL WHERE id=$1",[n.id]);}finally{await owner.end();}
    const response=await transition(pid,n.id,2,"submit",agent.headers,{result});
    expect(response.statusCode).toBe(409);expect(response.json().error.code).toBe("rules_snapshot_required");
    expect((await transition(pid,n.id,2,"claim",agent.headers)).statusCode).toBe(200);
    expect((await transition(pid,n.id,3,"submit",agent.headers,{result})).statusCode).toBe(200);
  });
  it("expires leases and prevents the previous agent from submitting after another agent reclaims",async()=>{
    const n=await note(),first=await token(pid),second=await token(pid);
    expect((await transition(pid,n.id,1,"claim",first.headers)).statusCode).toBe(200);
    const owner=new Pool({connectionString:process.env.TEST_DATABASE_OWNER_URL});
    try{await owner.query("UPDATE notes SET claim_expires_at=now()-interval '1 second' WHERE id=$1",[n.id]);}finally{await owner.end();}
    expect((await transition(pid,n.id,2,"submit",first.headers,{result})).statusCode).toBe(409);
    expect((await transition(pid,n.id,2,"claim",second.headers)).statusCode).toBe(200);
    expect((await transition(pid,n.id,3,"submit",first.headers,{result})).statusCode).toBe(403);
    expect((await transition(pid,n.id,3,"submit",second.headers,{result})).statusCode).toBe(200);
  });
  it("enforces read-only token scopes, explicit revocation and token expiration with a live positive control",async()=>{
    const n=await note(),read=await token(pid,["read"]),expired=await token(pid),live=await token(pid);
    expect((await req("GET",`/projects/${pid}/objects`,undefined,"",read.headers)).statusCode).toBe(200);
    expect((await req("POST",`/projects/${pid}/objects`,{key:randomUUID(),kind:"screen",title:"Denied",data:{}},"",{...read.headers,"idempotency-key":randomUUID()})).statusCode).toBe(403);
    expect((await transition(pid,n.id,1,"claim",read.headers)).statusCode).toBe(403);
    expect((await req("DELETE",`/projects/${pid}/tokens/${read.id}`,{})).statusCode).toBe(200);
    expect((await req("GET",`/projects/${pid}/objects`,undefined,"",read.headers)).statusCode).toBe(401);
    const owner=new Pool({connectionString:process.env.TEST_DATABASE_OWNER_URL});
    try{await owner.query("UPDATE tokens SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);}finally{await owner.end();}
    expect((await req("GET",`/projects/${pid}/objects`,undefined,"",expired.headers)).statusCode).toBe(401);
    expect((await req("GET",`/projects/${pid}/objects`,undefined,"",live.headers)).statusCode).toBe(200);
  });
  it("expires sessions and invitations without affecting live credentials",async()=>{
    const login=await req("POST","/auth/login",{email:"other@example.test",password:"a-random-test-password-2"},"");
    expect(login.statusCode).toBe(200);
    const session=String(login.headers["set-cookie"]).split(";")[0]!;
    expect((await req("GET","/auth/me",undefined,session)).statusCode).toBe(200);
    const owner=new Pool({connectionString:process.env.TEST_DATABASE_OWNER_URL});
    const expired=(await req("POST",`/projects/${pid}/invitations`,{email:"expired-rule-test@example.test",role:"customer"})).json();
    const live=(await req("POST",`/projects/${pid}/invitations`,{email:"live-rule-test@example.test",role:"customer"})).json();
    try{
      const hash=createHash("sha256").update(decodeURIComponent(session.slice(session.indexOf("=")+1))).digest("hex");
      await owner.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE hash=$1",[hash]);
      await owner.query("UPDATE invitations SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);
    }finally{await owner.end();}
    expect((await req("GET","/auth/me",undefined,session)).statusCode).toBe(401);
    expect((await req("GET","/auth/me",undefined,admin)).statusCode).toBe(200);
    const accept=(invitation:{token:string})=>req("POST","/auth/accept-invitation",{token:invitation.token,name:"Invite",password:"long-test-password-12"},"");
    expect((await accept(expired)).statusCode).toBe(404);
    expect((await accept(live)).statusCode).toBe(200);
  });
});
it("upgrades v2 claims with explicitly unknown rules and preserves original history",async()=>{
  const databaseName=`agentstack_claim_upgrade_${randomUUID().replaceAll("-","")}`;
  const owner=new Pool({connectionString:process.env.TEST_DATABASE_OWNER_URL});let old:Pool|undefined,created=false;
  try{
    await owner.query(`CREATE DATABASE ${databaseName}`);created=true;
    const url=new URL(process.env.TEST_DATABASE_OWNER_URL!);url.pathname="/"+databaseName;
    old=new Pool({connectionString:url.toString()});
    const {readFile}=await import("node:fs/promises");
    for(const migration of ["001-initial.sql","002-user-audit.sql"]) await old.query(await readFile(new URL("../src/db/"+migration,import.meta.url),"utf8"));
    const actor=randomUUID(),project=randomUUID(),target=randomUUID(),noteId=randomUUID();
    await old.query("INSERT INTO users(id,email,name,password_hash) VALUES($1,'old-claim@example.test','Old actor','unused-test-hash')",[actor]);
    await old.query("INSERT INTO projects(id,name,slug) VALUES($1,'Old project','old-project')",[project]);
    await old.query("INSERT INTO objects(id,project_id,key,kind,title,visibility,status) VALUES($1,$2,'old','screen','Old target','customer','backlog')",[target,project]);
    await old.query("INSERT INTO object_revisions(id,project_id,object_id,version,actor_id,actor_name,source,summary,visibility,snapshot) VALUES($1,$2,$3,1,$4,'Old actor','web','Original','customer','{}')",[randomUUID(),project,target,actor]);
    await old.query("INSERT INTO notes(id,project_id,target_id,target_version,body,author_id,author_name,visibility,status,version,claimed_by,claim_expires_at) VALUES($1,$2,$3,1,'Old task',$4,'Old actor','customer','in_progress',2,'legacy-agent',now()+interval '1 hour')",[noteId,project,target,actor]);
    const historical={id:noteId,version:2,status:"in_progress",claimedBy:"Old agent"};
    await old.query("INSERT INTO note_revisions(id,project_id,note_id,version,actor_id,actor_name,source,summary,visibility,snapshot) VALUES($1,$2,$3,2,$4,'Old actor','web','Original','customer',$5)",[randomUUID(),project,noteId,actor,JSON.stringify(historical)]);
    await migrate(url.toString(),process.env.APP_DATABASE_PASSWORD!);
    expect((await old.query("SELECT status,version,claimed_rule_revisions FROM notes WHERE id=$1",[noteId])).rows[0]).toEqual({status:"in_progress",version:2,claimed_rule_revisions:null});
    expect((await old.query("SELECT snapshot FROM note_revisions WHERE note_id=$1",[noteId])).rows[0].snapshot).toEqual(historical);
    expect((await old.query("SELECT max(version) AS version FROM schema_migrations")).rows[0].version).toBe(5);
    await migrate(url.toString(),process.env.APP_DATABASE_PASSWORD!);
    expect((await old.query("SELECT count(*)::int AS count FROM note_revisions WHERE note_id=$1",[noteId])).rows[0].count).toBe(1);
  }finally{await old?.end();if(created)await owner.query(`DROP DATABASE ${databaseName}`);await owner.end();}
});

describe('repository connections and reviewed synchronization',()=>{
 const sha='a'.repeat(40);
 const source=(body:string)=>({path:'docs/spec.md',content:`---\nid: DOC-SPEC\ntitle: Spec\n---\n${body}`});
 const create=async()=>{const r=await req('POST',`/projects/${pid}/repositories`,{provider:'local',repository:'test-source',branch:'main',label:'Source',roots:['docs','epics','AGENTS.md']});expect(r.statusCode,r.body).toBe(201);return r.json();};
 it('restricts configuration and hides private paths from customers',async()=>{
  const config={provider:'local',repository:'private-name',branch:'main',label:'Source'};
  expect((await req('POST',`/projects/${pid}/repositories`,config,developer)).statusCode).toBe(403);
  const c=await create();expect((await req('GET',`/projects/${pid}/repositories/${c.id}`,undefined,customer)).statusCode).toBe(403);
  expect((await req('GET',`/projects/${pid2}/repositories/${c.id}`)).statusCode).toBe(404);
  expect((await req('PATCH',`/projects/${pid}/repositories/${c.id}`,{expectedVersion:2,label:'Stale'})).statusCode).toBe(409);
  expect((await req('POST',`/projects/${pid}/repositories`,{provider:'github',repository:'owner/repo',branch:'main',label:'Private',token:'synthetic-secret'})).statusCode).toBe(503);
 });
 it('stages agent proposals but only human applies, detects conflicts and preserves notes',async()=>{
  const c=await create(),base=`/projects/${pid}/repositories/${c.id}`;
  const token=(await req('POST',`/projects/${pid}/tokens`,{name:'Repository stager',scopes:['read','write']})).json().token,bearer={authorization:`Bearer ${token}`};
  const stage=async(content:string)=>{const r=await req('POST',base+'/snapshots',{expectedVersion:1,branch:'main',commit:sha,files:[source(content)]},'',bearer);expect(r.statusCode,r.body).toBe(201);expect(r.json().source).toBe('reported');return r.json();};
  const first=await stage('Initial content');expect(first.counts.new).toBe(1);
  const selection={expectedVersion:1,entries:[{key:'DOC-SPEC',expectedObjectVersion:null}]};
  expect((await req('POST',base+`/snapshots/${first.id}/apply`,selection,'',bearer)).statusCode).toBe(403);
  const applied=await req('POST',base+`/snapshots/${first.id}/apply`,selection,developer);expect(applied.statusCode,applied.body).toBe(200);const object=applied.json().objects[0];
  const note=await req('POST',`/projects/${pid}/notes`,{targetId:object.id,targetVersion:object.version,body:'Keep this discussion'},developer,{'idempotency-key':randomUUID()});expect(note.statusCode,note.body).toBe(201);
  expect((await req('PATCH',`/projects/${pid}/objects/${object.id}`,{expectedVersion:1,title:'Web edited title'})).statusCode).toBe(200);
  const unchanged=await stage('Initial content');expect(unchanged.counts.unchanged).toBe(1);
  const second=await stage('Repository content changed');expect(second.counts.conflict).toBe(1);
  const resolve={expectedVersion:1,entries:[{key:'DOC-SPEC',expectedObjectVersion:2}]};
  expect((await req('POST',base+`/snapshots/${second.id}/apply`,resolve)).statusCode).toBe(409);
  expect((await req('POST',base+`/snapshots/${second.id}/apply`,{...resolve,entries:[{...resolve.entries[0],resolveConflict:true,expectedObjectVersion:1}]})).statusCode).toBe(409);
  const resolved=await req('POST',base+`/snapshots/${second.id}/apply`,{...resolve,entries:[{...resolve.entries[0],resolveConflict:true}]});expect(resolved.statusCode,resolved.body).toBe(200);expect(resolved.json().objects[0].id).toBe(object.id);
  expect((await req('GET',`/projects/${pid}/notes?targetId=${object.id}`)).json().items.some((n:any)=>n.id===note.json().id)).toBe(true);
  const missing=await req('POST',base+'/snapshots',{expectedVersion:1,branch:'main',commit:sha,files:[{path:'docs/other.md',content:'# Other'}]});expect(missing.json().counts.missing).toBe(1);expect((await req('GET',`/projects/${pid}/objects/${object.id}`)).json().archived).toBe(false);
  await req('PATCH',base,{expectedVersion:1,branch:'release'});expect((await req('POST',base+`/snapshots/${second.id}/apply`,{...resolve,expectedVersion:2})).statusCode).toBe(409);
 });
 it('resolves selected epic/story hierarchy atomically and shares only sanitized pipelines',async()=>{
  const c=await create(),base=`/projects/${pid}/repositories/${c.id}`;
  const staged=await req('POST',base+'/snapshots',{expectedVersion:1,branch:'main',commit:sha,files:[{path:'epics/epic.md',content:'---\nid: EPIC-TEST\ntitle: Parent\n---\n# Parent'},{path:'epics/story.md',content:'---\nid: STORY-TEST\nepic: EPIC-TEST\ntitle: Child\nstatus: done\n---\n- [x] Completed'}],pipelines:[{id:'1',name:'Tests',status:'passed',commit:sha,url:'https://github.com/private/repo/actions/runs/1',updatedAt:'2026-11-05T00:00:00Z',source:'provider'}]});expect(staged.statusCode,staged.body).toBe(201);const s=staged.json();expect(s.pipelines[0].source).toBe('reported');
  const partial=await req('POST',base+`/snapshots/${s.id}/apply`,{expectedVersion:1,entries:[{key:'STORY-TEST',expectedObjectVersion:null}]});expect(partial.statusCode).toBe(422);
  const all=await req('POST',base+`/snapshots/${s.id}/apply`,{expectedVersion:1,entries:s.entries.map((e:any)=>({key:e.key,expectedObjectVersion:null}))});expect(all.statusCode,all.body).toBe(200);expect(all.json().applied).toBe(4);const epic=all.json().objects.find((o:any)=>o.kind==='epic'),story=all.json().objects.find((o:any)=>o.kind==='story');expect(story.data.epicId).toBe(epic.id);expect(story.status).toBe('done');
  expect((await req('GET',`/projects/${pid}/repositories/pipelines`,undefined,customer)).json().items).toHaveLength(0);
  await req('PATCH',base,{expectedVersion:1,sharePipelines:true});const shared=(await req('GET',`/projects/${pid}/repositories/pipelines`,undefined,customer)).json();expect(shared.items[0].pipelines[0].status).toBe('passed');expect(JSON.stringify(shared)).not.toContain('private/repo');expect(shared.items[0].pipelines[0].commit).toBeUndefined();
  await req('PATCH',base,{expectedVersion:2,archived:true});expect((await req('GET',base+`/snapshots/${s.id}`)).statusCode).toBe(200);expect((await req('POST',base+'/snapshots',{expectedVersion:3,branch:'main',commit:sha,files:[source('x')]})).statusCode).toBe(409);
 });
 it('enforces tenant RLS and immutable snapshot history directly in the app role',async()=>{
  const c=await create();const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});const client=await pool.connect();
  try{await client.query('BEGIN');await client.query("SELECT set_config('agentstack.project_id',$1,true)",[pid2]);expect((await client.query('SELECT id FROM repository_connections WHERE id=$1',[c.id])).rowCount).toBe(0);await client.query('ROLLBACK');}finally{client.release();await pool.end();}
 });
});

it('encrypts repository credentials, records sanitized config history and refreshes outside the request transaction',async()=>{
 const sha='d'.repeat(40),tree='e'.repeat(40),blob='f'.repeat(40);let calls=0;
 const remote=await buildApp({databaseUrl:process.env.TEST_DATABASE_URL!,allowedOrigin:origin,storageDir:storage,secureCookies:false,logger:false,repositoryEncryptionKey:Buffer.alloc(32,7).toString('base64'),repositoryFetch:async(url,init)=>{calls++;expect((init?.headers as any).Authorization).toBe('Bearer synthetic-private-token');const u=String(url);const data=u.includes('/commits/')?{sha,commit:{tree:{sha:tree}}}:u.includes('/trees/')?{truncated:false,tree:[{path:'docs/a.md',type:'blob',mode:'100644',sha:blob}]}:u.includes('/blobs/')?{encoding:'base64',content:Buffer.from('# Remote document').toString('base64')}:{workflow_runs:[]};return new Response(JSON.stringify(data));}});
 const call=(method:string,url:string,payload?:unknown)=>remote.inject({method:method as 'GET',url:'/api/v1'+url,payload:payload===undefined?undefined:JSON.stringify(payload),headers:{'content-type':'application/json',origin,cookie:admin,'x-agentstack-request':'1'}});
 const owner=new Pool({connectionString:process.env.TEST_DATABASE_OWNER_URL});
 try{
  const created=await call('POST',`/projects/${pid}/repositories`,{provider:'github',repository:'owner/repo',branch:'main',label:'Private remote',roots:['docs'],token:'synthetic-private-token'});expect(created.statusCode,created.body).toBe(201);const c=created.json();expect(c.hasCredential).toBe(true);expect(created.body).not.toContain('synthetic-private-token');const stored=(await owner.query('SELECT credential_ciphertext FROM repository_connections WHERE id=$1',[c.id])).rows[0].credential_ciphertext;expect(stored).not.toContain('synthetic-private-token');expect(stored).toMatch(/^v1\./);
  const refreshed=await call('POST',`/projects/${pid}/repositories/${c.id}/refresh`,{expectedVersion:1});expect(refreshed.statusCode,refreshed.body).toBe(201);expect(refreshed.json().source).toBe('provider');expect(refreshed.json().counts.new).toBe(1);expect(calls).toBe(4);
  expect((await call('POST',`/projects/${pid}/repositories/${c.id}/refresh`,{expectedVersion:1})).statusCode).toBe(429);expect(calls).toBe(4);
  const snapshotId=refreshed.json().id;
  const accepted=await call('POST',`/projects/${pid}/repositories/${c.id}/snapshots/${snapshotId}/apply`,{expectedVersion:1,entries:refreshed.json().entries.map((entry:any)=>({key:entry.key,expectedObjectVersion:null}))});expect(accepted.statusCode,accepted.body).toBe(200);
  const imported=accepted.json().objects[0];const linked=await req('GET',`/projects/${pid}/repositories/bindings?objectId=${imported.id}`,undefined,developer);expect(linked.statusCode,linked.body).toBe(200);expect(linked.json().items[0].sourceUrl).toBe(`https://github.com/owner/repo/blob/${sha}/docs/a.md`);expect(linked.json().items[0].commit).toBe(sha);
  await expect(owner.query('UPDATE repository_snapshots SET branch=$1 WHERE id=$2',['changed',snapshotId])).rejects.toThrow('immutable_history');
  await call('PATCH',`/projects/${pid}/repositories/${c.id}`,{expectedVersion:1,label:'Updated name',token:null});const audit=(await owner.query('SELECT data FROM audit_events WHERE target_id=$1 ORDER BY created_at',[c.id])).rows;expect(JSON.stringify(audit)).not.toContain('synthetic-private-token');expect(JSON.stringify(audit)).not.toContain(stored);expect(audit.at(-1).data.previous.label).toBe('Private remote');expect(audit.at(-1).data.connection.label).toBe('Updated name');
 }finally{await remote.close();await owner.end();}
});

it('rejects oversized repository changesets before storing snapshots',async()=>{
 const created=await req('POST',`/projects/${pid}/repositories`,{provider:'local',repository:'bounded',branch:'main',label:'Bounded',roots:['docs']});const c=created.json();const pool=new Pool({connectionString:process.env.TEST_DATABASE_OWNER_URL});
 try{const files=Array.from({length:32},(_,i)=>({path:`docs/${i}.md`,content:'\\'.repeat(120000)}));const r=await req('POST',`/projects/${pid}/repositories/${c.id}/snapshots`,{expectedVersion:1,branch:'main',commit:'b'.repeat(40),files});expect(r.statusCode,r.body).toBe(413);expect(r.json().error.code).toBe('repository_snapshot_too_large');expect((await pool.query('SELECT count(*)::int AS n FROM repository_snapshots WHERE connection_id=$1',[c.id])).rows[0].n).toBe(0);}finally{await pool.end();}
});

it("enforces repository tenant reads and WITH CHECK on all three tables with positive controls", async () => {
  const c = (
    await req("POST", `/projects/${pid}/repositories`, {
      provider: "local",
      repository: "rls-proof",
      branch: "main",
      label: "RLS proof",
      roots: ["docs"],
    })
  ).json();
  const base = `/projects/${pid}/repositories/${c.id}`;
  const staged = await req("POST", base + "/snapshots", {
    expectedVersion: 1,
    branch: "main",
    commit: "a".repeat(40),
    files: [
      { path: "docs/proof.md", content: "---\nid: RLS-PROOF\n---\n# Proof" },
    ],
  });
  expect(staged.statusCode, staged.body).toBe(201);
  const snapshot = staged.json();
  const applied = await req("POST", base + `/snapshots/${snapshot.id}/apply`, {
    expectedVersion: 1,
    entries: [{ key: "RLS-PROOF", expectedObjectVersion: null }],
  });
  expect(applied.statusCode, applied.body).toBe(200);
  const object = applied.json().objects[0];
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL }),
    client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('agentstack.project_id',$1,true)", [
      pid,
    ]);
    for (const table of [
      "repository_connections",
      "repository_snapshots",
      "repository_bindings",
    ])
      expect(
        (
          await client.query(`SELECT * FROM ${table} WHERE project_id=$1`, [
            pid,
          ])
        ).rowCount,
      ).toBeGreaterThan(0);
    const actor = (
      await client.query(
        "SELECT created_by FROM repository_connections WHERE id=$1",
        [c.id],
      )
    ).rows[0].created_by;
    await client.query("SELECT set_config('agentstack.project_id',$1,true)", [
      pid2,
    ]);
    for (const table of [
      "repository_connections",
      "repository_snapshots",
      "repository_bindings",
    ])
      expect(
        (
          await client.query(`SELECT * FROM ${table} WHERE project_id=$1`, [
            pid,
          ])
        ).rowCount,
      ).toBe(0);
    const forbiddenWrites = [
      () =>
        client.query(
          "INSERT INTO repository_connections(id,project_id,provider,repository,branch,label,roots,created_by) VALUES($1,$2,'local','rls','main','RLS',ARRAY['docs'],$3)",
          [randomUUID(), pid, actor],
        ),
      () =>
        client.query(
          "INSERT INTO repository_snapshots(id,project_id,connection_id,config_version,branch,commit_sha,source,drafts,pipelines,actor_id) VALUES($1,$2,$3,1,'main',$4,'reported','[]','[]',$5)",
          [randomUUID(), pid, c.id, "a".repeat(40), actor],
        ),
      () =>
        client.query(
          "INSERT INTO repository_bindings(project_id,connection_id,source_key,source_path,object_id,source_hash,object_hash,object_version,commit_sha,snapshot_id) VALUES($1,$2,'forged','docs/forged.md',$3,'a','b',1,$4,$5)",
          [pid, c.id, object.id, "a".repeat(40), snapshot.id],
        ),
    ];
    for (const write of forbiddenWrites) {
      await client.query("SAVEPOINT rls_check");
      await expect(write()).rejects.toMatchObject({ code: "42501" });
      await client.query("ROLLBACK TO SAVEPOINT rls_check");
    }
    await client.query("SELECT set_config('agentstack.project_id',$1,true)", [
      pid,
    ]);
    for (const table of ["repository_connections", "repository_bindings"]) {
      await client.query("SAVEPOINT rls_check");
      await expect(
        client.query(`UPDATE ${table} SET project_id=$2 WHERE project_id=$1`, [
          pid,
          pid2,
        ]),
      ).rejects.toMatchObject({ code: "42501" });
      await client.query("ROLLBACK TO SAVEPOINT rls_check");
    }
    await client.query("SAVEPOINT rls_check");
    await expect(
      client.query("UPDATE repository_snapshots SET branch=$1 WHERE id=$2", [
        "forbidden",
        snapshot.id,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    await client.query("ROLLBACK TO SAVEPOINT rls_check");
    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
  const team = await req(
    "GET",
    `/projects/${pid}/repositories/bindings?objectId=${object.id}`,
    undefined,
    developer,
  );
  expect(team.statusCode, team.body).toBe(200);
  expect(team.json().items[0]).toMatchObject({
    connectionId: c.id,
    objectId: object.id,
    path: "docs/proof.md",
    commit: "a".repeat(40),
    lastAppliedVersion: 1,
  });
  expect(team.json().items[0].sourceUrl).toBeUndefined();
  expect(
    (
      await req(
        "GET",
        `/projects/${pid}/repositories/bindings?objectId=${object.id}`,
        undefined,
        customer,
      )
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await req(
        "GET",
        `/projects/${pid2}/repositories/bindings?objectId=${object.id}`,
      )
    ).json().items,
  ).toEqual([]);
});

it.each(["token", "session", "membership", "configuration"])(
  "reauthorizes refresh after provider wait: %s revoked or changed",
  async (mode) => {
    const project = (
      await req("POST", "/projects", {
        name: `Refresh ${mode}`,
        slug: `refresh-${mode}`,
      })
    ).json();
    const c = (
      await req("POST", `/projects/${project.id}/repositories`, {
        provider: "github",
        repository: "owner/repo",
        branch: "main",
        label: "Paused source",
        roots: ["docs"],
      })
    ).json();
    let cookie = admin,
      bearer: Record<string, string> = {},
      tokenId = "";
    if (mode === "membership") {
      const m = await req("POST", `/projects/${project.id}/members`, {
        userId: devId,
        role: "developer",
      });
      expect(m.statusCode, m.body).toBe(201);
      cookie = developer;
    }
    if (mode === "token") {
      const token = (
        await req("POST", `/projects/${project.id}/tokens`, {
          name: "Revocable source",
          scopes: ["read", "write"],
        })
      ).json();
      tokenId = token.id;
      bearer = { authorization: `Bearer ${token.token}` };
      cookie = "";
    }
    if (mode === "session") {
      const session = await req(
        "POST",
        "/auth/login",
        { email: "admin@example.test", password: "a-random-test-password-1" },
        "",
      );
      cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    }
    let enter!: () => void, resume!: () => void;
    const entered = new Promise<void>((r) => {
        enter = r;
      }),
      paused = new Promise<void>((r) => {
        resume = r;
      });
    const sha = "a".repeat(40);
    const remote = await buildApp({
      databaseUrl: process.env.TEST_DATABASE_URL!,
      allowedOrigin: origin,
      storageDir: storage,
      secureCookies: false,
      logger: false,
      repositoryFetch: async (url) => {
        const u = String(url);
        if (u.includes("/commits/")) {
          enter();
          await paused;
          return new Response(
            JSON.stringify({ sha, commit: { tree: { sha } } }),
          );
        }
        if (u.includes("/trees/"))
          return new Response(
            JSON.stringify({
              truncated: false,
              tree: [{ path: "docs/a.md", type: "blob", mode: "100644", sha }],
            }),
          );
        if (u.includes("/blobs/"))
          return new Response(
            JSON.stringify({
              encoding: "base64",
              content: Buffer.from("# Paused document").toString("base64"),
            }),
          );
        return new Response(JSON.stringify({ workflow_runs: [] }));
      },
    });
    const owner = new Pool({
      connectionString: process.env.TEST_DATABASE_OWNER_URL,
    });
    try {
      const pending = remote
        .inject({
          method: "POST",
          url: `/api/v1/projects/${project.id}/repositories/${c.id}/refresh`,
          payload: { expectedVersion: 1 },
          headers: { origin, cookie, "x-agentstack-request": "1", ...bearer },
        })
        .then((r) => r);
      await entered;
      if (mode === "token")
        expect(
          (await req("DELETE", `/projects/${project.id}/tokens/${tokenId}`, {}))
            .statusCode,
        ).toBe(200);
      if (mode === "session")
        expect((await req("POST", "/auth/logout", {}, cookie)).statusCode).toBe(
          200,
        );
      if (mode === "membership")
        expect(
          (
            await req("DELETE", `/projects/${project.id}/members/${devId}`, {
              expectedVersion: 1,
            })
          ).statusCode,
        ).toBe(200);
      if (mode === "configuration")
        expect(
          (
            await req("PATCH", `/projects/${project.id}/repositories/${c.id}`, {
              expectedVersion: 1,
              branch: "release",
            })
          ).statusCode,
        ).toBe(200);
      resume();
      const result = await pending;
      expect(result.statusCode, result.body).toBe(
        mode === "membership" ? 404 : mode === "configuration" ? 409 : 401,
      );
      expect(
        (
          await owner.query(
            "SELECT count(*)::int AS n FROM repository_snapshots WHERE connection_id=$1",
            [c.id],
          )
        ).rows[0].n,
      ).toBe(0);
    } finally {
      resume();
      await remote.close();
      await owner.end();
    }
  },
);

it("applies all 600 drafts produced by 200 epic files with unique milestones", async () => {
  const c = (
      await req("POST", `/projects/${pid}/repositories`, {
        provider: "local",
        repository: "large-plan",
        branch: "main",
        label: "Large plan",
        roots: ["epics"],
      })
    ).json(),
    base = `/projects/${pid}/repositories/${c.id}`;
  const staged = await req("POST", base + "/snapshots", {
    expectedVersion: 1,
    branch: "main",
    commit: "c".repeat(40),
    files: Array.from({ length: 200 }, (_, i) => ({
      path: `epics/${i}.md`,
      content: `---\nid: EPIC-BULK-${i}\ntitle: Epic ${i}\nmilestone: Wave ${i}\n---\n# Delivery ${i}`,
    })),
  });
  expect(staged.statusCode, staged.body).toBe(201);
  const s = staged.json();
  expect(s.entries).toHaveLength(600);
  const result = await req("POST", base + `/snapshots/${s.id}/apply`, {
    expectedVersion: 1,
    entries: s.entries.map((e: any) => ({
      key: e.key,
      expectedObjectVersion: null,
    })),
  });
  expect(result.statusCode, result.body).toBe(200);
  expect(result.json().applied).toBe(600);
  expect(
    result.json().objects.filter((o: any) => o.kind === "wave"),
  ).toHaveLength(200);
}, 30000);
