import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openEditor } from './login';
import { resetBulkPanel } from './bulk-controls';

const source = (page: Page) =>
	page.evaluate(
		() => window.wp.data.select('core/block-editor').getBlocks()[0]
	);
const badges = (page: Page) =>
	page.locator('.modular-table-blocks-bulk-preview-type');
async function open(page: Page) {
	await page.evaluate(() =>
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(
				window.wp.data.select('core/block-editor').getBlocks()[0]
					.clientId
			)
	);
	await page
		.getByRole('button', { name: 'Bulk edit cells', exact: true })
		.click();
}
async function typePanel(page: Page) {
	return page
		.getByRole('dialog')
		.getByRole('radiogroup', { name: 'Cell type', exact: true });
}
test.beforeEach(async ({ page, context }) => {
	await openEditor(page, context);
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const table = window.mtbCreateTable(
			{
				headerRows: 1,
				columns: [{}, {}, {}],
				stripeMode: 'rows',
				styleTokens: {
					headerBackgroundColor: '#123456',
					stripeBackgroundColor: '#abcdef',
				},
			},
			Array.from({ length: 3 }, (_, r) =>
				Array.from({ length: 3 }, (_column, c) =>
					createBlock(
						'modular-table-blocks/cell',
						{
							tag: r === 0 || (r === 1 && c === 0) ? 'th' : 'td',
							scope: r === 0 ? 'col' : 'row',
							...(r === 2 && c === 2
								? {
										style: {
											typography: { fontWeight: '500' },
										},
									}
								: {}),
						},
						[
							createBlock('modular-table-blocks/cell-text', {
								content: `${r}:${c}`,
							}),
						]
					)
				)
			)
		);
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.clientId);
	});
});

test('type drafts follow multiple scopes and cancel keeps source while badges are anchored without changing table geometry', async ({
	page,
}) => {
	const before = await source(page);
	await open(page);
	const modal = page.getByRole('dialog');
	await modal.getByRole('button', { name: 'Row 1', exact: true }).click();
	const group = await typePanel(page);
	await expect(
		group.getByRole('radio', { name: 'Header cell (TH)', exact: true })
	).toBeDisabled();
	await expect(badges(page)).toHaveText([
		'TH',
		'TH',
		'TH',
		'TH',
		'TD',
		'TD',
		'TD',
		'TD',
		'TD',
	]);
	const label = badges(page).nth(3);
	await expect(label).toHaveCSS('position', 'absolute');
	const bounds = await label.evaluate((node) => {
		const badge = node.getBoundingClientRect();
		const cell = node.parentElement!.getBoundingClientRect();
		return {
			top: badge.top - cell.top,
			left: badge.left - cell.left,
			font: parseFloat(getComputedStyle(node).fontSize),
		};
	});
	expect(bounds.top).toBeLessThan(5);
	expect(bounds.left).toBeLessThan(5);
	expect(bounds.font).toBe(10);
	await expect(
		group.getByRole('radio', { name: 'Data cell (TD)', exact: true })
	).toBeDisabled();
	await expect(modal).toContainText(
		'Header-row cells are managed by the table'
	);
	await modal.getByRole('button', { name: 'Row 2', exact: true }).click();
	await expect(
		group.getByRole('radio', { name: 'Header cell (TH)', exact: true })
	).not.toBeChecked();
	await expect(
		group.getByRole('radio', { name: 'Data cell (TD)', exact: true })
	).not.toBeChecked();
	await group
		.getByRole('radio', { name: 'Header cell (TH)', exact: true })
		.click();
	await expect(badges(page)).toHaveText([
		'TH',
		'TH',
		'TH',
		'TH',
		'TH',
		'TH',
		'TD',
		'TD',
		'TD',
	]);
	await modal.getByRole('button', { name: 'Column 2', exact: true }).click();
	await group
		.getByRole('radio', { name: 'Header cell (TH)', exact: true })
		.click();
	await expect(badges(page)).toHaveText([
		'TH',
		'TH',
		'TH',
		'TH',
		'TH',
		'TH',
		'TD',
		'TH',
		'TD',
	]);
	await page.screenshot({
		path: test.info().outputPath('bulk-cell-type-draft.png'),
		animations: 'disabled',
	});
	expect(await source(page)).toEqual(before);
	await modal
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	expect(await source(page)).toEqual(before);
});

test('TD conversion restores stripe backgrounds and normal weight, applies cell attributes once and supports repeated apply undo redo and save', async ({
	page,
}) => {
	const before = await source(page);
	await open(page);
	const modal = page.getByRole('dialog');
	await modal.getByRole('button', { name: 'All cells', exact: true }).click();
	const group = await typePanel(page);
	await group
		.getByRole('radio', { name: 'Data cell (TD)', exact: true })
		.click();
	await expect(badges(page)).toHaveText([
		'TH',
		'TH',
		'TH',
		'TD',
		'TD',
		'TD',
		'TD',
		'TD',
		'TD',
	]);
	const converted = modal
		.locator('.modular-table-blocks-bulk-preview-cell')
		.nth(3);
	await expect(converted).toHaveCSS(
		'font-weight',
		await modal
			.locator('.modular-table-blocks-bulk-preview-table')
			.evaluate((node) => getComputedStyle(node).fontWeight)
	);
	await expect(converted).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
	await modal
		.getByRole('button', { name: 'Apply to 1 cells', exact: true })
		.click();
	await expect(modal).toBeVisible();
	const first = await source(page);
	expect(first.attributes).toEqual(before.attributes);
	expect(first.innerBlocks[3].attributes).toMatchObject({
		tag: 'td',
		scope: '',
	});
	await group
		.getByRole('radio', { name: 'Header cell (TH)', exact: true })
		.click();
	await expect(badges(page)).toHaveText(Array(9).fill('TH'));
	await expect(converted).toHaveCSS('font-weight', '700');
	await expect(
		modal.locator('.modular-table-blocks-bulk-preview-cell').last()
	).toHaveCSS('font-weight', '500');
	await expect(converted).toHaveCSS('background-color', 'rgb(18, 52, 86)');
	await modal
		.getByRole('button', { name: 'Apply to 6 cells', exact: true })
		.click();
	const second = await source(page);
	await page.screenshot({
		path: test.info().outputPath('bulk-cell-types.png'),
		animations: 'disabled',
	});
	await modal
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await expect.poll(() => source(page)).toEqual(first);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').redo());
	await expect.poll(() => source(page)).toEqual(second);
	await page.evaluate(() =>
		window.wp.data
			.dispatch('core/editor')
			.editPost({ title: 'Bulk cell types', status: 'publish' })
	);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.reload();
	await expect(
		page
			.frameLocator('iframe[name="editor-canvas"]')
			.locator('.modular-table-blocks-editor__cell--header')
	).toHaveCount(9);
	await page.goto(`/?p=${id}`);
	const table = page.locator('table.wp-block-modular-table-blocks-table');
	await expect(table.locator('thead th[scope="col"]')).toHaveCount(3);
	await expect(table.locator('tbody th')).toHaveCount(6);
	await expect(
		table.locator('.modular-table-blocks-bulk-preview-type')
	).toHaveCount(0);
});

test('partial selection changes merged cell type once and the menu reset restores its original badge', async ({
	page,
}) => {
	await page.evaluate(() => {
		const t = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.replaceInnerBlocks(
				t.clientId,
				window.mtbMergeCells(t, 1, 0, 2, 2),
				false
			);
	});
	await open(page);
	const modal = page.getByRole('dialog');
	await modal.getByRole('button', { name: 'Column 2', exact: true }).click();
	const group = await typePanel(page);
	await group
		.getByRole('radio', { name: 'Data cell (TD)', exact: true })
		.click();
	await expect(
		modal.locator(
			'[colspan="2"][rowspan="2"] .modular-table-blocks-bulk-preview-type'
		)
	).toHaveText('TD');
	await resetBulkPanel(page, 'Cell type');
	await expect(
		modal.locator(
			'[colspan="2"][rowspan="2"] .modular-table-blocks-bulk-preview-type'
		)
	).toHaveText('TH');
	await group
		.getByRole('radio', { name: 'Data cell (TD)', exact: true })
		.click();
	await modal
		.getByRole('button', { name: 'Apply to 1 cells', exact: true })
		.click();
	expect(
		(await source(page)).innerBlocks.find(
			(c) => c.attributes.row === 1 && c.attributes.column === 0
		)!.attributes
	).toMatchObject({ tag: 'td', scope: '', colSpan: 2, rowSpan: 2 });
});
