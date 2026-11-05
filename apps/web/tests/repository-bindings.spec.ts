import { test, expect } from "@playwright/test";
import { setupReviewApi } from "./fixtures/review-api.fixture";
const commit = "0123456789abcdef0123456789abcdef01234567";
const sourceUrl = `https://github.com/sample/product/blob/${commit}/docs/brief.md`;
test("team object viewer fetches one binding and links to its exact source commit", async ({
  page,
}, testInfo) => {
  await setupReviewApi(page);
  let reads = 0;
  await page.route(
    "**/api/v1/projects/project-one/repositories/bindings*",
    (route) => {
      reads++;
      expect(new URL(route.request().url()).searchParams.get("objectId")).toBe(
        "project-brief",
      );
      return route.fulfill({
        json: {
          items: [
            {
              objectId: "project-brief",
              connectionId: "repo-one",
              label: "Product source",
              path: "docs/brief.md",
              commit,
              sourceHash: "a".repeat(64),
              lastAppliedVersion: 1,
              sourceUrl,
            },
          ],
          nextCursor: null,
        },
      });
    },
  );
  await page.goto("/projects/project-one/documents");
  await expect(
    page.getByRole("heading", { name: "Project knowledge" }),
  ).toBeVisible();
  expect(reads).toBe(0);
  await page.goto("/projects/project-one/documents?selected=project-brief");
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Repository source", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "Product source / docs/brief.md" }),
  ).toHaveAttribute("href", sourceUrl);
  await expect(
    dialog.getByText(commit.slice(0, 12), { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Imported as v1", { exact: true }),
  ).toBeVisible();
  expect(reads).toBe(1);
  await dialog.getByText("Repository source",{exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("repository-source.png"),
    fullPage: false,
  });
});
test("customer object viewer does not request or display repository bindings", async ({
  page,
}) => {
  await setupReviewApi(page, true);
  let reads = 0;
  await page.route("**/repositories/bindings*", (route) => {
    reads++;
    return route.fulfill({
      status: 403,
      json: { error: { code: "forbidden" } },
    });
  });
  await page.goto("/projects/project-one/documents?selected=project-brief");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByText("Repository source", { exact: true }),
  ).toHaveCount(0);
  expect(reads).toBe(0);
});
