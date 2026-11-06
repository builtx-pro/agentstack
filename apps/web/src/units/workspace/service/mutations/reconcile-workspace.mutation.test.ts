import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { reconcileWorkspace } from "./reconcile-workspace.mutation";
import { QueryKeys } from "@shared/lib/query-keys.constant";
import type { ProjectObject } from "@shared/api/schemas";
const object: ProjectObject = {
  id: "one",
  projectId: "project",
  key: "one",
  kind: "document",
  title: "Original",
  description: "",
  tags: [],
  visibility: "team",
  status: "backlog",
  version: 1,
  archived: false,
  data: { markdown: "Text" },
  createdAt: "2026-11-05",
  updatedAt: "2026-11-05",
};
function setup() {
  const client = new QueryClient();
  for (const key of [
    QueryKeys.objects("project"),
    QueryKeys.projects(),
    QueryKeys.notes("project"),
    QueryKeys.notes("project", "one"),
    [...QueryKeys.notes("project", "one"), "note", "history"],
    QueryKeys.progress("project"),
    QueryKeys.activity("project"),
    QueryKeys.history("project", "one"),
  ])
    client.setQueryData(key, key[2] === "objects" ? [object] : []);
  return client;
}
describe("targeted workspace cache reconciliation", () => {
  it("note writes refresh counts, discussions and note history without invalidating the catalog or project list", async () => {
    const client = setup();
    await reconcileWorkspace(
      client,
      "project",
      { path: "/projects/project/notes" },
      {},
    );
    expect(
      client.getQueryState(QueryKeys.objects("project"))?.isInvalidated,
    ).toBe(false);
    expect(client.getQueryState(QueryKeys.projects())?.isInvalidated).toBe(
      false,
    );
    for (const key of [
      QueryKeys.notes("project"),
      QueryKeys.notes("project", "one"),
      [...QueryKeys.notes("project", "one"), "note", "history"],
      QueryKeys.progress("project"),
      QueryKeys.activity("project"),
    ])
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    client.clear();
  });
  it("object edits update the exact cached row and refresh history without refetching the catalog", async () => {
    const client = setup();
    await reconcileWorkspace(
      client,
      "project",
      { path: "/projects/project/objects/one", method: "PATCH" },
      { ...object, title: "Revised", version: 2 },
    );
    expect(
      client.getQueryData<ProjectObject[]>(QueryKeys.objects("project"))?.[0]
        ?.title,
    ).toBe("Revised");
    expect(
      client.getQueryState(QueryKeys.objects("project"))?.isInvalidated,
    ).toBe(false);
    expect(
      client.getQueryState(QueryKeys.history("project", "one"))?.isInvalidated,
    ).toBe(true);
    client.clear();
  });
  it("does not let an older response overwrite a more recent cached revision", async () => {
    const client = setup();
    client.setQueryData(QueryKeys.objects("project"), [
      { ...object, version: 4 },
    ]);
    await reconcileWorkspace(
      client,
      "project",
      { path: "/projects/project/objects/one" },
      { ...object, version: 2 },
    );
    expect(
      client.getQueryData<ProjectObject[]>(QueryKeys.objects("project"))?.[0]
        ?.version,
    ).toBe(4);
    client.clear();
  });
  it("imports deliberately invalidate the full catalog", async () => {
    const client = setup();
    await reconcileWorkspace(
      client,
      "project",
      { path: "/projects/project/import" },
      {},
    );
    expect(
      client.getQueryState(QueryKeys.objects("project"))?.isInvalidated,
    ).toBe(true);
    client.clear();
  });
});
it("updates selected document detail and invalidates filtered pages after edits", async () => {
  const client = setup();
  const key = QueryKeys.objectPages("project", {
    kind: "document",
    q: "Original",
  });
  client.setQueryData(key, {
    pages: [{ items: [object], nextCursor: null }],
    pageParams: [null],
  });
  client.setQueryData(QueryKeys.object("project", "one"), object);
  await reconcileWorkspace(
    client,
    "project",
    { path: "/projects/project/objects/one", method: "PATCH" },
    { ...object, title: "Revised", version: 2 },
  );
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(
    client.getQueryData<ProjectObject>(QueryKeys.object("project", "one"))
      ?.title,
  ).toBe("Revised");
  client.clear();
});
