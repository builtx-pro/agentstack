import { test, expect } from "@playwright/test";
import { setupReviewApi } from "./fixtures/review-api.fixture";

test("tab-mode screens open the interactive screen in a new tab and legacy screens retain an isolated preview", async ({
  page,
  context,
}) => {
  const { objects } = await setupReviewApi(page, true, "ru");
  await page.addInitScript(() =>
    localStorage.setItem("agentstack.locale", "ru"),
  );
  const [external, embedded] = objects.filter(
    (o: { kind: string }) => o.kind === "screen",
  );
  const url = "https://example.test/previews/sample";
  external.data = { ...external.data, previewUrl: url, previewMode: "tab" };
  embedded.data = { ...embedded.data, previewUrl: url };
  await context.route(url, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Synthetic preview</h1>",
    }),
  );
  await page.goto(
    "/projects/project-one/screens?mode=grid&variant=__all&palette=__all",
  );
  const open = async (title: string) => {
    const card = page
      .getByRole("article")
      .filter({ has: page.getByText(title, { exact: true }) });
    await expect(
      card.getByRole("link", { name: "Открыть интерактивный экран" }),
    ).toHaveCount(0);
    await card.getByRole("button", { name: "Обсудить", exact: true }).click();
  };
  await open(external.title);
  const dialog = page.getByRole("dialog");
  const action = dialog.getByRole("link", {
    name: "Открыть интерактивный экран",
  });
  await expect(action).toHaveAttribute("href", url);
  await expect(action).toHaveAttribute("target", "_blank");
  await expect(action).toHaveAttribute("rel", "noopener noreferrer");
  await expect(dialog.locator("iframe")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: /изолированн/i }),
  ).toHaveCount(0);
  const nextPage = context.waitForEvent("page");
  await action.focus();
  await page.keyboard.press("Enter");
  const tab = await nextPage;
  await expect(
    tab.getByRole("heading", { name: "Synthetic preview" }),
  ).toBeVisible();
  expect(
    await tab.evaluate(
      () => window.opener === null && document.referrer === "",
    ),
  ).toBe(true);
  await tab.close();
  await page.keyboard.press("Escape");
  await open(embedded.title);
  await dialog.getByRole("button", { name: /изолированн/i }).click();
  await expect(dialog.locator("iframe")).toHaveAttribute(
    "sandbox",
    "allow-scripts",
  );
  await expect(dialog.locator("iframe")).toHaveAttribute("src", url);
});
