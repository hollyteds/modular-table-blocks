import { expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

export async function openEditor(
	page: Page,
	context: BrowserContext,
	username = process.env.WP_USERNAME || 'admin',
	password = process.env.WP_PASSWORD || 'password'
) {
	await context.clearCookies();
	await context.request.get('/wp-login.php');
	const response = await context.request.post('/wp-login.php', {
		form: {
			log: username,
			pwd: password,
			testcookie: '1',
			redirect_to: '/wp-admin/',
		},
	});
	expect(new URL(response.url()).pathname).toMatch(/^\/wp-admin\//);
	await page.goto('/wp-admin/post-new.php');
	await page.waitForFunction(
		() => !!window.wp?.blocks?.getBlockType('modular-table-blocks/table')
	);
	const close = page.getByRole('button', { name: 'Close', exact: true });
	if (await close.isVisible()) {
		await close.click();
	}
}

export async function openAuthorEditor(page: Page, context: BrowserContext) {
	const source = await page.evaluate(async () => {
		const existing = await window.wp.apiFetch<Array<{ id: number }>>({
			path: '/wp/v2/users?slug=mtb-reload-author&context=edit',
		});
		if (existing.length === 0) {
			await window.wp.apiFetch({
				path: '/wp/v2/users',
				method: 'POST',
				data: {
					username: 'mtb-reload-author',
					email: 'mtb-reload-author@example.test',
					password: 'password',
					roles: ['author'],
				},
			});
		}
		return window.wp.blocks.serialize(
			window.wp.data.select('core/block-editor').getBlocks()
		);
	});
	await openEditor(page, context, 'mtb-reload-author', 'password');
	const currentUser = await page.evaluate(() =>
		window.wp.apiFetch<{ roles: string[] }>({
			path: '/wp/v2/users/me?context=edit',
		})
	);
	expect(currentUser.roles).toContain('author');
	await page.evaluate(
		(serialized) =>
			window.wp.data
				.dispatch('core/block-editor')
				.resetBlocks(window.wp.blocks.parse(serialized)),
		source
	);
}
