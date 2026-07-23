import { test, expect } from "@playwright/test";

test.describe("Hero screen", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
	});

	test("loads with the diagnostic intake form", async ({ page }) => {
		await expect(page.getByRole("heading", { level: 1 })).toContainText(
			"Find out what's actually wrong with your website.",
		);
		await expect(page.getByLabel("Website URL")).toBeVisible();
		await expect(page.getByRole("button", { name: /run diagnostic/i })).toBeVisible();
	});

	test("switching to whole-site mode reveals scan depth options", async ({ page }) => {
		await page.getByRole("radio", { name: "Whole site" }).click();
		await expect(page.getByRole("radiogroup", { name: "Scan depth" })).toBeVisible();
		await expect(page.getByRole("button", { name: /crawl site/i })).toBeVisible();
	});

	test("submitting without a URL is blocked by the required field", async ({ page }) => {
		const urlInput = page.getByLabel("Website URL");
		await expect(urlInput).toHaveAttribute("required", "");
	});
});
