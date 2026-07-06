import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';

// One config, three selectable projects (Vitest 4 `projects`):
//   pnpm test         → unit    (node; the default dev loop)
//   pnpm test:browser → browser (Playwright + headless Chromium; run `pnpm exec playwright install chromium` once)
//   pnpm test:smoke   → smoke   (live Zoho/Anthropic credentials via tests/smoke/global-setup.ts)
export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: 'unit',
					include: ['src/**/*.test.ts'],
					exclude: ['**/*.browser.test.*'],
				},
			},
			{
				plugins: [react()],
				test: {
					name: 'browser',
					include: ['src/**/*.browser.test.{ts,tsx}'],
					browser: {
						enabled: true,
						provider: playwright(),
						headless: true,
						instances: [{ browser: 'chromium' }],
					},
				},
			},
			{
				test: {
					name: 'smoke',
					include: ['tests/smoke/**/*.ts'],
					exclude: ['tests/smoke/global-setup.ts'],
					globalSetup: ['tests/smoke/global-setup.ts'],
					testTimeout: 30_000,
				},
			},
		],
	},
});
