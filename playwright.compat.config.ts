import { defineConfig } from '@playwright/test';
import config from './playwright.config';

export default defineConfig({
	...config,
	testMatch: [
		'**/icons.spec.ts',
		'**/import.spec.ts',
		'**/bulk-typography.spec.ts',
		'**/table-settings.spec.ts',
		'**/caption.spec.ts',
		'**/bulk-panel-reset.spec.ts',
		'**/table-margin.spec.ts',
		'**/bulk-cell-type.spec.ts',
		'**/background-rules.spec.ts',
		'**/m2.spec.ts',
		'**/m3.spec.ts',
		'**/native-styles.spec.ts',
		'**/bulk.spec.ts',
		'**/editor-layout.spec.ts',
		'**/intrinsic-columns.spec.ts',
		'**/cell-text.spec.ts',
		'**/cell-content.spec.ts',
		'**/parent-table-styles.spec.ts',
		'**/border-spacing.spec.ts',
		'**/style-baseline.spec.ts',
		'**/column-operations.spec.ts',
		'**/figure.spec.ts',
		'**/column-width-mode.spec.ts',
	],
	outputDir: './test-results/compat',
	projects: [
		{ name: 'firefox-wp66', use: { browserName: 'firefox' } },
		{ name: 'webkit-wp66', use: { browserName: 'webkit' } },
		{
			name: 'firefox-latest',
			use: { browserName: 'firefox', baseURL: 'http://localhost:8892' },
		},
		{
			name: 'webkit-latest',
			use: { browserName: 'webkit', baseURL: 'http://localhost:8892' },
		},
	],
});
