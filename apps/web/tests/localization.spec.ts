import { test, expect } from "@playwright/test";
import { setupReviewApi } from "./fixtures/review-api.fixture";

test("saved language persists explicit choice on login", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("agentstack.locale"))
      localStorage.setItem("agentstack.locale", "ru");
  });
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ status: 401, json: { error: { code: "unauthorized" } } }),
  );
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Добро пожаловать в AgentStack" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await page
    .getByRole("textbox", { name: "Электронная почта", exact: true })
    .fill("person@example.test");
  await page.getByText("EN", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome to AgentStack" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveValue("person@example.test");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(
    await page.evaluate(() => localStorage.getItem("agentstack.locale")),
  ).toBe("en");
  await page.getByRole("link", { name: "Accept an invitation" }).click();
  await expect(
    page.getByRole("heading", { name: "Join your project" }),
  ).toBeVisible();
});

test("Russian navigation, statuses and editor labels preserve user text when switching", async ({
  page,
}) => {
  await setupReviewApi(page);
  await page.goto("/projects/project-one/plan");
  await page
    .getByRole("button", {
      name: "Expand A confident first visit",
      exact: true,
    })
    .click();
  await page.getByText("RU", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "План разработки", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Навигация по проекту" }).last(),
  ).toBeVisible();
  await expect(
    page.getByText("Recover account access", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await page.getByRole("menuitem", { name: "Документ", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Название", exact: true })
    .fill("Пользовательский текст / Keep exactly");
  await expect(dialog.getByLabel("Видимость", { exact: true })).toBeVisible();
  // Switch in another tab using the browser storage event, without remounting the form.
  await page.evaluate(() => {
    localStorage.setItem("agentstack.locale", "en");
    window.dispatchEvent(
      new StorageEvent("storage", { key: "agentstack.locale", newValue: "en" }),
    );
  });
  await expect(
    dialog.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Пользовательский текст / Keep exactly");
  await expect(
    dialog.getByRole("button", { name: "Close", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Delivery plan", exact: true }),
  ).toBeVisible();
});

for (const width of [390, 1440])
  test(`Russian layout and controls fit at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await setupReviewApi(page);
    await page.goto("/projects/project-one/screens");
    await page.getByText("RU", { exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Библиотека экранов" }),
    ).toBeVisible();
    await expect(page.getByRole("article").first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`ru-catalog-${width}.png`),
      fullPage: false,
      animations: "disabled",
    });
  });
