import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openEditor } from './login';
import { editorCanvas } from './editor-canvas';

const tree = (page: Page) =>
	page.evaluate(() => window.wp.data.select('core/block-editor').getBlocks());
const serialized = (page: Page) =>
	page.evaluate(() =>
		window.wp.blocks.serialize(
			window.wp.data.select('core/block-editor').getBlocks()
		)
	);

for (const scenario of [
	{ action: 'Insert row above', axis: 'row', index: 1, source: 1 },
	{ action: 'Insert row below', axis: 'row', index: 2, source: 1 },
	{ action: 'Insert column before', axis: 'column', index: 1, source: 1 },
	{ action: 'Insert column after', axis: 'column', index: 2, source: 1 },
	{ action: 'Add row at end', axis: 'row', index: 3, source: 2 },
	{ action: 'Add column at end', axis: 'column', index: 3, source: 2 },
] as const) {
	test(`insertion copies source styles: ${scenario.action}`, async ({
		page,
		context,
	}) => {
		await openEditor(page, context);
		await page.evaluate((append) => {
			const { createBlock } = window.wp.blocks;
			const rows = Array.from({ length: 3 }, (_, row) =>
				Array.from({ length: 3 }, (_cell, column) =>
					createBlock(
						'modular-table-blocks/cell',
						{
							tag: (row + column) % 2 === 0 ? 'th' : 'td',
							scope: 'row',
							styleTokens: {
								cellBackgroundColor: '#ffeecc',
								cellPaddingTop: `${row * 3 + column + 8}px`,
								borderBottomWidth: '2px',
							},
							style: {
								color: { text: '#123456' },
								typography: {
									fontSize: `${row * 3 + column + 16}px`,
									textAlign: 'right',
									fontWeight: '600',
								},
							},
							verticalAlign: 'middle',
						},
						[
							createBlock('modular-table-blocks/cell-text', {
								content: `Cell ${row}:${column}`,
							}),
						]
					)
				)
			);
			const table = window.mtbCreateTable(
				{
					columns: [
						{ width: '120px' },
						{ width: '180px' },
						{ width: '240px' },
					],
					columnWidthMode: 'custom',
				},
				rows
			);
			window.wp.data.dispatch('core/block-editor').resetBlocks([
				table,
				createBlock('core/paragraph', {
					content: 'Unrelated content',
				}),
			]);
			window.wp.data
				.dispatch('core/block-editor')
				.selectBlock(
					append ? table.clientId : table.innerBlocks[4].clientId
				);
		}, scenario.action.startsWith('Add '));
		if (scenario.action === 'Add column at end') {
			await page.setViewportSize({ width: 390, height: 844 });
		}
		const before = await tree(page);
		const beforeHtml = await serialized(page);
		const toggle = page
			.getByRole('toolbar', { name: 'Block tools', exact: true })
			.getByRole('button', { name: 'Table structure', exact: true });
		await toggle.focus();
		await toggle.press('Enter');
		const menu = page.getByRole('menu', {
			name: 'Table structure',
			exact: true,
		});
		const items = menu.getByRole('menuitem');
		await expect(items.first()).toBeFocused();
		const targetIndex = (await items.allTextContents()).findIndex(
			(label) => label.trim() === scenario.action
		);
		expect(targetIndex).toBeGreaterThanOrEqual(0);
		for (let i = 0; i < targetIndex; i++) {
			await page.keyboard.press('ArrowDown');
		}
		const item = page.getByRole('menuitem', {
			name: scenario.action,
			exact: true,
		});
		await expect(item).toBeFocused();
		await page.keyboard.press('Enter');
		const after = await tree(page);
		expect(after[0].attributes.rowCount).toBe(
			scenario.axis === 'row' ? 4 : 3
		);
		expect(after[0].attributes.columns).toHaveLength(
			scenario.axis === 'column' ? 4 : 3
		);
		const originalIds = new Set(
			before[0].innerBlocks.map((cell) => cell.clientId)
		);
		const added = after[0].innerBlocks.filter(
			(cell) => !originalIds.has(cell.clientId)
		);
		expect(added).toHaveLength(3);
		expect(after[1]).toEqual(before[1]);
		const canvas = await editorCanvas(page);
		for (const [i, cell] of added.entries()) {
			const origin =
				before[0].innerBlocks[
					scenario.axis === 'row'
						? scenario.source * 3 + i
						: i * 3 + scenario.source
				];
			expect(cell.attributes.styleTokens).toEqual(
				origin.attributes.styleTokens
			);
			expect(cell.attributes.style).toEqual(origin.attributes.style);
			expect(cell.attributes.verticalAlign).toBe('middle');
			expect(cell.attributes.tag).toBe(origin.attributes.tag);
			expect(cell.attributes.scope).toBe(
				origin.attributes.tag === 'th' ? 'row' : ''
			);
			expect(cell.innerBlocks).toHaveLength(1);
			expect(cell.innerBlocks[0].attributes.content).toBe('');
			const node = canvas.locator(`[data-block="${cell.clientId}"]`);
			if (origin.attributes.tag === 'th') {
				await expect(node).toHaveClass(
					/modular-table-blocks-editor__cell--header/
				);
			} else {
				await expect(node).not.toHaveClass(
					/modular-table-blocks-editor__cell--header/
				);
			}
			await expect(node).toHaveCSS(
				'background-color',
				'rgb(255, 238, 204)'
			);
			await expect(node).toHaveCSS('color', 'rgb(18, 52, 86)');
			await expect(node).toHaveCSS('text-align', 'right');
			await expect(node).toHaveCSS(
				'padding-top',
				`${Number(origin.attributes.row) * 3 + Number(origin.attributes.column) + 8}px`
			);
		}
		if (scenario.axis === 'column') {
			expect(
				(after[0].attributes.columns as { width: string }[])[
					scenario.index
				].width
			).toBe(scenario.source === 1 ? '180px' : '240px');
		}
		if (!scenario.action.startsWith('Add ')) {
			expect(
				await page.evaluate(() =>
					window.wp.data
						.select('core/block-editor')
						.getSelectedBlockClientId()
				)
			).toBe(before[0].innerBlocks[4].clientId);
		}
		const afterHtml = await serialized(page);
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').undo()
		);
		await expect.poll(() => serialized(page)).toBe(beforeHtml);
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').redo()
		);
		await expect.poll(() => serialized(page)).toBe(afterHtml);
		await page.evaluate(async () => {
			window.wp.data
				.dispatch('core/editor')
				.editPost({ title: 'Inserted cell styles', status: 'publish' });
			await window.wp.data.dispatch('core/editor').savePost();
		});
		const postId = await page.evaluate(() =>
			window.wp.data.select('core/editor').getCurrentPostId()
		);
		await page.reload();
		await expect(
			(await editorCanvas(page)).locator(
				'.modular-table-blocks-editor__cell'
			)
		).toHaveCount(12);
		expect(await serialized(page)).toBe(afterHtml);
		await page.goto(`/?p=${postId}`);
		const front = page.locator('table.wp-block-modular-table-blocks-table');
		await expect(front.locator('th, td')).toHaveCount(12);
		for (const [i, cell] of added.entries()) {
			const node = front
				.locator('tr')
				.nth(Number(cell.attributes.row))
				.locator(':scope > th, :scope > td')
				.nth(Number(cell.attributes.column));
			const origin =
				before[0].innerBlocks[
					scenario.axis === 'row'
						? scenario.source * 3 + i
						: i * 3 + scenario.source
				];
			await expect(node).toHaveJSProperty(
				'tagName',
				String(origin.attributes.tag).toUpperCase()
			);
			if (origin.attributes.tag === 'th') {
				await expect(node).toHaveAttribute('scope', 'row');
			} else {
				await expect(node).not.toHaveAttribute('scope');
			}
			await expect(node).toHaveCSS(
				'background-color',
				'rgb(255, 238, 204)'
			);
			await expect(node).toHaveCSS(
				'padding-top',
				`${Number(origin.attributes.row) * 3 + Number(origin.attributes.column) + 8}px`
			);
			await expect(node).toBeEmpty();
		}
	});
}
