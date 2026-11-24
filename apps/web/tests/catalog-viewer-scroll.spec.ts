import { expect, test } from "@playwright/test";
import { setupReviewApi } from "./fixtures/review-api.fixture";

for (const [device, viewport] of [
  ["desktop", { width: 1280, height: 800 }],
  ["mobile", { width: 390, height: 844 }],
] as const) {
  test.describe(device, () => {
    test.use({ viewport, isMobile: device === "mobile", hasTouch: device === "mobile" });

    for (const dismiss of ["Close", "Escape", "Back"] as const) {
      test(`screen viewer preserves the catalog position and opener on ${dismiss}`, async ({ page }) => {
        const { objects } = await setupReviewApi(page, true);
        const screen = objects.find((item: { kind: string }) => item.kind === "screen");
        for (let index = 0; index < 32; index++) {
          const key = `000-fixture-${index}`;
          objects.push({ ...screen, id: key, key, title: `Catalog screen ${index}` });
        }
        await page.goto("/projects/project-one/screens?mode=grid&variant=__all&palette=__all");
        const card = page.getByRole("main").getByRole("article").filter({
          has: page.getByText(screen.title, { exact: true }),
        });
        const opener = card.getByRole("button", { name: "Review", exact: true });
        await opener.evaluate(button => button.scrollIntoView({ block: "center" }));
        const scrollY = () => page.evaluate(() => window.scrollY);
        const initialY = await scrollY();
        expect(initialY).toBeGreaterThan(viewport.height);
        if (device === "mobile") await opener.tap();
        else if (dismiss === "Escape") {
          await opener.focus();
          await page.keyboard.press("Enter");
        } else await opener.click();
        const dialog = page.getByRole("dialog");
        const close = dialog.getByRole("button", { name: "Close", exact: true });
        await expect(close).toBeFocused();
        expect(await scrollY()).toBe(initialY);
        if (dismiss === "Close") await close.click();
        else if (dismiss === "Escape") await page.keyboard.press("Escape");
        else await page.goBack();
        await expect(dialog).toBeHidden();
        await expect.poll(scrollY).toBe(initialY);
        await expect(opener).toBeFocused();
        await expect(opener).toBeInViewport();
      });
    }
  });
}
