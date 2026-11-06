import { test, expect } from "@playwright/test";
import { setupReviewApi } from "./fixtures/review-api.fixture";
test("private task create, keyboard move, version conflict preserves draft and history", async ({
  page,
}) => {
  await setupReviewApi(page);
  const items: any[] = [];
  let conflict = false;
  const history: any[] = [];
  await page.route("**/api/v1/tasks**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      body = request.postDataJSON();
    if (url.pathname.endsWith("/history"))
      return route.fulfill({ json: { items: history, nextCursor: null } });
    if (request.method() === "GET") {
      expect(url.searchParams.has("status")).toBe(false);
      return route.fulfill({ json: url.pathname === "/api/v1/tasks" ? { items, nextCursor: null } : items[0] });
    }
    if (request.method() === "POST") {
      const task = {
        ...body,
        source: "personal",
        canEdit: true,
        projectId: null,
        projectName: null,
        archived: false,
        version: 1,
        createdAt: "2026-11-06T10:00:00Z",
        updatedAt: "2026-11-06T10:00:00Z",
      };
      items.push(task);
      history.push({
        id: "r1",
        version: 1,
        createdAt: task.createdAt,
        snapshot: structuredClone(task),
      });
      return route.fulfill({ status: 201, json: task });
    }
    if (conflict) {
      conflict = false;
      items[0].version++;
      items[0].description = "Updated in another session";
      return route.fulfill({
        status: 409,
        json: {
          error: {
            code: "version_conflict",
            message: "Changed by another session",
          },
        },
      });
    }
    expect(body.expectedVersion).toBe(items[0].version);
    Object.assign(items[0], body, { version: items[0].version + 1 });
    history.unshift({
      id: "r2",
      version: items[0].version,
      createdAt: items[0].createdAt,
      snapshot: structuredClone(items[0]),
    });
    return route.fulfill({ json: items[0] });
  });
  await page.goto("/tasks");
  await page
    .getByRole("button", { name: "New private task", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Review my release");
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Check the actual deployment");
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const card = page
    .getByRole("article")
    .filter({ hasText: "Review my release" });
  await card.getByRole("combobox", { name: "Move Review my release" }).click();
  await page.getByRole("option", { name: "In progress", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "In progress", exact: true })
      .getByRole("button", { name: "Review my release" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review my release" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Keep my draft");
  conflict = true;
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Keep my draft");
  await page.getByRole("button", {name:"Load saved version"}).click();
  await expect(page.getByText("Updated in another session",{exact:true})).toBeVisible();
  await page.getByRole("button", {name:"Keep my draft and use this version"}).click();
  await expect(page.getByRole("textbox",{name:"Title",exact:true})).toHaveValue("Keep my draft");
  await page.getByRole("button", {name:"Save task"}).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", {name:"Keep my draft",exact:true}).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Task history" }),
  ).toContainText("v4");
});
test("assigned read-only cards have no move control and project task board exposes separate agent work", async ({
  page,
}) => {
  const fixture = await setupReviewApi(page, true);
  await page.route("**/api/v1/tasks**", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "read-only",
            source: "project",
            canEdit: false,
            projectId: "project-one",
            projectName: "Example project",
            title: "Customer review",
            description: "",
            status: "ready",
            priority: "normal",
            blocked: false,
            checklist: [],
            tags: [],
            version: 1,
            archived: false,
            createdAt: "2026-11-06",
            updatedAt: "2026-11-06",
          },
        ],
        nextCursor: null,
      },
    }),
  );
  await page.goto("/tasks");
  await expect(
    page.getByRole("button", { name: "Customer review" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Move Customer review" }),
  ).toHaveCount(0);
  await page.goto("/projects/project-one/tasks");
  await expect(
    page.getByRole("heading", { level: 1, name: "Tasks" }),
  ).toBeVisible();
  await page.getByText("Agent work", { exact: true }).click();
  await expect(page.getByText(/Only a human accepts a result/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
