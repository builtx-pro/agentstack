import { test, expect, type Page } from "@playwright/test";
import { setupReviewApi } from "./fixtures/review-api.fixture";

async function setupRepositories(
  page: Page,
  {
    customer = false,
    failCreate = false,
    local = false,
    failApply = false,
  } = {},
) {
  const fixture = await setupReviewApi(page, customer);
  let connections: any[] = [];
  let refreshes = 0,
    applies = 0,
    objectReads = 0,
    repositoryReads = 0,
    pipelineReads = 0;
  const writes: any[] = [];
  const connection = {
    id: "repo-one",
    projectId: "project-one",
    provider: local ? "local" : "github",
    repository: "sample/product",
    branch: "main",
    label: "Product source",
    roots: ["docs", "epics"],
    version: 1,
    archived: false,
    hasCredential: true,
    sharePipelines: true,
    updatedAt: "2026-11-05T12:00:00Z",
  };
  const existing = fixture.objects.find(
    (object: any) => object.id === "project-brief",
  );
  existing.key = "repo:repo-one:project-brief";
  fixture.objects.push({
    ...existing,
    id: "retained-source",
    key: "repo:repo-one:missing-doc",
    title: "Retained document",
    version: 2,
    data: { markdown: "# Retained current text" },
  });
  const draft = {
    key: "repo:repo-one:project-brief",
    kind: "document",
    title: "Repository brief",
    description: "Updated from Git",
    tags: [],
    visibility: "customer",
    status: "ready",
    data: { markdown: "# Proposed brief\n\nA clearer recovery workflow." },
  };
  const snapshot = {
    id: "snapshot-one",
    connectionId: "repo-one",
    projectId: "project-one",
    commit: "0123456789abcdef",
    branch: "main",
    source: "provider",
    createdAt: "2026-11-05T12:00:00Z",
    pipelines: [],
    entryCount: 2,
    entries: [
      {
        key: "project-brief",
        path: "docs/brief.md",
        kind: "document",
        title: "Repository brief",
        state: "conflict",
        currentVersion: 1,
        draft,
        reason: "Both sources changed",
      },
      {
        key: "missing-doc",
        path: "docs/removed.md",
        kind: "document",
        title: "Retained document",
        state: "missing",
        currentVersion: 2,
        draft: null,
      },
    ],
    counts: { conflict: 1, missing: 1 },
  };
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname.endsWith("/objects") &&
      request.method() === "GET"
    )
      objectReads++;
  });
  await page.route(
    "**/api/v1/projects/project-one/repositories**",
    async (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        pathname = url.pathname,
        method = request.method(),
        body = request.postDataJSON();
      if (method !== "GET") writes.push({ path: pathname, body });
      if (pathname.endsWith("/pipelines")) {
        pipelineReads++;
        return route.fulfill({
          json: {
            items: [
              {
                connectionId: "repo-one",
                label: "Product source",
                provider: "github",
                lastCheckedAt: "2026-11-05T12:00:00Z",
                pipelines: [
                  {
                    id: "run-one",
                    name: "Build and test",
                    status: "passed",
                    updatedAt: "2026-11-05T12:00:00Z",
                    source: "provider",
                    ...(!customer
                      ? {
                          commit: "0123456789abcdef",
                          url: "https://github.com/sample/product/actions/runs/1",
                        }
                      : {}),
                  },
                ],
              },
            ],
            nextCursor: null,
          },
        });
      }
      if (pathname.endsWith("/repositories")) {
        if (method === "POST") {
          if (failCreate)
            return route.fulfill({
              status: 502,
              json: {
                error: {
                  code: "provider_error",
                  message: "raw-token-should-never-render",
                },
              },
            });
          connections = [
            { ...connection, ...body, hasCredential: !!body.token },
          ];
          delete connections[0].token;
          return route.fulfill({ status: 201, json: connections[0] });
        }
        repositoryReads++;
        return route.fulfill({
          json: { items: connections, nextCursor: null },
        });
      }
      if (pathname.endsWith("/refresh")) {
        refreshes++;
        return route.fulfill({ status: 201, json: snapshot });
      }
      if (pathname.endsWith("/apply")) {
        applies++;
        if (failApply)
          return route.fulfill({
            status: 409,
            json: {
              error: {
                code: "version_conflict",
                message: "private-response-must-not-render",
              },
            },
          });
        return route.fulfill({
          json: {
            applied: 1,
            unchanged: 0,
            objects: [],
            snapshotId: snapshot.id,
          },
        });
      }
      if (pathname.endsWith("/snapshots"))
        return route.fulfill({
          json: { items: refreshes ? [snapshot] : [], nextCursor: null },
        });
      if (pathname.endsWith("/snapshot-one"))
        return route.fulfill({ json: snapshot });
      if (method === "PATCH") {
        Object.assign(connections[0], body, {
          version: connections[0].version + 1,
        });
        delete connections[0].token;
        return route.fulfill({ json: connections[0] });
      }
      return route.fulfill({
        status: 404,
        json: { error: { code: "not_found" } },
      });
    },
  );
  return {
    fixture,
    snapshot,
    writes,
    get pipelineReads() {
      return pipelineReads;
    },
    get refreshes() {
      return refreshes;
    },
    get applies() {
      return applies;
    },
    get objectReads() {
      return objectReads;
    },
    get repositoryReads() {
      return repositoryReads;
    },
  };
}
async function fillConnection(page: Page) {
  await page
    .getByRole("textbox", { name: "Connection name", exact: true })
    .fill("Product source");
  await page
    .getByRole("textbox", { name: "Repository", exact: true })
    .fill("sample/product");
  await page
    .getByLabel("Provider token", { exact: true })
    .fill("raw-token-should-never-render");
}

test("web connection stages a preview and conflicts require explicit human approval", async ({
  page,
}, testInfo) => {
  const state = await setupRepositories(page);
  await page.goto("/projects/project-one/settings#repositories");
  await expect(
    page.getByRole("heading", { name: "Connect a repository" }),
  ).toBeVisible();
  await fillConnection(page);
  await page
    .getByRole("button", { name: "Connect repository", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Review repository changes",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  expect(state.refreshes).toBe(1);
  expect(state.applies).toBe(0);
  expect(state.objectReads).toBe(1);
  await expect(
    dialog.getByRole("checkbox", { name: "Repository brief", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("checkbox", { name: "Retained document", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", {
      name: "Compare changes: Repository brief",
      exact: true,
    })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Proposed brief" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Lumen workspace", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", {
      name: "Compare changes: Retained document",
      exact: true,
    })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Retained current text", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", {
      name: "Compare changes: Repository brief",
      exact: true,
    })
    .click();
  await page.screenshot({
    path: testInfo.outputPath("repository-preview-desktop.png"),
    fullPage: false,
  });
  await dialog
    .getByLabel("Resolve conflict for Repository brief", { exact: true })
    .check();
  await dialog
    .getByRole("checkbox", { name: "Repository brief", exact: true })
    .check();
  await dialog.getByRole("button", { name: "Apply selected changes" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm and apply" }),
  ).toBeDisabled();
  await page
    .getByLabel("I reviewed these changes and approve applying them")
    .check();
  await page.getByRole("button", { name: "Confirm and apply" }).click();
  await expect(
    page.getByText("Selected changes were applied as new revisions."),
  ).toBeVisible();
  expect(state.applies).toBe(1);
  expect(
    state.writes.find((write) => write.path.endsWith("/apply")).body,
  ).toEqual({
    expectedVersion: 1,
    entries: [
      { key: "project-brief", expectedObjectVersion: 1, resolveConflict: true },
    ],
  });
  await dialog
    .getByRole("button", { name: "Close repository preview" })
    .click();
  await expect(page.getByLabel("Provider token", { exact: true })).toHaveValue(
    "",
  );
  expect(
    await page.evaluate(
      () => JSON.stringify(localStorage) + JSON.stringify(sessionStorage),
    ),
  ).not.toContain("raw-token-should-never-render");
});

test("failed provider connection clears its secret and never renders raw response text", async ({
  page,
}) => {
  await setupRepositories(page, { failCreate: true });
  await page.goto("/projects/project-one/settings#repositories");
  await fillConnection(page);
  await page
    .getByRole("button", { name: "Connect repository", exact: true })
    .click();
  await expect(
    page.getByText("The repository request did not complete.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Provider token", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByText("raw-token-should-never-render", { exact: false }),
  ).toHaveCount(0);
  expect(page.url()).not.toContain("raw-token");
});

test("local connection exposes CLI commands without trying a provider pull", async ({
  page,
}, testInfo) => {
  const state = await setupRepositories(page, { local: true });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/projects/project-one/settings#repositories");
  await page.getByRole("combobox", { name: "Provider", exact: true }).click();
  await page.getByRole("option", { name: "Local / CI" }).click();
  await page
    .getByRole("textbox", { name: "Connection name", exact: true })
    .fill("Local product");
  await page
    .getByRole("textbox", { name: "Repository", exact: true })
    .fill("local-product");
  await page
    .getByRole("button", { name: "Connect repository", exact: true })
    .click();
  await expect(
    page.getByText("Local checkouts are reported by your CLI or CI.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(state.refreshes).toBe(0);
  await expect(
    page.getByRole("button", { name: "Fetch and preview" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Copy local / CI command" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("repositories-mobile.png"),
    fullPage: true,
  });
});

test("customer delivery plan displays shared pipeline status without repository controls", async ({
  page,
}) => {
  const state = await setupRepositories(page, { customer: true });
  await page.goto("/projects/project-one/plan");
  await expect(page.getByText("Build and test", { exact: true })).toBeVisible();
  await expect(page.getByText("From provider", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Build and test" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("link", { name: "Review pending changes" }),
  ).toHaveCount(0);
  expect(state.repositoryReads).toBe(0);
  expect(state.objectReads).toBe(1);
});

test("connection settings are versioned and archived snapshot history stays readable", async ({
  page,
}) => {
  const state = await setupRepositories(page);
  await page.goto("/projects/project-one/settings#repositories");
  await fillConnection(page);
  await page
    .getByRole("button", { name: "Connect repository", exact: true })
    .click();
  await page.getByRole("button", { name: "Close repository preview" }).click();
  await page
    .getByRole("button", { name: "Edit connection settings", exact: true })
    .click();
  await page.getByLabel("Tracked branch").fill("release");
  await page.getByLabel("Tracked paths").fill("docs/product");
  await page.getByRole("button", { name: "Save connection settings" }).click();
  await expect(
    page.getByText("Connection updated.", { exact: true }),
  ).toBeVisible();
  const changed = state.writes.find(
    (write) => write.body?.branch === "release",
  );
  expect(changed.body).toEqual({
    expectedVersion: 1,
    label: "Product source",
    branch: "release",
    roots: ["docs/product"],
  });
  await page
    .getByRole("button", { name: "Archive connection", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Restore connection" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review snapshot", exact: true })
    .click();
  await expect(
    page.getByText("This connection is archived.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", {
      name: "Resolve conflict for Repository brief",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Apply selected changes" }),
  ).toBeDisabled();
  expect(state.applies).toBe(0);
});

test("rule changes have a separate human completion warning", async ({
  page,
}) => {
  const state = await setupRepositories(page);
  state.snapshot.entries[0].kind = "rule";
  state.snapshot.entries[0].state = "changed";
  state.snapshot.entries[0].draft!.kind = "rule";
  state.snapshot.entries[0].draft!.visibility = "team";
  await page.goto("/projects/project-one/settings#repositories");
  await fillConnection(page);
  await page
    .getByRole("button", { name: "Connect repository", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Repository brief", exact: true })
    .check();
  await page.getByRole("button", { name: "Apply selected changes" }).click();
  await expect(
    page.getByText("This selection includes agent rules or completed work.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm and apply" }),
  ).toBeDisabled();
  expect(state.applies).toBe(0);
});

test("pipeline polling is scoped to the visible plan and does not reload the catalog", async ({
  page,
}) => {
  await page.clock.install();
  const state = await setupRepositories(page);
  await page.goto("/projects/project-one/plan");
  await expect(page.getByText("Build and test", { exact: true })).toBeVisible();
  const initial = state.pipelineReads;
  await page.clock.fastForward(61000);
  await expect.poll(() => state.pipelineReads).toBeGreaterThan(initial);
  expect(state.objectReads).toBe(1);
  await page.getByRole("link", { name: "Knowledge", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Project knowledge" }),
  ).toBeVisible();
  const stopped = state.pipelineReads;
  await page.clock.fastForward(61000);
  expect(state.pipelineReads).toBe(stopped);
  expect(state.objectReads).toBe(1);
});

test("stale apply is not retried and refresh requires a new selection", async ({
  page,
}) => {
  const state = await setupRepositories(page, { failApply: true });
  await page.goto("/projects/project-one/settings#repositories");
  await fillConnection(page);
  await page
    .getByRole("button", { name: "Connect repository", exact: true })
    .click();
  await page
    .getByLabel("Resolve conflict for Repository brief", { exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Repository brief", exact: true })
    .check();
  await page.getByRole("button", { name: "Apply selected changes" }).click();
  await page
    .getByLabel("I reviewed these changes and approve applying them")
    .check();
  await page.getByRole("button", { name: "Confirm and apply" }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Confirm repository changes",
    exact: true,
  });
  await expect(
    confirmation.getByText("This connection or project item changed.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(state.applies).toBe(1);
  await expect(
    page.getByText("private-response-must-not-render", { exact: false }),
  ).toHaveCount(0);
  await confirmation.getByRole("button", { name: "Reload preview" }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByText("0 selected", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply selected changes" }),
  ).toBeDisabled();
  expect(state.applies).toBe(1);
});

test("bulk selection excludes unacknowledged conflicts, missing and unchanged entries", async ({
  page,
}) => {
  const state = await setupRepositories(page);
  const original = state.snapshot.entries[0];
  state.snapshot.entries.push({
    ...original,
    key: "NEW-DOC",
    title: "New handbook",
    path: "docs/new.md",
    state: "new",
    currentVersion: null as any,
    draft: {
      ...original.draft!,
      key: "repo:repo-one:NEW-DOC",
      title: "New handbook",
    },
  });
  state.snapshot.entries.push({
    ...original,
    key: "SAME-DOC",
    title: "Unchanged handbook",
    state: "unchanged",
    draft: {
      ...original.draft!,
      key: "repo:repo-one:SAME-DOC",
      title: "Unchanged handbook",
    },
  });
  await page.goto("/projects/project-one/settings#repositories");
  await fillConnection(page);
  await page
    .getByRole("button", { name: "Connect repository", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Select all eligible (1)", exact: true })
    .click();
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Repository brief", exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Retained document", exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Unchanged handbook", exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "New handbook", exact: true }),
  ).toBeChecked();
  expect(state.applies).toBe(0);
  await page.getByRole("button", { name: "Apply selected changes" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm and apply" }),
  ).toBeDisabled();
});
