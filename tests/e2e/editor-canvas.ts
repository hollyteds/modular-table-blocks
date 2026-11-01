import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * WordPress can use the main document when another registered block needs API v2.
 * @param page
 */
export async function editorCanvas(page: Page) {
	let embedded = false;
	await expect
		.poll(async () => {
			embedded =
				(await page.locator('iframe[name="editor-canvas"]').count()) >
				0;
			const root = embedded
				? page.frameLocator('iframe[name="editor-canvas"]')
				: page.locator('body');
			return root.locator('.modular-table-blocks-editor__cell').count();
		})
		.toBeGreaterThan(0);
	return embedded
		? page.frameLocator('iframe[name="editor-canvas"]')
		: page.locator('body');
}
