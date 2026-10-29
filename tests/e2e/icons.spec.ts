import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { openEditor } from './login';

const toolbar = (page: Page) =>
	page.getByRole('toolbar', { name: 'Block tools', exact: true });
const errors: string[] = [];

async function expectIcon(container: Locator, name: string) {
	const svg = container.locator(`svg[data-mtb-icon="${name}"]`).first();
	await expect(svg).toBeVisible();
	await expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
	await expect(svg).toHaveAttribute('aria-hidden', 'true');
	await expect(svg).toHaveAttribute('focusable', 'false');
	await expect(svg).toHaveCSS('fill', 'none');
	const colors = await svg.evaluate((node) => ({
		color: getComputedStyle(node).color,
		stroke: getComputedStyle(node).stroke,
	}));
	expect(colors.stroke).toBe(colors.color);
	return svg;
}
async function select(page: Page, kind: 'table' | 'cell' | 'text') {
	await page.evaluate((type) => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		let block = table;
		if (type !== 'table') {
			block = table.innerBlocks[0];
		}
		if (type === 'text') {
			block = block.innerBlocks[0];
		}
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(block.clientId);
	}, kind);
}
async function menu(page: Page, label: string) {
	await toolbar(page)
		.getByRole('button', { name: label, exact: true })
		.click();
	return page.getByRole('menu', { name: label, exact: true });
}
test.beforeEach(async ({ page, context }) => {
	errors.length = 0;
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (
			message.type() === 'error' &&
			message.text() !==
				'Warning: You are importing createRoot from "react-dom" which is not supported. You should instead import it from "react-dom/client".'
		) {
			errors.push(message.text());
		}
	});
	await openEditor(page, context);
	await page.evaluate(() => {
		const table = window.mtbCreateTable(
			{ columns: [{}, {}] },
			Array.from({ length: 2 }, () =>
				Array.from({ length: 2 }, () =>
					window.wp.blocks.createBlock(
						'modular-table-blocks/cell',
						{},
						[
							window.wp.blocks.createBlock(
								'modular-table-blocks/cell-text',
								{ content: 'Text' }
							),
						]
					)
				)
			)
		);
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
	});
	await select(page, 'table');
});
test.afterEach(() => expect(errors).toEqual([]));

test('custom block icons render as stroke-only art in block tools and list view', async ({
	page,
}) => {
	for (const [kind, name] of [
		['table', 'block-table'],
		['cell', 'block-cell'],
		['text', 'block-cell-text'],
	] as const) {
		await select(page, kind);
		await expectIcon(toolbar(page), name);
	}
	await page
		.getByRole('button', { name: 'Document Overview', exact: true })
		.click();
	const list = page.getByRole('treegrid');
	await expectIcon(list, 'block-table');
	await expectIcon(list, 'block-cell');
	await expectIcon(list, 'block-cell-text');
	await list.screenshot({
		path: test.info().outputPath('block-icons-list.png'),
	});
	expect(
		await page.evaluate(() =>
			window.wp.data.select('core/editor').getEditedPostContent()
		)
	).not.toContain('data-mtb-icon');
});

test('table menus use distinct supplied row column movement and combined merge icons', async ({
	page,
}) => {
	await expectIcon(
		toolbar(page).getByRole('button', { name: 'Import data', exact: true }),
		'import-table'
	);
	await expectIcon(
		toolbar(page).getByRole('button', {
			name: 'Table structure',
			exact: true,
		}),
		'table-structure'
	);
	let popup = await menu(page, 'Table structure');
	await expectIcon(
		popup.getByRole('menuitem', { name: 'Add row at end', exact: true }),
		'insert-row-below'
	);
	await expectIcon(
		popup.getByRole('menuitem', { name: 'Add column at end', exact: true }),
		'insert-column-after'
	);
	await page.keyboard.press('Escape');
	await select(page, 'cell');
	await expectIcon(
		toolbar(page).getByRole('button', {
			name: 'Move rows and columns',
			exact: true,
		}),
		'move-rows-columns'
	);
	const merge = toolbar(page).getByRole('button', {
		name: 'Merge and split cells',
		exact: true,
	});
	await expectIcon(merge, 'merge-split-cells');
	popup = await menu(page, 'Table structure');
	for (const [label, icon] of [
		['Insert row above', 'insert-row-above'],
		['Insert row below', 'insert-row-below'],
		['Duplicate row', 'duplicate-row'],
		['Delete row', 'delete-row'],
		['Insert column before', 'insert-column-before'],
		['Insert column after', 'insert-column-after'],
		['Duplicate column', 'duplicate-column'],
		['Delete column', 'delete-column'],
	]) {
		await expectIcon(
			popup.getByRole('menuitem', { name: label, exact: true }),
			icon
		);
	}
	await popup.screenshot({
		path: test.info().outputPath('structure-icons.png'),
	});
	await page.keyboard.press('Escape');
	popup = await menu(page, 'Move rows and columns');
	for (const [label, icon] of [
		['Move row up', 'move-row-up'],
		['Move row down', 'move-row-down'],
		['Move column left', 'move-column-left'],
		['Move column right', 'move-column-right'],
	]) {
		await expectIcon(
			popup.getByRole('menuitem', { name: label, exact: true }),
			icon
		);
	}
	await page.keyboard.press('Escape');
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.replaceInnerBlocks(
				table.clientId,
				window.mtbMergeCells(table, 0, 0, 1, 2),
				false
			);
	});
	await expect(merge).toHaveAttribute('aria-pressed', 'true');
	await expectIcon(merge, 'merge-split-cells');
	await toolbar(page).screenshot({
		path: test.info().outputPath('custom-merge-pressed.png'),
	});
	await merge.click();
	await expect(merge).toHaveAttribute('aria-pressed', 'false');
	await expectIcon(merge, 'merge-split-cells');
});

test('axes icons follow linked state and inherit accent colors without changing values', async ({
	page,
}) => {
	await page.getByRole('tab', { name: 'Settings', exact: true }).click();
	await page
		.getByRole('radio', { name: 'Separate borders', exact: true })
		.click();
	const before = await page.evaluate(
		() =>
			window.wp.data.select('core/block-editor').getBlocks()[0].attributes
	);
	const linked = page.getByRole('button', {
		name: 'Unlink axes',
		exact: true,
	});
	await expectIcon(linked, 'axes-linked');
	await linked.click();
	const separate = page.getByRole('button', {
		name: 'Link axes',
		exact: true,
	});
	const svg = await expectIcon(separate, 'axes-unlinked');
	const color = await separate.evaluate(
		(node) => getComputedStyle(node).color
	);
	await expect(svg).toHaveCSS('stroke', color);
	await expect(svg).toHaveCSS('fill', 'none');
	await separate.click();
	await expectIcon(linked, 'axes-linked');
	expect(
		await page.evaluate(
			() =>
				window.wp.data.select('core/block-editor').getBlocks()[0]
					.attributes
		)
	).toEqual(before);
});
