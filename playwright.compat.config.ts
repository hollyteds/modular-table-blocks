import { defineConfig } from '@playwright/test';
import config from './playwright.config';

export default defineConfig({
	...config,
	testMatch: ['**/m2.spec.ts', '**/m3.spec.ts', '**/native-styles.spec.ts'],
	outputDir: './test-results/compat',
	projects: [
		{ name: 'firefox-wp66', use: { browserName: 'firefox' } },
		{ name: 'webkit-wp66', use: { browserName: 'webkit' } },
		{ name: 'firefox-latest', use: { browserName: 'firefox', baseURL: 'http://localhost:8892' } },
		{ name: 'webkit-latest', use: { browserName: 'webkit', baseURL: 'http://localhost:8892' } },
	],
});
