import { test, expect } from "@playwright/test";
import { setupReviewApi } from "./fixtures/review-api.fixture";

test("mobile repository preview keeps long titles, statuses and comparison controls inside the modal", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupReviewApi(page);
  const connection = {
    id: "repo-mobile",
    projectId: "project-one",
    provider: "local",
    repository: "sample-project",
    branch: "main",
    label: "Project source",
    roots: ["docs"],
    version: 1,
    archived: false,
    hasCredential: false,
    sharePipelines: false,
    updatedAt: "2026-11-05T12:00:00Z",
  };
  const titles = [
    "Правила проекта — работа с концептами, иллюстрациями и замечаниями всей команды",
    "ADR 0001 — «Воксели: люди»: десять персонажей, источник правды в Blender и правила подготовки материалов",
  ];
  const snapshot = {
    id: "snapshot-mobile",
    connectionId: connection.id,
    projectId: "project-one",
    commit: "a".repeat(40),
    branch: "main",
    source: "reported",
    createdAt: "2026-11-05T12:00:00Z",
    pipelines: [],
    entryCount: 2,
    counts: { new: 1, unchanged: 1, changed: 0, conflict: 0, missing: 0 },
    entries: titles.map((title, index) => ({
      key: `DOC-${index}`,
      path: `docs/architecture/${"long-relative-file-name-".repeat(4)}${index}.md`,
      kind: "document",
      title,
      state: index ? "unchanged" : "new",
      currentVersion: index ? 1 : null,
      draft: {
        key: `repo:${connection.id}:DOC-${index}`,
        kind: "document",
        title,
        description: "",
        tags: [],
        visibility: "team",
        status: "ready",
        data: { markdown: "# Draft\n\nReadable content." },
      },
    })),
  };
  await page.route("**/api/v1/projects/project-one/repositories**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/repositories"))
      return route.fulfill({ json: { items: [connection], nextCursor: null } });
    if (path.endsWith("/snapshots"))
      return route.fulfill({ json: { items: [snapshot], nextCursor: null } });
    if (path.endsWith("/snapshot-mobile"))
      return route.fulfill({ json: snapshot });
    return route.fulfill({
      status: 404,
      json: { error: { code: "not_found" } },
    });
  });
  await page.goto("/projects/project-one/settings#repositories");
  await page
    .getByRole("button", { name: "Review snapshot", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Review repository changes",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  for (const [index, title] of titles.entries()) {
    const compare = dialog.getByRole("button", {
      name: `Compare changes: ${title}`,
      exact: true,
    });
    await compare.scrollIntoViewIfNeeded();
    await expect(compare).toHaveText("Compare changes");
    const bounds = (await compare.boundingBox())!,
      modal = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(modal.x);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(modal.x + modal.width);
    const badge = dialog.getByText(index ? "unchanged" : "new", {
      exact: true,
    });
    expect(
      await badge.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
  }
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await dialog
    .getByRole("button", { name: `Compare changes: ${titles[0]}`, exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: `Hide comparison: ${titles[0]}`,
      exact: true,
    }),
  ).toHaveText("Hide comparison");
  await dialog
    .getByRole("button", { name: `Hide comparison: ${titles[0]}`, exact: true })
    .click();
  await dialog
    .getByRole("button", { name: `Compare changes: ${titles[0]}`, exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("repository-preview-long-titles-mobile.png"),
    fullPage: false,
    animations: "disabled",
  });
});
