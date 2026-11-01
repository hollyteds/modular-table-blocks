import { test, expect } from '@playwright/test';

test('self-hosted update appears in the native plugin list and details modal', async ({
	page,
	context,
}) => {
	await context.request.get('/wp-login.php');
	const login = await context.request.post('/wp-login.php', {
		form: {
			log: process.env.WP_USERNAME || 'admin',
			pwd: process.env.WP_PASSWORD || 'password',
			testcookie: '1',
			redirect_to: '/wp-admin/',
		},
	});
	expect(new URL(login.url()).pathname).toMatch(/^\/wp-admin\//);
	await page.route('**/plugin-install.php?**', async (route) => {
		const url = new URL(route.request().url());
		url.searchParams.set('mtb_test_update_preview', '1');
		await route.continue({ url: url.toString() });
	});
	await page.goto('/wp-admin/plugins.php?mtb_test_update_preview=1');
	const update = page.locator(
		'tr.plugin-update-tr[data-plugin="modular-table-blocks/modular-table-blocks.php"]'
	);
	await expect(update).toBeVisible();
	await expect(update).toContainText('99.0.0');
	await expect(update.locator('.update-link')).toBeVisible();
	const detailsLink = update.locator('.thickbox');
	await detailsLink.focus();
	await page.keyboard.press('Enter');
	const details = page.frameLocator('#TB_iframeContent');
	await expect(
		details.getByRole('heading', { name: 'Modular Table Blocks' })
	).toBeVisible();
	await expect(details.locator('body')).toContainText(
		'Update preview description.'
	);
	await expect(details.locator('body')).toContainText('ht-CODE');
	await expect(details.locator('body')).not.toContainText('Warning:');
	await details.getByRole('link', { name: /Changelog|変更履歴/ }).click();
	await expect(details.locator('body')).toContainText(
		'Preview release notes.'
	);
	await page.getByRole('button', { name: /Close|閉じる/ }).click();
	await expect(page.locator('#TB_window')).toHaveCount(0);
	await page.goto('/wp-admin/plugins.php');
	await expect(page.locator('body')).not.toContainText('99.0.0');
});
