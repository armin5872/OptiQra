import { test, expect } from "@playwright/test";

test.describe("Settings panel — language switching", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
	});

	test("opens from the header trigger and shows the Appearance tab by default", async ({
		page,
	}) => {
		await page.getByRole("button", { name: "Settings" }).click();
		await expect(page.getByRole("dialog")).toBeVisible();
		await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
		await expect(page.getByLabel("Language")).toBeVisible();
	});

	test("switching language updates the hero copy and nav labels", async ({ page }) => {
		await page.getByRole("button", { name: "Settings" }).click();
		await page.getByLabel("Language").selectOption("es");

		// Settings chrome should re-render in Spanish immediately.
		await expect(page.getByRole("heading", { name: "Apariencia" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Diseño" })).toBeVisible();

		await page.getByRole("button", { name: "Cerrar ajustes" }).click();

		// The hero screen behind the modal should also have re-rendered.
		await expect(page.getByRole("heading", { level: 1 })).toContainText(
			"Descubre qué falla realmente",
		);
		await expect(page.getByRole("button", { name: "Ejecutar diagnóstico →" })).toBeVisible();
	});

	test("sets document direction to rtl for Arabic and Persian", async ({ page }) => {
		await page.getByRole("button", { name: "Settings" }).click();
		await page.getByLabel("Language").selectOption("ar");
		await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
		await expect(page.locator("html")).toHaveAttribute("lang", "ar");

		await page.getByLabel(/اللغة/).selectOption("en");
		await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
	});

	test("language choice persists across a reload", async ({ page }) => {
		await page.getByRole("button", { name: "Settings" }).click();
		await page.getByLabel("Language").selectOption("fr");
		await page.getByRole("button", { name: "Fermer les paramètres" }).click();
		await page.reload();
		await expect(page.getByRole("heading", { level: 1 })).toContainText(
			"Découvrez ce qui cloche",
		);
	});
});
