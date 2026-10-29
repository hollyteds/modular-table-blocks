import { test, expect } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { openEditor } from './login';
async function expectContained(table: Locator, noScroll = true) {
	await expect
		.poll(() =>
			table.evaluate((node, checkScroll) => {
				const parent = node.parentElement!;
				const bounds = parent.getBoundingClientRect();
				const style = getComputedStyle(parent);
				const rect = node.getBoundingClientRect();
				return Math.max(
					rect.right -
						(bounds.right - parseFloat(style.paddingRight)),
					bounds.left + parseFloat(style.paddingLeft) - rect.left,
					checkScroll ? node.scrollWidth - node.clientWidth : 0
				);
			}, noScroll)
		)
		.toBeLessThanOrEqual(1);
}
test.beforeEach(async ({ page, context }) => {
	await openEditor(page, context);
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const table = window.mtbCreateTable(
			{
				columns: [{}, {}, {}, {}],
				responsiveMode: 'none',
			},
			[
				Array.from({ length: 4 }, () =>
					createBlock('modular-table-blocks/cell', {}, [
						createBlock('core/paragraph', {
							content: 'LongUnbrokenContent'.repeat(2),
						}),
					])
				),
			]
		);
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
	});
});
test.afterEach(async ({ page }) => {
	// WordPress persists the sidebar closing itself at mobile widths.
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.evaluate(() => {
		const block = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(block.clientId);
	});
	const inspector = page.locator('.block-editor-block-inspector');
	if (!(await inspector.isVisible())) {
		await page
			.getByRole('button', { name: 'Settings', exact: true })
			.click();
	}
	await expect(inspector).toBeVisible();
});
test('editor table fits the canvas without horizontal scrolling', async ({
	page,
}) => {
	const canvas = page.frameLocator('iframe[name="editor-canvas"]');
	const table = canvas.locator('.modular-table-blocks-editor');
	await expect(table).toBeVisible();
	for (const columns of [
		[{}, {}, {}, {}],
		[
			{ width: '20%' },
			{ width: '20%' },
			{ width: '30%' },
			{ width: '30%' },
		],
	]) {
		await page.evaluate((nextColumns) => {
			const block = window.wp.data
				.select('core/block-editor')
				.getBlocks()[0];
			window.wp.data
				.dispatch('core/block-editor')
				.updateBlockAttributes(block.clientId, {
					columns: nextColumns,
				});
		}, columns);
		for (const width of [1280, 375]) {
			await page.setViewportSize({ width, height: 900 });
			await expectContained(table);
			const cells = await table
				.locator('.modular-table-blocks-editor__cell')
				.evaluateAll((nodes) =>
					nodes.map((node) => {
						const rect = node.getBoundingClientRect();
						return { left: rect.left, right: rect.right };
					})
				);
			for (let i = 1; i < cells.length; i++) {
				expect(cells[i - 1].right - cells[i].left).toBeLessThanOrEqual(
					1
				);
			}
		}
	}
});
test('oversized editor widths stay inside the canvas and scroll mode retains usable columns', async ({
	page,
}) => {
	const table = page
		.frameLocator('iframe[name="editor-canvas"]')
		.locator('.modular-table-blocks-editor');
	await expect(table).toBeVisible();
	await page.setViewportSize({ width: 375, height: 900 });
	await page.evaluate(() => {
		const block = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(block.clientId, {
				styleTokens: { tableWidth: '1500px' },
				columns: [{ width: '900px' }, { width: '300px' }, {}, {}],
			});
	});
	await expectContained(table);
	expect(
		await page.evaluate(
			() =>
				window.wp.data.select('core/block-editor').getBlocks()[0]
					.attributes
		)
	).toMatchObject({
		styleTokens: { tableWidth: '1500px' },
		columns: [{ width: '900px' }, { width: '300px' }, {}, {}],
		responsiveMode: 'none',
	});
	await page.evaluate(() => {
		const block = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(block.clientId, {
				styleTokens: {},
				columns: [{}, {}, {}, {}],
				responsiveMode: 'scroll',
			});
	});
	await expectContained(table, false);
	await expect
		.poll(() =>
			table.evaluate((node) => node.scrollWidth - node.clientWidth)
		)
		.toBeGreaterThan(100);
	await table.evaluate((node) => {
		node.scrollLeft = node.scrollWidth;
	});
	await expect
		.poll(() => table.evaluate((node) => node.scrollLeft))
		.toBeGreaterThan(100);
	await page.evaluate(() => {
		const block = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(block.clientId, { responsiveMode: 'none' });
	});
	await expectContained(table);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	await expectContained(table);
	await expect(
		table.locator('.modular-table-blocks-editor__cell')
	).toHaveCount(4);
	await page.screenshot({
		path: test.info().outputPath('editor-contained-mobile.png'),
		fullPage: true,
	});
});
