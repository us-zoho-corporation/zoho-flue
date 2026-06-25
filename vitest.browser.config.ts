import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';

// OPTIONAL browser test suite. Not part of the default `pnpm test` run — it
// renders React (.tsx) components in a real headless Chromium via Playwright.
// Run with `pnpm test:browser` (one-time: `pnpm exec playwright install chromium`).
export default defineConfig({
	plugins: [react()],
	test: {
		include: ['src/**/*.browser.test.{ts,tsx}'],
		browser: {
			enabled: true,
			provider: playwright(),
			headless: true,
			instances: [{ browser: 'chromium' }],
		},
	},
});
