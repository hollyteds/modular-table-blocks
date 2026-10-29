import { defineConfig } from '@playwright/test';
import config from './playwright.config';

export default defineConfig({
	...config,
	outputDir: './test-results/latest',
	use: { ...config.use, baseURL: 'http://localhost:8892' },
});
