import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts', 'tests/**/*.ts'],
		exclude: ['tests/smoke/global-setup.ts'],
		globalSetup: ['tests/smoke/global-setup.ts'],
		tags: [{ name: 'smoke', timeout: 30000 }],
	},
});
