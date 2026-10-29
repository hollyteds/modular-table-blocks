import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

export async function clearBulkSelection(dialog: Locator) {
	const selected = dialog
		.getByRole('region', { name: 'Cell selection', exact: true })
		.getByRole('button', { pressed: true });
	while (await selected.count()) {
		await selected.first().click();
	}
}

export async function showBulkTypography(
	page: Page,
	fields: string[] = ['Line height']
) {
	const card = page
		.getByRole('dialog')
		.getByRole('region', { name: 'Typography', exact: true });
	await card
		.getByRole('button', { name: 'Typography options', exact: true })
		.click();
	const menu = page.getByRole('menu', {
		name: 'Typography options',
		exact: true,
	});
	await expect(menu).toBeVisible();
	for (const field of fields) {
		const item = menu.getByRole('menuitemcheckbox', {
			name: new RegExp(`(?:Show |Hide and reset )${field}$`),
		});
		if ((await item.getAttribute('aria-checked')) !== 'true') {
			await item.click();
		}
	}
	const firstItem = menu.getByRole('menuitemcheckbox').first();
	await firstItem.focus();
	await firstItem.press('Escape');
	await expect(menu).toBeHidden();
	const custom = card.getByRole('button', {
		name: 'Set custom size',
		exact: true,
	});
	if ((await custom.isVisible()) && (await custom.isEnabled())) {
		await custom.click();
	}
}

export async function resetBulkPanel(page: Page, title: string) {
	const dialog = page.getByRole('dialog', {
		name: 'Bulk edit cells',
		exact: true,
	});
	await dialog
		.getByRole('region', { name: title, exact: true })
		.getByRole('button', { name: `${title} options`, exact: true })
		.first()
		.click();
	const menu = page.getByRole('menu', {
		name: `${title} options`,
		exact: true,
	});
	await menu
		.getByRole('menuitem', { name: 'Reset all', exact: true })
		.click();
	if (await menu.isVisible()) {
		await page.keyboard.press('Escape');
	}
	await expect(menu).toBeHidden();
}

export async function applyBulkSettings(page: Page, count: number) {
	const dialog = page.getByRole('dialog', {
		name: 'Bulk edit cells',
		exact: true,
	});
	const apply = dialog.getByRole('button', {
		name: `Apply to ${count} cells`,
		exact: true,
	});
	await apply.scrollIntoViewIfNeeded();
	await apply.focus();
	await apply.click();
	await expect(
		dialog.getByText('Changes applied.', { exact: true })
	).toBeVisible();
	await expect(
		dialog.getByRole('button', { name: 'Apply to 0 cells', exact: true })
	).toBeDisabled();
}
