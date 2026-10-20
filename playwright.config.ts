import { defineConfig } from '@playwright/test';

export default defineConfig( {
	testDir: './tests/e2e',
	outputDir: './test-results/wp66',
	fullyParallel: false,
	workers: 1,
	timeout: 60000,
	use: {
		baseURL: process.env.WP_BASE_URL || 'http://localhost:8890',
		browserName: 'chromium',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
	},
} );
