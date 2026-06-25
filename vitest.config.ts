import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts', 'tests/**/*.ts'],
		// Browser-mode tests (*.browser.test.tsx) run only via `pnpm test:browser`
		// with vitest.browser.config.ts — never in the default node suite.
		exclude: ['tests/smoke/global-setup.ts', '**/*.browser.test.*'],
		globalSetup: ['tests/smoke/global-setup.ts'],
		tags: [{ name: 'smoke', timeout: 30000 }],
	},
});
