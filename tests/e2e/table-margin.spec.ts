import { test, expect } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { openEditor } from './login';

// Check the margin box, not just the table's border box.
async function expectMarginContained(node: Locator) {
	await expect
		.poll(() =>
			node.evaluate((element) => {
				const rect = element.getBoundingClientRect();
				const parent = element.parentElement!;
				const bounds = parent.getBoundingClientRect();
				const parentStyle = getComputedStyle(parent);
				const style = getComputedStyle(element);
				return Math.max(
					rect.right +
						parseFloat(style.marginRight) -
						bounds.right +
						parseFloat(parentStyle.paddingRight),
					bounds.left +
						parseFloat(parentStyle.paddingLeft) -
						rect.left +
						parseFloat(style.marginLeft)
				);
			})
		)
		.toBeLessThanOrEqual(1);
}

for (const scroll of [false, true]) {
	test(`horizontal margins fit the parent in editor and public ${scroll ? 'scroll' : 'normal'} tables`, async ({
		page,
		context,
	}) => {
		await openEditor(page, context);
		await page.evaluate((scrollable) => {
			const { createBlock } = window.wp.blocks;
			const margin = { left: '24px', right: '2rem' };
			const tables = ['', '50%'].map((width) =>
				window.mtbCreateTable(
					{
						columns: [{ label: 'First' }, { label: 'Second' }],
						responsiveMode: scrollable ? 'scroll' : 'none',
						...(width
							? { styleTokens: { tableWidth: width } }
							: {}),
						style: { spacing: { margin } },
					},
					[
						[
							createBlock(
								'modular-table-blocks/cell',
								{ rowSpan: 2 },
								[
									createBlock(
										'modular-table-blocks/cell-text',
										{ content: 'Merged' }
									),
								]
							),
							createBlock('modular-table-blocks/cell', {}, [
								createBlock('modular-table-blocks/cell-text', {
									content: 'B',
								}),
							]),
						],
						[
							createBlock('modular-table-blocks/cell', {}, [
								createBlock('modular-table-blocks/cell-text', {
									content: 'C',
								}),
							]),
						],
					]
				)
			);
			const core = createBlock('core/table', {
				style: { spacing: { margin } },
				body: [{ cells: [{ content: 'Core reference', tag: 'td' }] }],
			});
			window.wp.data.dispatch('core/block-editor').resetBlocks([
				createBlock(
					'core/group',
					{
						layout: { type: 'default' },
						style: {
							spacing: {
								padding: { left: '16px', right: '16px' },
							},
						},
					},
					[core, ...tables]
				),
			]);
		}, scroll);
		const canvas = page.frameLocator('iframe[name="editor-canvas"]');
		const editorTables = canvas.locator('.modular-table-blocks-editor');
		await expect(editorTables).toHaveCount(2);
		for (const width of [1280, 375]) {
			await page.setViewportSize({ width, height: 900 });
			for (const table of await editorTables.all()) {
				await expectMarginContained(table);
			}
			const native = (await canvas
				.locator('.wp-block-table')
				.boundingBox())!;
			const plugin = (await editorTables.first().boundingBox())!;
			expect(Math.abs(native.width - plugin.width)).toBeLessThanOrEqual(
				1
			);
		}
		const source = await page.evaluate(() =>
			window.wp.data.select('core/editor').getEditedPostContent()
		);
		await page.screenshot({
			path: test.info().outputPath('editor-horizontal-margins.png'),
		});
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').editPost({
				title: 'Horizontal table margins',
				status: 'publish',
			})
		);
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').savePost()
		);
		const id = await page.evaluate(() =>
			window.wp.data.select('core/editor').getCurrentPostId()
		);
		await page.reload();
		await expect(editorTables).toHaveCount(2);
		expect(
			await page.evaluate(() =>
				window.wp.data.select('core/editor').getEditedPostContent()
			)
		).toBe(source);
		await expectMarginContained(editorTables.first());
		await page.goto(`/?p=${id}`);
		const figures = page.locator('figure.modular-table-blocks-figure');
		await expect(figures).toHaveCount(2);
		for (const width of [1280, 375]) {
			await page.setViewportSize({ width, height: 900 });
			for (const wrapper of await figures.all()) {
				await expectMarginContained(wrapper);
				await expect(wrapper).toHaveCSS('margin-left', '24px');
				expect(
					await wrapper.evaluate(
						(node) => (node as HTMLElement).style.width
					)
				).toBe('');
				await expect(wrapper.locator('table')).toHaveCSS(
					'margin-left',
					'0px'
				);
				await expect(wrapper.locator('[rowspan="2"]')).toHaveCount(1);
			}
			const native = (await page
				.locator('figure.wp-block-table')
				.boundingBox())!;
			const plugin = (await figures.first().boundingBox())!;
			expect(Math.abs(native.width - plugin.width)).toBeLessThanOrEqual(
				1
			);
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth - innerWidth
				)
			).toBeLessThanOrEqual(1);
		}
		if (scroll) {
			const region = figures
				.first()
				.locator('.modular-table-blocks-scroll');
			expect(
				await region.evaluate(
					(node) => node.scrollWidth - node.clientWidth
				)
			).toBeGreaterThan(100);
		}
		await page.screenshot({
			path: test.info().outputPath('public-horizontal-margins.png'),
			fullPage: true,
		});
	});
}
