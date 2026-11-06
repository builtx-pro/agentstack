import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { buildApp } from "../src/app.js";
import { migrate } from "../src/db/migrate.js";
import { hashPassword, hashToken } from "../src/shared/crypto.util.js";
let app: Awaited<ReturnType<typeof buildApp>>,
  owner: Pool,
  storage: string,
  passwordHash: string;
const origin = "http://localhost:4100",
  password = "synthetic-task-password-123";
const req = (
  method: string,
  path: string,
  body?: unknown,
  cookie?: string,
  headers: Record<string, string> = {},
) =>
  app.inject({
    method: method as "GET",
    url: "/api/v1" + path,
    payload: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      origin,
      "x-agentstack-request": "1",
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
  });
async function actor(admin = false) {
  const id = randomUUID(),
    email = `task-${id}@example.test`;
  await owner.query(
    "INSERT INTO users(id,email,name,password_hash,is_admin) VALUES($1,$2,$3,$4,$5)",
    [id, email, "Task reviewer", passwordHash, admin],
  );
  const login = await req("POST", "/auth/login", { email, password });
  expect(login.statusCode).toBe(200);
  return { id, cookie: String(login.headers["set-cookie"]).split(";")[0]! };
}
async function project(
  a: Awaited<ReturnType<typeof actor>>,
  role = "developer",
) {
  const id = randomUUID();
  await owner.query("INSERT INTO projects(id,name,slug) VALUES($1,$2,$3)", [
    id,
    "Synthetic project",
    id,
  ]);
  await owner.query(
    "INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3)",
    [id, a.id, role],
  );
  return id;
}
async function story(
  projectId: string,
  assigneeId: string,
  visibility = "team",
) {
  const id = randomUUID();
  await owner.query(
    "INSERT INTO objects(id,project_id,key,kind,title,description,visibility,data,status) VALUES($1::uuid,$2,$1::text,'story','Assigned work','Work details',$3,$4,'ready')",
    [
      id,
      projectId,
      visibility,
      JSON.stringify({
        assigneeId,
        priority: "high",
        blocked: false,
        checklist: [],
      }),
    ],
  );
  return id;
}
beforeAll(async () => {
  if (!process.env.TEST_DATABASE_OWNER_URL) throw Error("Use isolated runner");
  await migrate(
    process.env.TEST_DATABASE_OWNER_URL,
    process.env.APP_DATABASE_PASSWORD!,
  );
  owner = new Pool({ connectionString: process.env.TEST_DATABASE_OWNER_URL });
  passwordHash = await hashPassword(password);
  storage = await mkdtemp(join(tmpdir(), "agentstack-tasks-"));
  app = await buildApp({
    databaseUrl: process.env.TEST_DATABASE_URL!,
    allowedOrigin: origin,
    storageDir: storage,
    secureCookies: false,
    logger: false,
    authRateLimit: 1000,
    apiRateLimit: 10000,
  });
});
afterAll(async () => {
  await app?.close();
  await owner?.end();
  if (storage) await rm(storage, { recursive: true, force: true });
});
describe("Personal and assigned tasks", () => {
  it("creates idempotently, transitions with CAS, archives and keeps immutable owner history", async () => {
    const a = await actor(),
      id = randomUUID(),
      draft = { id, title: "Write a proposal", priority: "high" };
    const initial = await req("POST", "/tasks", draft, a.cookie);
    expect(initial.statusCode, initial.body).toBe(201);
    expect(initial.json()).toMatchObject({
      id,
      source: "personal",
      projectId: null,
      status: "backlog",
      version: 1,
      priority: "high",
    });
    const repeat = await req("POST", "/tasks", draft, a.cookie);
    expect(repeat.statusCode).toBe(200);
    expect(repeat.json().version).toBe(1);
    expect(
      (await req("POST", "/tasks", { ...draft, title: "Different" }, a.cookie))
        .statusCode,
    ).toBe(409);
    const update = await req(
      "PATCH",
      `/tasks/${id}`,
      {
        expectedVersion: 1,
        status: "in_progress",
        checklist: [{ id: "a", text: "First", done: true }],
      },
      a.cookie,
    );
    expect(update.statusCode, update.body).toBe(200);
    expect(update.json().version).toBe(2);
    expect(update.json().priority).toBe("high");
    expect(
      (
        await req(
          "PATCH",
          `/tasks/${id}`,
          { expectedVersion: 1, status: "done" },
          a.cookie,
        )
      ).statusCode,
    ).toBe(409);
    await req(
      "PATCH",
      `/tasks/${id}`,
      { expectedVersion: 2, archived: true },
      a.cookie,
    );
    expect(
      (await req("GET", "/tasks", undefined, a.cookie)).json().items,
    ).toEqual([]);
    expect(
      (await req("GET", "/tasks?archived=true", undefined, a.cookie)).json()
        .items,
    ).toHaveLength(1);
    const history = (
      await req("GET", `/tasks/${id}/history`, undefined, a.cookie)
    ).json();
    expect(history.items).toHaveLength(3);
    expect(history.items.map((r: any) => r.version)).toEqual([3, 2, 1]);
    expect(history.items[0].snapshot.archived).toBe(true);
  });
  it("keeps personal tasks private even from another installation administrator and rejects agent tokens", async () => {
    const a = await actor(),
      b = await actor(true),
      id = randomUUID();
    await req("POST", "/tasks", { id, title: "Private" }, a.cookie);
    for (const route of [`/tasks/${id}`, `/tasks/${id}/history`])
      expect((await req("GET", route, undefined, b.cookie)).statusCode).toBe(
        404,
      );
    expect(
      (await req("GET", "/tasks", undefined, b.cookie)).json().items,
    ).toEqual([]);
    expect(
      (
        await req(
          "PATCH",
          `/tasks/${id}`,
          { expectedVersion: 1, title: "No" },
          b.cookie,
        )
      ).statusCode,
    ).toBe(404);
    const pid = await project(b),
      secret = randomUUID();
    await owner.query(
      "INSERT INTO tokens(id,project_id,user_id,hash,name,scopes,expires_at) VALUES($1,$2,$3,$4,'Agent',$5,now()+interval '1 day')",
      [randomUUID(), pid, b.id, hashToken(secret), ["read", "write", "review"]],
    );
    expect(
      (
        await req("GET", "/tasks", undefined, undefined, {
          authorization: `Bearer ${secret}`,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await req(
          "POST",
          "/tasks",
          { id: randomUUID(), title: "No" },
          undefined,
          { authorization: `Bearer ${secret}` },
        )
      ).statusCode,
    ).toBe(403);
  });
  it("aggregates only own assigned accessible stories, respects visibility, revoked membership and project archive", async () => {
    const a = await actor(),
      other = await actor();
    const p1 = await project(a),
      p2 = await project(a, "customer"),
      p3 = await project(other);
    const visible = await story(p1, a.id),
      customerVisible = await story(p2, a.id, "customer");
    await story(p1, other.id);
    await story(p2, a.id);
    await story(p3, a.id);
    const list = await req(
      "GET",
      "/tasks?source=assigned",
      undefined,
      a.cookie,
    );
    expect(list.statusCode, list.body).toBe(200);
    expect(
      list
        .json()
        .items.map((t: any) => t.id)
        .sort(),
    ).toEqual([visible, customerVisible].sort());
    expect(
      list.json().items.find((item: any) => item.id === customerVisible)
        .canEdit,
    ).toBe(false);
    expect(
      list.json().items.find((item: any) => item.id === visible).canEdit,
    ).toBe(true);
    expect(list.json().items[0]).toMatchObject({
      source: "project",
      projectName: "Synthetic project",
      status: "ready",
    });
    await owner.query(
      "UPDATE memberships SET revoked_at=now() WHERE project_id=$1 AND user_id=$2",
      [p1, a.id],
    );
    await owner.query("UPDATE projects SET archived=true WHERE id=$1", [p2]);
    expect(
      (await req("GET", "/tasks?source=assigned", undefined, a.cookie)).json()
        .items,
    ).toEqual([]);
  });
  it("removes an assignment immediately when its assignee changes", async () => {
    const a = await actor(),
      other = await actor(),
      pid = await project(a);
    const id = await story(pid, a.id);
    expect(
      (await req("GET", "/tasks?source=assigned", undefined, a.cookie)).json()
        .items,
    ).toHaveLength(1);
    await owner.query(
      "UPDATE objects SET data=jsonb_set(data,'{assigneeId}',to_jsonb($2::text)) WHERE id=$1",
      [id, other.id],
    );
    expect(
      (await req("GET", "/tasks?source=assigned", undefined, a.cookie)).json()
        .items,
    ).toEqual([]);
  });
  it("paginates across personal and assigned sources without duplicates and rejects malformed cursors", async () => {
    const a = await actor(),
      pid = await project(a);
    for (let i = 0; i < 3; i++)
      await req(
        "POST",
        "/tasks",
        { id: randomUUID(), title: `Searchable ${i}` },
        a.cookie,
      );
    for (let i = 0; i < 2; i++) await story(pid, a.id);
    let cursor: string | null = null;
    const ids: string[] = [];
    do {
      const page = await req(
        "GET",
        "/tasks?limit=2" +
          (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
        undefined,
        a.cookie,
      );
      expect(page.statusCode, page.body).toBe(200);
      ids.push(...page.json().items.map((t: any) => t.source + ":" + t.id));
      cursor = page.json().nextCursor;
    } while (cursor);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(
      (
        await req(
          "GET",
          "/tasks?q=Searchable&source=personal",
          undefined,
          a.cookie,
        )
      ).json().items,
    ).toHaveLength(3);
    expect(
      (await req("GET", "/tasks?cursor=bad", undefined, a.cookie)).statusCode,
    ).toBe(400);
  });
  it("enforces owner RLS directly and leaves assigned-story access closed outside the dedicated transaction", async () => {
    const a = await actor(),
      b = await actor(),
      pid = await project(a),
      id = randomUUID();
    await story(pid, a.id);
    await req("POST", "/tasks", { id, title: "Mine" }, a.cookie);
    const restricted = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const db = await restricted.connect();
    try {
      await db.query("BEGIN");
      await db.query(
        "SELECT set_config('agentstack.user_id',$1,true),set_config('agentstack.is_admin','true',true)",
        [b.id],
      );
      expect((await db.query("SELECT id FROM personal_tasks")).rowCount).toBe(
        0,
      );
      expect(
        (await db.query("SELECT id FROM personal_task_history")).rowCount,
      ).toBe(0);
      await expect(
        db.query(
          "INSERT INTO personal_tasks(owner_id,id,title,creation_hash) VALUES($1,$2,'Denied','synthetic-hash')",
          [a.id, randomUUID()],
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await db.query("ROLLBACK");
      await db.query("BEGIN");
      await db.query("SELECT set_config('agentstack.user_id',$1,true)", [a.id]);
      expect((await db.query("SELECT id FROM personal_tasks")).rowCount).toBe(
        1,
      );
      expect((await db.query("SELECT id FROM objects")).rowCount).toBe(0);
      await db.query(
        "SELECT set_config('agentstack.personal_board','true',true)",
      );
      expect((await db.query("SELECT id FROM objects")).rowCount).toBe(1);
      expect(
        (await db.query("UPDATE objects SET title='Denied'")).rowCount,
      ).toBe(0);

      await expect(
        db.query("UPDATE personal_task_history SET action='x'"),
      ).rejects.toThrow();
      await db.query("ROLLBACK");
    } finally {
      db.release();
      await restricted.end();
    }
  });
});
