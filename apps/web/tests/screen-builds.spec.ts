import { expect, test } from "@playwright/test";
import { setupReviewApi } from "./fixtures/review-api.fixture";

test("a designer records the exact design and can retry a conflict without losing evidence", async ({
  page,
}, testInfo) => {
  const { objects } = await setupReviewApi(page);
  const screen = objects.find(
    (item: { kind: string }) => item.kind === "screen",
  );
  Object.assign(screen, { version: 6, designVersion: 4, implementations: [] });
  let patches = 0;
  await page.route(
    `**/api/v1/projects/project-one/objects/${screen.id}`,
    async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      const patch = route.request().postDataJSON();
      patches++;
      if (patches === 1) {
        expect(patch.expectedVersion).toBe(6);
        screen.version = 7;
        return route.fulfill({
          status: 409,
          json: { error: { code: "version_conflict", message: "Changed" } },
        });
      }
      expect(patch).toEqual({
        expectedVersion: 7,
        screenImplementation: {
          platform: "android",
          state: "partial",
          designVersion: 4,
          build: "42",
          commit: "abcdef1",
          evidenceUrl: "https://example.test/builds/42",
        },
      });
      Object.assign(screen, {
        version: 8,
        implementations: [
          {
            ...patch.screenImplementation,
            source: "human",
            actorName: "Demo reviewer",
            reportedAt: "2026-11-05T12:00:00Z",
            visibility: "customer",
          },
        ],
      });
      return route.fulfill({ json: screen });
    },
  );
  await page.goto("/projects/project-one/screens?mode=grid");
  const card = page
    .getByRole("article")
    .filter({ has: page.getByText(screen.title, { exact: true }) });
  await expect(card.getByText("Design v4")).toBeVisible();
  await expect(card.getByText("No build evidence")).toBeVisible();
  const opener = card.getByRole("button", { name: "Review", exact: true });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Builds", exact: true }).click();
  await dialog.getByRole("button", { name: "Record implementation" }).click();
  await dialog.getByLabel("Platform", { exact: true }).selectOption("android");
  await dialog.getByLabel("Implementation status").selectOption("partial");
  await dialog.getByRole("textbox", { name: /^Build/ }).fill("42");
  await dialog
    .getByLabel("Evidence URL")
    .fill("https://name:secret@example.test/file");
  await dialog.getByLabel("Git commit").fill("abcdef1");
  await dialog.getByRole("button", { name: "Save report" }).click();
  await expect(
    dialog.getByText("Enter an HTTPS link without credentials."),
  ).toBeVisible();
  expect(patches).toBe(0);
  await dialog
    .getByLabel("Evidence URL")
    .fill("https://example.test/builds/42");
  await dialog.getByRole("button", { name: "Save report" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByRole("button", { name: "Refresh screen" }).click();
  await expect(dialog.getByRole("textbox", { name: /^Build/ })).toHaveValue(
    "42",
  );
  await dialog.getByRole("button", { name: "Save report" }).click();
  const android = dialog.getByRole("region", { name: "Android", exact: true });
  await expect(android.getByText("Partially implemented")).toBeVisible();
  await expect(
    android.getByRole("link", { name: "View evidence" }),
  ).toHaveAttribute("href", "https://example.test/builds/42");
  await expect(android.getByText(/Demo reviewer/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("desktop-builds.png") });
  await dialog.getByRole("tab", { name: "Versions & history" }).click();
  await expect(
    dialog.getByText("Design v4", { exact: false }).first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await expect(card.getByText(/Android.*Partially implemented/i)).toBeVisible();
});

test("mobile RU shows stale, app-only and independently missing build evidence to a customer", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem("agentstack.locale", "ru"),
  );
  const { objects } = await setupReviewApi(page, true, "ru");
  const screen = objects.find(
    (item: { kind: string }) => item.kind === "screen",
  );
  const report = {
    source: "agent",
    actorName: "Test agent",
    reportedAt: "2026-11-05T12:00:00Z",
    visibility: "customer",
    build: "103",
    evidenceUrl: "https://example.test/release/103",
  };
  Object.assign(screen, {
    version: 9,
    designVersion: 7,
    implementations: [
      {
        ...report,
        state: "implemented",
        designVersion: 2,
        platform: "android",
      },
      { ...report, state: "app_changed", designVersion: 7, platform: "ios" },
    ],
  });
  await page.goto("/projects/project-one/screens?mode=grid");
  const card = page
    .getByRole("article")
    .filter({ has: page.getByText(screen.title, { exact: true }) });
  await card.getByRole("button", { name: "Обсудить", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Сборки", exact: true }).click();
  await expect(
    dialog
      .getByRole("region", { name: "Android", exact: true })
      .getByText("Макет обновлён после сборки"),
  ).toBeVisible();
  await expect(
    dialog
      .getByRole("region", { name: "iOS", exact: true })
      .getByText("Изменения в приложении, соответствие не подтверждено"),
  ).toBeVisible();
  await expect(
    dialog
      .getByRole("region", { name: "Web", exact: true })
      .getByText("Нет подтверждения"),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Записать реализацию" }),
  ).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("mobile-builds.png") });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("explicitly marking a historical design as design-only does not imply current implementation", async ({
  page,
}) => {
  const { objects } = await setupReviewApi(page);
  const screen = objects.find(
    (item: { kind: string }) => item.kind === "screen",
  );
  Object.assign(screen, { version: 5, designVersion: 4, implementations: [] });
  let writes = 0;
  await page.route(
    `**/api/v1/projects/project-one/objects/${screen.id}`,
    async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      writes++;
      const patch = route.request().postDataJSON();
      expect(patch).toEqual({
        expectedVersion: 5,
        screenImplementation: {
          state: "design_only",
          platform: "web",
          designVersion: 1,
        },
      });
      Object.assign(screen, {
        version: 6,
        implementations: [
          {
            ...patch.screenImplementation,
            actorName: "Demo reviewer",
            reportedAt: "2026-11-05T12:00:00Z",
            source: "human",
            visibility: "customer",
          },
        ],
      });
      return route.fulfill({ json: screen });
    },
  );
  await page.goto("/projects/project-one/screens?mode=grid");
  const card = page
    .getByRole("article")
    .filter({ has: page.getByText(screen.title, { exact: true }) });
  await card.getByRole("button", { name: "Review", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Builds", exact: true }).click();
  await dialog.getByRole("button", { name: "Record implementation" }).click();
  await expect(dialog.getByLabel("Platform", { exact: true })).toBeFocused();
  await dialog.getByLabel("Platform", { exact: true }).selectOption("web");
  await dialog.getByLabel("Design version", { exact: true }).selectOption("1");
  await dialog.getByLabel("Implementation status").selectOption("design_only");
  await expect(dialog.getByLabel("Evidence URL")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Save report" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Build report saved.");
  await expect(
    dialog.getByRole("button", { name: "Record implementation" }),
  ).toBeFocused();
  await expect(
    dialog
      .getByRole("region", { name: "Web", exact: true })
      .getByText("Design v1"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card.getByText("Web · Design only (v1)")).toBeVisible();
  expect(writes).toBe(1);
});

test("viewer keeps drafts across tabs, loads history on demand and clears drafts for another screen", async ({
  page,
}) => {
  const { objects } = await setupReviewApi(page);
  const screens = objects.filter(
    (item: { kind: string }) => item.kind === "screen",
  );
  const [screen, other] = screens;
  Object.assign(screen, { version: 3, designVersion: 3 });
  Object.assign(other, { version: 3, designVersion: 3 });
  let historyReads = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.endsWith("/history")) historyReads++;
  });
  await page.goto(
    "/projects/project-one/screens?mode=grid&variant=__all&palette=__all",
  );
  const original = page
    .getByRole("article")
    .filter({ has: page.getByText(screen.title, { exact: true }) });
  await original.getByRole("button", { name: "Review", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const builds = dialog.getByRole("tab", { name: "Builds", exact: true });
  const history = dialog.getByRole("tab", { name: "Versions & history" });
  await expect(
    dialog.getByRole("tab", { name: "Review", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(historyReads).toBe(0);
  await builds.click();
  await dialog.getByRole("button", { name: "Record implementation" }).click();
  await dialog.getByLabel("Implementation status").selectOption("partial");
  await dialog.getByRole("textbox", { name: /^Build/ }).fill("draft build");
  await history.click();
  await dialog.getByLabel("Why restore this content?").fill("draft reason");
  await builds.click();
  await expect(dialog.getByRole("textbox", { name: /^Build/ })).toHaveValue(
    "draft build",
  );
  await expect(builds).toBeFocused();
  await history.click();
  await expect(dialog.getByLabel("Why restore this content?")).toHaveValue(
    "draft reason",
  );
  await page.evaluate((id) => {
    const url = new URL(location.href);
    url.searchParams.set("selected", id);
    history.pushState(history.state, "", url.href);
    dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
  }, other.id);
  await expect(
    dialog.getByRole("tab", { name: "Review", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await history.click();
  await expect(dialog.getByLabel("Why restore this content?")).toHaveValue("");
  await builds.click();
  await expect(
    dialog.getByRole("button", { name: "Record implementation" }),
  ).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: /^Build/ })).toHaveCount(0);
});
