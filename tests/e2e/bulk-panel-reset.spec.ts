import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openEditor } from './login';
import {
	applyBulkSettings,
	resetBulkPanel,
	showBulkTypography,
} from './bulk-controls';

const source = (page: Page) =>
	page.evaluate(
		() => window.wp.data.select('core/block-editor').getBlocks()[0]
	);
const modal = (page: Page) =>
	page.getByRole('dialog', { name: 'Bulk edit cells', exact: true });
async function open(page: Page) {
	await page
		.getByRole('button', { name: 'Bulk edit cells', exact: true })
		.click();
	await expect(modal(page)).toBeVisible();
}
async function panel(page: Page, title: string) {
	const card = modal(page).getByRole('region', { name: title, exact: true });
	await expect(card).toBeVisible();
	if (title === 'Typography') {
		await showBulkTypography(page);
	}
	return card;
}

test.beforeEach(async ({ page, context }) => {
	await openEditor(page, context);
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const table = window.mtbCreateTable(
			{
				columns: [
					{ label: 'First', width: '20%' },
					{ label: 'Second', width: '30%' },
					{ label: 'Third', width: '50%' },
				],
				columnWidthMode: 'custom',
				verticalAlign: 'middle',
				style: {
					typography: {
						fontSize: '18px',
						lineHeight: '1.5',
						textAlign: 'right',
					},
				},
				styleTokens: {
					borderWidth: '2px',
					borderStyle: 'dashed',
					borderColor: '#789abc',
					cellPaddingBlock: '12px',
					cellPaddingInline: '16px',
					cellBackgroundColor: '#ffeedd',
				},
			},
			Array.from({ length: 2 }, (_unusedRow, row) =>
				Array.from({ length: 3 }, (_unusedColumn, column) =>
					createBlock(
						'modular-table-blocks/cell',
						{
							tag: row === 0 && column === 0 ? 'th' : 'td',
							verticalAlign: 'bottom',
							style: {
								typography: {
									fontSize: column % 2 ? '24px' : '20px',
									lineHeight: column % 2 ? '3' : '2',
									textAlign: 'left',
									fontWeight: '500',
								},
								color: { text: '#123456' },
							},
							styleTokens: {
								borderWidth: '3px',
								borderStyle: 'solid',
								borderColor: '#123456',
								cellPaddingTop: '4px',
								cellPaddingRight: '5px',
								cellPaddingBottom: '6px',
								cellPaddingLeft: '7px',
								cellBackgroundColor:
									column % 2 ? '#abcdef' : '#fedcba',
							},
						},
						[
							createBlock('core/paragraph', {
								content: `Cell ${row + 1}:${column + 1}`,
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

test('bulk settings form one column beside the preview and keep drafts through scrolling resizing and selection changes', async ({
	page,
}) => {
	const before = await source(page);
	await page.setViewportSize({ width: 1280, height: 1000 });
	await open(page);
	const dialog = modal(page);
	const layout = dialog.locator('.modular-table-blocks-bulk-layout');
	const selection = dialog.locator('.modular-table-blocks-bulk-selection');
	const grid = dialog.locator('.modular-table-blocks-bulk-settings');
	const cards = grid.locator(':scope > section');
	await expect(
		dialog.getByText('Closing discards only unapplied changes.', {
			exact: true,
		})
	).toHaveCount(0);
	for (const name of [
		'Select all',
		'Clear selection',
		'Reset',
		'Leave unchanged',
	]) {
		await expect(
			dialog.getByRole('button', { name, exact: true })
		).toHaveCount(0);
	}
	const column = dialog.locator('.modular-table-blocks-bulk-settings-column');
	const footer = column.locator('.modular-table-blocks-bulk__actions');
	await expect(
		footer.getByRole('button', { name: 'Close', exact: true })
	).toHaveCount(1);
	await expect(
		footer.getByRole('button', { name: 'Apply to 0 cells', exact: true })
	).toBeDisabled();
	await expect(cards).toHaveCount(6);
	await expect(dialog.getByRole('tabpanel')).toHaveCount(0);
	await expect(dialog.locator('.components-panel__body')).toHaveCount(0);
	for (const title of [
		'Cell type',
		'Alignment',
		'Cell background',
		'Border',
		'Padding',
		'Typography',
	]) {
		await expect(
			dialog.getByRole('heading', { name: title, exact: true })
		).toBeVisible();
		await expect(
			dialog.getByRole('region', { name: title, exact: true })
		).toBeVisible();
	}
	await expect(
		dialog
			.getByRole('region', { name: 'Typography', exact: true })
			.getByRole('button', { name: 'Set custom size', exact: true })
	).toBeDisabled();
	await dialog.getByRole('button', { name: 'Column 1', exact: true }).click();
	await expect(cards).toHaveCount(6);
	await showBulkTypography(page, []);
	await showBulkTypography(page, []);
	const size = dialog.getByRole('spinbutton', {
		name: /^(Font size|Custom)$/,
	});
	await size.fill('32');
	await size.press('Tab');
	for (const [viewport, horizontal] of [
		[1280, true],
		[900, true],
		[390, false],
		[1280, true],
	] as const) {
		await page.setViewportSize({ width: viewport, height: 1000 });
		await expect
			.poll(() =>
				cards.evaluateAll((nodes) =>
					nodes.every((node, index) => {
						const rect = node.getBoundingClientRect();
						const first = nodes[0].getBoundingClientRect();
						return (
							Math.abs(rect.x - first.x) < 2 &&
							Math.abs(rect.width - first.width) < 2 &&
							(index === 0 ||
								rect.top >=
									nodes[index - 1].getBoundingClientRect()
										.bottom +
										15)
						);
					})
				)
			)
			.toBe(true);
		await expect
			.poll(async () => {
				const left = (await selection.boundingBox())!;
				const settings = (await column.boundingBox())!;
				return horizontal
					? settings.x >= left.x + left.width + 23
					: settings.y >= left.y + left.height + 23;
			})
			.toBe(true);
		if (horizontal) {
			await expect(column).toHaveCSS('width', '240px');
			await size.scrollIntoViewIfNeeded();
			await expect(
				dialog.getByRole('region', {
					name: 'Cell selection',
					exact: true,
				})
			).toBeInViewport();
		}
		await expect
			.poll(() =>
				layout.evaluate(
					(node) => node.scrollWidth <= node.clientWidth + 1
				)
			)
			.toBe(true);
		await expect(size).toHaveValue('32');
		await expect
			.poll(() =>
				cards.evaluateAll((nodes) =>
					nodes.every(
						(node) => node.scrollWidth <= node.clientWidth + 1
					)
				)
			)
			.toBe(true);
		await dialog.screenshot({
			path: test.info().outputPath(`bulk-layout-${viewport}.png`),
			animations: 'disabled',
		});
	}
	await dialog.getByRole('button', { name: 'Row 1', exact: true }).click();
	await expect(cards).toHaveCount(6);
	await dialog.getByRole('button', { name: 'Column 1', exact: true }).click();
	await expect(size).toHaveValue('32');
	expect(await source(page)).toEqual(before);
	await dialog
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	expect(await source(page)).toEqual(before);
});

test('cell selection fills the modal height and keeps its status below independently scrolling panes', async ({
	page,
}) => {
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const table = window.mtbCreateTable(
			{ columns: [{}, {}, {}] },
			Array.from({ length: 30 }, (_unused, row) =>
				Array.from({ length: 3 }, (_column, column) =>
					createBlock('modular-table-blocks/cell', {
						rowSpan: row === 0 && column === 0 ? 2 : 1,
					})
				).filter((_cell, column) => row !== 1 || column !== 0)
			)
		);
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.clientId);
	});
	const before = await source(page);
	await page.setViewportSize({ width: 1280, height: 1000 });
	await open(page);
	const dialog = modal(page);
	const layout = dialog.locator('.modular-table-blocks-bulk-layout');
	const selection = dialog.locator('.modular-table-blocks-bulk-selection');
	const preview = dialog.getByRole('region', {
		name: 'Cell selection',
		exact: true,
	});
	const status = selection.getByRole('status');
	const column = dialog.locator('.modular-table-blocks-bulk-settings-column');
	const notifications = dialog.getByRole('region', {
		name: 'Notifications',
		exact: true,
	});
	await dialog.getByRole('button', { name: 'Row 1', exact: true }).click();
	await expect(status).toContainText('3 cells selected');
	await expect(notifications).toBeVisible();
	await showBulkTypography(page, []);
	const size = dialog.getByRole('spinbutton', {
		name: /^(Font size|Custom)$/,
	});
	await size.fill('32');
	await size.press('Tab');
	for (const [width, height] of [
		[1280, 1000],
		[1280, 720],
		[1280, 520],
		[390, 812],
		[1280, 1000],
	]) {
		await page.setViewportSize({ width, height });

		await expect
			.poll(async () => {
				const contentBottom = await dialog
					.locator('.components-modal__content')
					.evaluate(
						(node) =>
							node.getBoundingClientRect().bottom -
							parseFloat(getComputedStyle(node).paddingBottom)
					);
				const [workspace, left, right, count, table] =
					await Promise.all([
						layout.boundingBox(),
						selection.boundingBox(),
						column.boundingBox(),
						status.boundingBox(),
						preview.boundingBox(),
					]);
				if (!workspace || !left || !right || !count || !table) {
					return false;
				}
				return (
					Math.abs(workspace.y + workspace.height - contentBottom) <
						2 &&
					Math.abs(count.y + count.height - left.y - left.height) <
						2 &&
					count.y >= table.y + table.height &&
					table.height > 30 &&
					Math.abs(left.y - workspace.y) < 2 &&
					Math.abs(
						(width > 782
							? left.y + left.height
							: right.y + right.height) -
							workspace.y -
							workspace.height
					) < 2
				);
			})
			.toBe(true);
		await expect(status).toBeInViewport({ ratio: 1 });
		const countBefore = (await status.boundingBox())!;
		await preview.focus();
		await preview.press('End');
		await expect
			.poll(() =>
				preview.evaluate((node) =>
					Math.abs(
						node.scrollHeight - node.clientHeight - node.scrollTop
					)
				)
			)
			.toBeLessThan(2);
		const scrollTop = await preview.evaluate((node) => node.scrollTop);
		await size.scrollIntoViewIfNeeded();
		await expect(size).toHaveValue('32');
		await dialog
			.getByRole('button', { name: 'Close', exact: true })
			.last()
			.scrollIntoViewIfNeeded();
		await expect
			.poll(() => column.evaluate((node) => node.scrollTop))
			.toBeGreaterThan(0);
		expect(await preview.evaluate((node) => node.scrollTop)).toBeCloseTo(
			scrollTop,
			0
		);
		const countAfter = (await status.boundingBox())!;
		expect(countAfter.y).toBeCloseTo(countBefore.y, 0);
		await expect(status).toBeInViewport({ ratio: 1 });
		await expect
			.poll(async () => {
				const notices = (await notifications.boundingBox())!;
				const left = (await selection.boundingBox())!;
				return notices.height <= left.height * 0.35 + 1;
			})
			.toBe(true);
		if (
			await notifications.evaluate(
				(node) => node.scrollHeight > node.clientHeight
			)
		) {
			await notifications.focus();
			await notifications.press('End');
			await expect(notifications).toHaveCSS('outline-style', 'solid');
			await expect
				.poll(() =>
					notifications.evaluate((node) =>
						Math.abs(
							node.scrollHeight -
								node.clientHeight -
								node.scrollTop
						)
					)
				)
				.toBeLessThan(2);
		}
		await expect
			.poll(() =>
				layout.evaluate(
					(node) =>
						node.scrollWidth <= node.clientWidth + 1 &&
						node.scrollHeight <= node.clientHeight + 1
				)
			)
			.toBe(true);
		await dialog.screenshot({
			path: test.info().outputPath(`bulk-height-${width}-${height}.png`),
			animations: 'disabled',
		});
	}
	expect(await source(page)).toEqual(before);
	await dialog
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	expect(await source(page)).toEqual(before);
});

test('panel resets stage every field in that panel, preserve other scopes, cancel and apply atomically', async ({
	page,
}) => {
	const before = await source(page);
	await open(page);
	await modal(page)
		.getByRole('button', { name: 'Row 1', exact: true })
		.click();
	const typography = await panel(page, 'Typography');
	await expect(
		typography.getByRole('spinbutton', { name: /^(Font size|Custom)$/ })
	).toHaveValue('');
	await typography.screenshot({
		path: test.info().outputPath('mixed-typography-reset.png'),
	});
	await expect(modal(page).locator('details')).toHaveCount(0);
	await expect(
		modal(page).getByRole('button', {
			name: 'Reset to inherit',
			exact: true,
		})
	).toHaveCount(0);
	await resetBulkPanel(page, 'Padding');
	await modal(page)
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	expect(await source(page)).toEqual(before);
	await open(page);
	await modal(page)
		.getByRole('button', { name: 'Row 1', exact: true })
		.click();
	for (const title of [
		'Border',
		'Padding',
		'Typography',
		'Alignment',
		'Cell background',
	]) {
		const body = await panel(page, title);
		await expect(
			body.getByRole('button', { name: 'Reset', exact: true })
		).toHaveCount(0);
		await resetBulkPanel(page, title);
	}
	expect(await source(page)).toEqual(before);
	await applyBulkSettings(page, 3);
	await expect(modal(page)).toBeVisible();
	const after = await source(page);
	expect(after.attributes).toEqual(before.attributes);
	for (let i = 0; i < 3; i++) {
		const cell = after.innerBlocks[i];
		expect(Object.keys(cell.attributes.styleTokens ?? {})).toEqual([]);
		expect(cell.attributes.style).toEqual({
			typography: {},
			color: {},
		});
		expect(cell.attributes.verticalAlign).toBeUndefined();
		expect(cell.attributes.tag).toBe(before.innerBlocks[i].attributes.tag);
		expect(cell.innerBlocks).toEqual(before.innerBlocks[i].innerBlocks);
	}
	expect(after.innerBlocks.slice(3)).toEqual(before.innerBlocks.slice(3));
	await modal(page)
		.getByRole('button', { name: 'All cells', exact: true })
		.click();
	await resetBulkPanel(page, 'Typography');
	await applyBulkSettings(page, 6);
	const all = await source(page);
	expect(all.attributes.style).toEqual({
		typography: { textAlign: 'right' },
	});
	expect(all.attributes.styleTokens).toEqual(before.attributes.styleTokens);
	for (const cell of all.innerBlocks) {
		expect(cell.attributes.style).not.toHaveProperty('typography.fontSize');
		expect(cell.attributes.style).not.toHaveProperty(
			'typography.lineHeight'
		);
	}
	await modal(page)
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect.poll(() => source(page)).toEqual(after);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect.poll(() => source(page)).toEqual(before);
});

test('native menu resets use the current selection repeatedly and opening menus leaves drafts and focus intact', async ({
	page,
}) => {
	const before = await source(page);
	await open(page);
	const dialog = modal(page);
	for (const title of [
		'Cell type',
		'Alignment',
		'Cell background',
		'Border',
		'Padding',
		'Typography',
	]) {
		await expect(
			dialog
				.getByRole('region', { name: title, exact: true })
				.getByRole('button', { name: `${title} options`, exact: true })
				.first()
		).toBeDisabled();
	}
	await dialog.getByRole('button', { name: 'Row 1', exact: true }).click();
	const opener = dialog
		.getByRole('region', { name: 'Typography', exact: true })
		.getByRole('button', { name: 'Typography options', exact: true });
	await opener.focus();
	await opener.press('Enter');
	const menu = page.getByRole('menu', {
		name: 'Typography options',
		exact: true,
	});
	await expect(
		menu.getByRole('menuitemcheckbox', {
			name: 'Hide and reset Text color',
			exact: true,
		})
	).toBeFocused();
	expect(await source(page)).toEqual(before);
	await page.keyboard.press('Escape');
	await expect(menu).toBeHidden();
	await expect(opener).toBeFocused();
	await expect(
		dialog.getByRole('button', { name: 'Apply to 0 cells', exact: true })
	).toBeDisabled();
	await opener.click();
	await menu
		.getByRole('menuitem', { name: 'Reset all', exact: true })
		.click();
	await page.keyboard.press('Escape');
	await expect(menu).toBeHidden();
	await dialog.getByRole('button', { name: 'Row 1', exact: true }).click();
	await dialog.getByRole('button', { name: 'Row 2', exact: true }).click();
	await resetBulkPanel(page, 'Padding');
	await resetBulkPanel(page, 'Padding');
	expect(await source(page)).toEqual(before);
	await applyBulkSettings(page, 6);
	const after = await source(page);
	for (const cell of after.innerBlocks) {
		const original = before.innerBlocks.find(
			(block) => block.clientId === cell.clientId
		)!;
		if (cell.attributes.row === 0) {
			expect(cell.attributes.style).not.toHaveProperty(
				'typography.fontSize'
			);
			expect(cell.attributes.style).not.toHaveProperty(
				'typography.lineHeight'
			);
			expect(cell.attributes.styleTokens).toEqual(
				original.attributes.styleTokens
			);
		} else {
			expect(cell.attributes.style).toEqual(original.attributes.style);
			for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
				expect(cell.attributes.styleTokens).not.toHaveProperty(
					`cellPadding${side}`
				);
			}
			expect(cell.attributes.styleTokens).toHaveProperty(
				'borderWidth',
				'3px'
			);
		}
		expect(cell.innerBlocks).toEqual(original.innerBlocks);
	}
	await dialog
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect.poll(() => source(page)).toEqual(before);
});

test('column selections expose no width control and preserve all column metadata when applying typography', async ({
	page,
}) => {
	const before = await source(page);
	await open(page);
	for (const column of [1, 3]) {
		await modal(page)
			.getByRole('button', { name: `Column ${column}`, exact: true })
			.click();
	}
	await expect(
		modal(page).getByRole('region', { name: 'Column width', exact: true })
	).toHaveCount(0);
	await panel(page, 'Typography');
	await modal(page)
		.getByRole('spinbutton', { name: /^(Font size|Custom)$/ })
		.fill('35');
	await applyBulkSettings(page, 4);
	const after = await source(page);
	expect(after.attributes.columns).toEqual(before.attributes.columns);
	expect(after.attributes.columnWidthMode).toBe(
		before.attributes.columnWidthMode
	);
	await modal(page)
		.getByRole('button', { name: 'Close', exact: true })
		.last()
		.click();
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect.poll(() => source(page)).toEqual(before);
});
