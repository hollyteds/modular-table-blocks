import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openEditor } from './login';
const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
	const errors: string[] = [];
	runtimeErrors.set(page, errors);
	page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
	expect(runtimeErrors.get(page)).toEqual([]);
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.clientId);
	});
	if (!(await page.locator('.block-editor-block-inspector').isVisible())) {
		await page
			.getByRole('button', { name: 'Settings', exact: true })
			.click();
	}
});
// Exercise content contributions from every row, with and without fixed tracks.
for (const fixed of [false, true]) {
	test(`intrinsic editor columns follow content across rows with ${fixed ? 'mixed fixed' : 'automatic'} widths`, async ({
		page,
		context,
	}) => {
		await openEditor(page, context);
		await page.evaluate((hasFixed) => {
			const { createBlock } = window.wp.blocks;
			const row = (texts: string[]) =>
				texts.map((content) =>
					createBlock('modular-table-blocks/cell', {}, [
						createBlock('core/paragraph', { content }),
					])
				);
			const table = window.mtbCreateTable(
				{
					columnWidthMode: hasFixed ? 'custom' : 'auto',
					columns: hasFixed
						? [{ width: '100px' }, {}, {}]
						: [{}, {}, {}],
					styleTokens: {
						cellPaddingBlock: '6px',
						cellPaddingInline: '8px',
					},
				},
				[
					row(['ID', 'Name', 'Details']),
					row([
						'1',
						'A',
						'A detailed explanation containing several words to make this column naturally wider.',
					]),
				]
			);
			window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
		}, fixed);
		const canvas = page.frameLocator('iframe[name="editor-canvas"]');
		const rows = (r: number) =>
			canvas.locator(
				`.modular-table-blocks-editor__cell[data-mtb-row="${r}"]`
			);
		const cell = (row: number, col: number) => rows(row).nth(col);
		const widths = () =>
			rows(0).evaluateAll((nodes) =>
				nodes.map((n) => n.getBoundingClientRect().width)
			);
		await expect(cell(0, 2)).toBeVisible();
		const attributes = await page.evaluate(
			() =>
				window.wp.data.select('core/block-editor').getBlocks()[0]
					.attributes
		);
		await page
			.frames()
			.find((frame) => frame.name() === 'editor-canvas')!
			.addStyleTag({
				content:
					'.editor-styles-wrapper .wp-block { margin-left:auto; margin-right:auto; }',
			});
		await expect
			.poll(async () => {
				const w = await widths();
				return w[2] - w[1];
			})
			.toBeGreaterThan(40);
		for (let c = 0; c < 3; c++) {
			expect(
				Math.abs(
					(await cell(0, c).boundingBox())!.width -
						(await cell(1, c).boundingBox())!.width
				)
			).toBeLessThan(1);
		}
		const paragraph = cell(1, 2)
			.locator('[contenteditable="true"]')
			.first();
		const paragraphFillsCell = async () => {
			const sizes = await cell(1, 2).evaluate((node) => {
				const style = getComputedStyle(node);
				return {
					available:
						node.clientWidth -
						parseFloat(style.paddingLeft) -
						parseFloat(style.paddingRight),
					actual: node
						.querySelector('[contenteditable="true"]')!
						.getBoundingClientRect().width,
				};
			});
			expect(Math.abs(sizes.actual - sizes.available)).toBeLessThan(1);
		};
		await paragraphFillsCell();
		const longWidth = (await widths())[2];
		await paragraph.fill('A');
		await expect
			.poll(async () => (await widths())[2])
			.toBeLessThan(longWidth - 20);
		await paragraph.fill(
			'A detailed explanation containing several words to make this column naturally wider.'
		);
		await expect
			.poll(async () => {
				const w = await widths();
				return w[2] - w[1];
			})
			.toBeGreaterThan(40);
		await paragraphFillsCell();
		if (fixed) {
			expect((await widths())[0]).toBeCloseTo(100, 0);
		}
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').savePost()
		);
		const id = await page.evaluate(() =>
			window.wp.data.select('core/editor').getCurrentPostId()
		);
		await page.reload();
		await expect
			.poll(async () => {
				const w = await widths();
				return w[2] - w[1];
			})
			.toBeGreaterThan(40);
		const saved = await page.evaluate(
			() =>
				window.wp.data.select('core/block-editor').getBlocks()[0]
					.attributes
		);
		// WordPress may serialize an empty column object as [] on reload.
		expect({
			...saved,
			columns: (saved.columns as object[]).map((column) => ({
				...column,
			})),
		}).toEqual(attributes);
		const editorWidths = await widths();
		const frontend = await context.newPage();
		try {
			await frontend.goto(`/?p=${id}`);
			const table = frontend.locator(
				'table.wp-block-modular-table-blocks-table'
			);
			await expect(table).toBeVisible();
			const publicWidths = await table
				.locator('tr')
				.first()
				.locator('td')
				.evaluateAll((nodes) =>
					nodes.map((n) => n.getBoundingClientRect().width)
				);
			expect(publicWidths[2]).toBeGreaterThan(publicWidths[1]);
			await test.info().attach('column-width-comparison', {
				body: JSON.stringify({ editorWidths, publicWidths }),
				contentType: 'application/json',
			});
			await frontend.screenshot({
				path: test.info().outputPath('public-content-widths.png'),
				fullPage: true,
			});
		} finally {
			await frontend.close();
		}
		await page.screenshot({
			path: test.info().outputPath('editor-content-widths.png'),
			fullPage: true,
		});
	});
}
test('intrinsic merged columns stay aligned and oversized images and text remain reachable on narrow screens', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const cell = (content: string, attributes = {}) =>
			createBlock('modular-table-blocks/cell', attributes, [
				createBlock('core/paragraph', { content }),
			]);
		const table = window.mtbCreateTable(
			{
				columnWidthMode: 'auto',
				columns: [{}, {}, {}],
				styleTokens: {
					cellPaddingInline: '8px',
					cellPaddingBlock: '6px',
				},
			},
			[
				[cell('Group', { colSpan: 2 }), cell('Details')],
				[
					cell('ID', { rowSpan: 2 }),
					cell('A'),
					cell(
						'A detailed explanation with enough content to allocate more width to the last column.'
					),
				],
				[cell('B'), cell('End')],
			]
		);
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
	});
	const canvas = page.frameLocator('iframe[name="editor-canvas"]');
	const table = canvas.locator('.modular-table-blocks-editor');
	const rows = (r: number) =>
		table.locator(
			`.modular-table-blocks-editor__cell[data-mtb-row="${r}"]`
		);
	const cells = (r: number) => rows(r);
	await expect(cells(0).first()).toBeVisible();
	const mergedBounds = async () => {
		const [head, spanRow, tailRow] = await Promise.all([
			cells(0).all(),
			cells(1).all(),
			cells(2).all(),
		]);
		const [group, id, name, description, tailName, tailDescription] =
			await Promise.all(
				[
					head[0],
					spanRow[0],
					spanRow[1],
					spanRow[2],
					tailRow[0],
					tailRow[1],
				].map((n) => n.boundingBox())
			);
		return {
			group: group!,
			id: id!,
			name: name!,
			description: description!,
			tailName: tailName!,
			tailDescription: tailDescription!,
		};
	};
	const aligned = async () => {
		const b = await mergedBounds();
		expect(
			Math.abs(b.group.width - b.id.width - b.name.width)
		).toBeLessThan(1);
		expect(Math.abs(b.name.x - b.tailName.x)).toBeLessThan(1);
		expect(Math.abs(b.description.x - b.tailDescription.x)).toBeLessThan(1);
		expect(
			Math.abs(b.description.width - b.tailDescription.width)
		).toBeLessThan(1);
		expect(b.id.y + b.id.height).toBeCloseTo(
			b.tailName.y + b.tailName.height,
			0
		);
	};
	await expect
		.poll(async () => {
			const b = await mergedBounds();
			return b.description.width - b.name.width;
		})
		.toBeGreaterThan(40);
	await aligned();
	const original = await mergedBounds();
	await cells(2)
		.first()
		.locator('[contenteditable="true"]')
		.fill(
			'A much longer name that changes the width of its entire logical column.'
		);
	await expect
		.poll(async () => (await mergedBounds()).name.width)
		.toBeGreaterThan(original.name.width + 20);
	await aligned();
	await page.evaluate(() => {
		const tableBlock = window.wp.data
			.select('core/block-editor')
			.getBlocks()[0];
		const target = tableBlock.innerBlocks.filter(
			(candidate) => candidate.attributes.row === 2
		)[1];
		window.wp.data.dispatch('core/block-editor').replaceInnerBlocks(
			target.clientId,
			[
				window.wp.blocks.createBlock('core/image', {
					url: `${window.location.origin}/wp-includes/images/w-logo-blue.png`,
					alt: 'Intrinsic image',
					width: 720,
					height: 720,
				}),
				window.wp.blocks.createBlock('core/paragraph', {
					content: 'LongUnbrokenContent'.repeat(12),
				}),
			],
			false
		);
	});
	const image = table.getByRole('img', {
		name: 'Intrinsic image',
		exact: true,
	});
	await expect(image).toBeVisible();
	await expect
		.poll(() =>
			image.evaluate((node) => (node as HTMLImageElement).naturalWidth)
		)
		.toBeGreaterThan(0);
	for (const width of [1280, 375]) {
		await page.setViewportSize({ width, height: 900 });
		await aligned();
		await expect
			.poll(() =>
				table.evaluate((node) => {
					const bounds = node.getBoundingClientRect();
					const parent = node.parentElement!.getBoundingClientRect();
					return Math.max(
						parent.left - bounds.left,
						bounds.right - parent.right
					);
				})
			)
			.toBeLessThanOrEqual(1);
		// WP 6.6's explicitly sized image can exceed its track. The existing
		// table scroll region must keep its right edge reachable within the canvas.
		const overflow = await table.evaluate(
			(node) => node.scrollWidth - node.clientWidth
		);
		if (overflow > 1) {
			await table.evaluate((node) => {
				node.scrollLeft = node.scrollWidth;
			});
			await expect
				.poll(() => table.evaluate((node) => node.scrollLeft))
				.toBeGreaterThanOrEqual(overflow - 1);
			const imageBounds = (await image.boundingBox())!;
			const tableBounds = (await table.boundingBox())!;
			expect(imageBounds.x + imageBounds.width).toBeLessThanOrEqual(
				tableBounds.x + tableBounds.width + 1
			);
			await table.evaluate((node) => {
				node.scrollLeft = 0;
			});
		}
	}
	await page.screenshot({
		path: test.info().outputPath('intrinsic-merged-mobile.png'),
		fullPage: true,
	});
});
