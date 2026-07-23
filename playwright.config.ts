import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Playwright config for OptiQra's end-to-end tests.
 * https://playwright.dev/docs/test-configuration
 *
 * Tests live in tests/e2e and drive the app the way a real user would:
 * the hero screen, settings panel, and language switching. They don't
 * depend on any live network target — where a real scan would be needed,
 * see tests/e2e/README for how to point `url` at a fixture server instead.
 */
export default defineConfig({
	testDir: "./tests/e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [["html", { open: "never" }]],
	timeout: 30_000,

	use: {
		baseURL: BASE_URL,
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},

	projects: [
		{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
		{ name: "firefox", use: { ...devices["Desktop Firefox"] } },
		{ name: "webkit", use: { ...devices["Desktop Safari"] } },
	],

	// Boots the app itself, so `npm run test:e2e` works standalone. Reuses an
	// already-running dev server locally (fast iteration), always starts a
	// fresh one in CI.
	webServer: {
		command: "npm run dev",
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
