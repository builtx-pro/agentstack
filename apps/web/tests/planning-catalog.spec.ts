import { test, expect } from "@playwright/test";
import { setupReviewApi } from "./fixtures/review-api.fixture";

test("delivery hierarchy expands with keyboard, shows children and opens independently", async ({
  page,
}, info) => {
  const fixture = await setupReviewApi(page);
  const epic = fixture.objects.find((o: any) => o.kind === "epic");
  await page.goto("/projects/project-one/plan?kind=epic");
  const expand = page.getByRole("button", {
    name: `Expand ${epic.title}`,
    exact: true,
  });
  await expand.focus();
  await page.keyboard.press("Enter");
  await expect(expand).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByText("Stories in this scope", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Open Explain recovery choices",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Open ${epic.title}`, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("button button")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("planning-expanded.png"),
    fullPage: true,
  });
});

test("epic descriptions render Markdown safely by default with inert source mode", async ({
  page,
}) => {
  const fixture = await setupReviewApi(page);
  const epic = fixture.objects.find((o: any) => o.kind === "epic");
  epic.description =
    "# Delivery contract\n\n**Clear acceptance**\n\n- [x] Tested\n\n<script>window.unsafeMarkdown=true</script>\n\n[unsafe](javascript:alert(1))";
  await page.goto(`/projects/project-one/plan?selected=${epic.id}`);
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Delivery contract" }),
  ).toBeVisible();
  await expect(dialog.locator("strong")).toHaveText("Clear acceptance");
  expect(
    await page.evaluate(() => (window as any).unsafeMarkdown),
  ).toBeUndefined();
  expect(await dialog.locator('a[href^="javascript:"]').count()).toBe(0);
  await dialog.getByText("Plain text", { exact: true }).click();
  await expect(dialog.locator("pre")).toContainText("# Delivery contract");
  await expect(
    dialog.getByRole("heading", { name: "Delivery contract" }),
  ).toHaveCount(0);
});

test("screen device filter persists in URL and uses wide desktop cards", async ({
  page,
}, info) => {
  const fixture = await setupReviewApi(page);
  const mobile = fixture.objects.find((o: any) => o.kind === "screen");
  fixture.objects.push({
    ...mobile,
    id: "web-overview",
    key: "web-overview",
    title: "Web overview",
    data: { ...mobile.data, frame: "desktop" },
  });
  await page.goto("/projects/project-one/screens?mode=grid");
  await page.getByRole("combobox", { name: "Device type" }).click();
  await page
    .getByRole("option", { name: "Desktop / Web", exact: true })
    .click();
  await expect(page).toHaveURL(/frame=desktop/);
  await expect(
    page.getByRole("button", { name: "Review Web overview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Review ${mobile.title}`, exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Device type" })).toHaveValue(
    "Desktop / Web",
  );
  const card = page.locator("article[data-frame=desktop]");
  await expect(card).toHaveCount(1);
  expect((await card.boundingBox())!.width).toBeGreaterThan(380);
  await page.screenshot({ path: info.outputPath("desktop-catalog.png") });
});

test("documents load cursor pages on demand, preserve content on error and retry without catalog drain", async ({
  page,
}) => {
  const fixture = await setupReviewApi(page);
  const template = fixture.objects.find((o: any) => o.kind === "document");
  const documents = Array.from({ length: 65 }, (_, index) => ({
    ...template,
    id: `doc-${index}`,
    key: `doc-${index}`,
    title: `Document ${index}`,
    data: { markdown: `# Document ${index}` },
  }));
  const requests: string[] = [];
  let failNext = true;
  await page.route(
    "**/api/v1/projects/project-one/objects?**",
    async (route) => {
      const url = new URL(route.request().url());
      requests.push(url.search);
      if (url.searchParams.get("kind") !== "document")
        return route.fulfill({ json: { items: [], nextCursor: null } });
      const cursor = Number(url.searchParams.get("cursor") ?? 0);
      if (cursor === 30 && failNext) {
        return route.fulfill({
          status: 503,
          json: { error: { code: "temporary_unavailable" } },
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
      const filtered = url.searchParams.get("q")
        ? documents.filter((d) => d.title.includes(url.searchParams.get("q")!))
        : documents;
      return route.fulfill({
        json: {
          items: filtered.slice(cursor, cursor + 30),
          nextCursor:
            cursor + 30 < filtered.length ? String(cursor + 30) : null,
        },
      });
    },
  );
  await page.goto("/projects/project-one/documents");
  await expect(page.getByText("30 items loaded")).toBeVisible();
  expect(requests).toHaveLength(1);
  await expect(
    page.getByRole("button", { name: /^Expand Document / }),
  ).toHaveCount(30);
  expect(requests[0]).toContain("limit=30");
  await page
    .getByRole("button", { name: "Load more items", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("30 items loaded")).toBeVisible();
  failNext = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("60 items loaded")).toBeVisible({
    timeout: 15000,
  });
  await page
    .getByRole("button", { name: "Load more items", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(page.getByText("65 items loaded")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Load more items", exact: true }),
  ).toHaveCount(0);
  await test
    .info()
    .attach("document-list-metrics", {
      body: JSON.stringify({
        loadedDocuments: 65,
        domNodes: await page.locator("*").count(),
        renderedMarkdownHeadings: await page.locator("main h3").count(),
      }),
      contentType: "application/json",
    });
  const before = requests.length;
  await page.waitForTimeout(500);
  expect(requests).toHaveLength(before);
  await page
    .getByRole("textbox", { name: "Search project items" })
    .fill("Document 64");
  await expect(page.getByText("1 items loaded")).toBeVisible();
  expect(requests.at(-1)).toContain("q=Document+64");
  await expect(
    page.getByRole("button", { name: "Open Document 64" }),
  ).toBeVisible();
  expect(
    requests.every(
      (url) => url.includes("limit=30") && url.includes("kind=document"),
    ),
  ).toBe(true);
});

test("a direct document link outside the first page loads its own detail", async ({
  page,
}) => {
  await setupReviewApi(page);
  await page.route("**/api/v1/projects/project-one/objects?**", (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  );
  await page.goto("/projects/project-one/documents?selected=project-brief");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Lumen workspace" }),
  ).toBeVisible();
});
