import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { openEditor } from './login';

const host = `
:root :is(.editor-styles-wrapper, .is-root-container, .wp-block-post-content, .entry-content) {
 font-family: Arial, sans-serif; font-size:20px; line-height:1.5; font-weight:400;
 font-style:italic; letter-spacing:1px; text-align:left; color:#234567;
}
`;
const theme = `
table { font-family:monospace; font-size:9px; font-weight:900; font-style:normal;
 line-height:.8; letter-spacing:5px; text-transform:uppercase; text-align:center;
 color:#ee0000; padding:23px; border-radius:17px; box-shadow:0 0 5px red;
 background-image:linear-gradient(red, blue); }
thead, tbody, tr, colgroup, col { font-size:11px; font-weight:100;
 line-height:.9; background:#ffcccc; border:8px solid red; }
tr:nth-child(even) { background:#ccffaa; }
td, th { font-family:monospace; font-size:10px; font-weight:100; font-style:normal;
 line-height:1; letter-spacing:7px; text-transform:uppercase; text-align:center;
 color:#dd0000; padding:31px !important; border:9px dashed orange;
 border-radius:13px; box-shadow:0 0 5px blue; background-color:#ffeeaa;
 background-image:linear-gradient(yellow, green); word-break:break-all; }
caption { font:12px/1 monospace; margin:18px; padding:25px; background:yellow; }
.mtb-baseline-content { margin-top:19px; margin-bottom:23px; font-weight:600; }
`;
const canvas = (page: Page) =>
	page.frameLocator('iframe[name="editor-canvas"]');
const properties = [
	'font-family',
	'font-size',
	'font-weight',
	'font-style',
	'line-height',
	'letter-spacing',
	'text-align',
	'text-transform',
	'text-decoration-line',
	'writing-mode',
	'color',
	'background-color',
	'background-image',
	'border-top-left-radius',
	'box-shadow',
	'word-break',
	'overflow-wrap',
	...['top', 'right', 'bottom', 'left'].flatMap((side) => [
		`padding-${side}`,
		`border-${side}-width`,
		`border-${side}-style`,
		`border-${side}-color`,
	]),
];
async function computed(nodes: Locator, fields = properties) {
	return nodes.evaluateAll(
		(elements, keys) =>
			elements.map((node) => {
				const css =
					node.ownerDocument.defaultView!.getComputedStyle(node);
				return Object.fromEntries(
					keys.map((key) => [key, css.getPropertyValue(key)])
				);
			}),
		fields
	);
}
async function fixture(page: Page, explicit: boolean) {
	await page.evaluate((custom) => {
		const { createBlock } = window.wp.blocks;
		const cell = (content: string, attributes = {}, paragraph = false) =>
			createBlock('modular-table-blocks/cell', attributes, [
				createBlock(
					paragraph
						? 'core/paragraph'
						: 'modular-table-blocks/cell-text',
					{
						content,
						...(paragraph
							? { className: 'mtb-baseline-content' }
							: {}),
					}
				),
			]);
		const features = window.wp.data
			.select('core/block-editor')
			.getSettings().__experimentalFeatures as {
			typography: { fontFamilies: { theme: { slug: string }[] } };
		};
		const table = window.mtbCreateTable(
			{
				columns: [{}, {}],
				headerRows: 1,
				caption: 'Shared caption',
				...(custom
					? {
							fontFamily:
								features.typography.fontFamilies.theme[0].slug,
							style: {
								typography: {
									fontSize: '120%',
									lineHeight: '1.7',
									fontWeight: '500',
									fontStyle: 'oblique',
									letterSpacing: '2px',
									textTransform: 'uppercase',
									textAlign: 'right',
								},
								color: { background: '#ddeeff' },
							},
						}
					: {}),
			},
			[
				[
					cell(
						'First',
						custom
							? {
									style: {
										typography: {
											fontWeight: '300',
											fontSize: '140%',
											fontFamily: 'monospace',
											textAlign: 'left',
										},
									},
									styleTokens: {
										backgroundColor: '#ffeecc',
										borderWidth: '3px',
										borderStyle: 'dashed',
										borderColor: '#112233',
										cellPaddingBlock: '9px',
										cellPaddingInline: '11px',
									},
								}
							: {}
					),
					cell('Second'),
				],
				[cell('Third'), cell('Paragraph', {}, true)],
			]
		);
		const other = createBlock('core/table', {
			body: [{ cells: [{ content: 'Other table', tag: 'td' }] }],
		});
		window.wp.data
			.dispatch('core/block-editor')
			.resetBlocks([table, other]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.clientId);
		window.wp.data
			.dispatch('core/editor')
			.editPost({ title: 'Shared style baseline', status: 'publish' });
	}, explicit);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page
		.frames()
		.find((frame) => frame.name() === 'editor-canvas')!
		.addStyleTag({ content: host + theme });
}
for (const explicit of [false, true]) {
	test(`editor, public table and bulk preview share ${explicit ? 'explicit native styles and inherited header weight' : 'tag-independent defaults'}`, async ({
		page,
		context,
	}) => {
		await openEditor(page, context);
		await fixture(page, explicit);
		const editorTable = canvas(page).locator(
			'.modular-table-blocks-editor'
		);
		const editorCells = editorTable.locator(
			'.modular-table-blocks-editor__cell'
		);
		await expect(editorCells).toHaveCount(4);
		await expect(editorCells.nth(1)).toHaveCSS(
			'font-weight',
			explicit ? '500' : '700'
		);
		await expect(editorCells.nth(0)).toHaveCSS(
			'font-weight',
			explicit ? '300' : '700'
		);
		const expected = await computed(editorCells);
		const tableStyles = await computed(editorTable);
		const captionStyles = await computed(
			editorTable.locator('.modular-table-blocks-editor__caption'),
			[...properties, 'margin-top', 'margin-bottom']
		);
		const captionBackground = await editorTable.evaluate(
			(node) => getComputedStyle(node).backgroundColor
		);
		await expect(
			editorTable.locator('.modular-table-blocks-editor__caption')
		).toHaveCSS('background-color', captionBackground);
		await expect(editorTable).toHaveCSS('padding-top', '0px');
		await expect(editorTable).toHaveCSS('border-top-width', '0px');
		const source = await page.evaluate(() =>
			window.wp.data.select('core/editor').getEditedPostContent()
		);
		const id = await page.evaluate(() =>
			window.wp.data.select('core/editor').getCurrentPostId()
		);
		const front = await context.newPage();
		try {
			await front.goto(`/?p=${id}`);
			await front.addStyleTag({ content: host + theme });
			const table = front.locator(
				'table.wp-block-modular-table-blocks-table'
			);
			expect(
				await computed(
					table.locator('.wp-block-modular-table-blocks-cell')
				)
			).toEqual(expected);
			expect(await computed(table)).toEqual(tableStyles);
			expect(
				await computed(table.locator('caption'), [
					...properties,
					'margin-top',
					'margin-bottom',
				])
			).toEqual(captionStyles);
			await expect(table.locator('tr').nth(1)).toHaveCSS(
				'background-color',
				'rgba(0, 0, 0, 0)'
			);
			await expect(table.locator('.mtb-baseline-content')).toHaveCSS(
				'font-weight',
				'600'
			);
			await expect(table.locator('.mtb-baseline-content')).toHaveCSS(
				'margin-bottom',
				'23px'
			);
			await expect(front.locator('.wp-block-table td')).toHaveCSS(
				'padding-top',
				'31px'
			);
			await expect(table.locator('div')).toHaveCount(0);
			await front.screenshot({
				path: test.info().outputPath('public-baseline.png'),
				fullPage: true,
			});
		} finally {
			await front.close();
		}
		await page.addStyleTag({ content: theme });
		await page
			.getByRole('button', { name: 'Bulk edit cells', exact: true })
			.click();
		const modal = page.getByRole('dialog');
		expect(
			await computed(
				modal.locator('.modular-table-blocks-bulk-preview-cell')
			)
		).toEqual(expected);
		await modal
			.getByRole('button', { name: 'Close', exact: true })
			.last()
			.click();
		expect(
			await page.evaluate(() =>
				window.wp.data.select('core/editor').getEditedPostContent()
			)
		).toBe(source);
		await page.screenshot({
			path: test.info().outputPath('editor-baseline.png'),
			fullPage: true,
		});
	});
}

test('clearing a parent weight restores the shared bold header default without persisting defaults', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page, true);
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		const style = table.attributes.style as {
			typography: Record<string, unknown>;
		};
		const typography = { ...style.typography };
		delete typography.fontWeight;
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(table.clientId, {
				style: { ...style, typography },
				caption: '',
			});
	});
	const table = canvas(page).locator('.modular-table-blocks-editor');
	await expect(table).not.toHaveAttribute('data-mtb-font-weight');
	await expect(
		table.locator('.modular-table-blocks-editor__caption')
	).toHaveCount(0);
	await expect(
		table.locator('.modular-table-blocks-editor__cell').nth(0)
	).toHaveCSS('font-weight', '300');
	await expect(
		table.locator('.modular-table-blocks-editor__cell').nth(1)
	).toHaveCSS('font-weight', '700');
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	await expect(
		table.locator('.modular-table-blocks-editor__cell')
	).toHaveCount(4);
	await expect(
		table.locator('.modular-table-blocks-editor__cell').nth(1)
	).toHaveCSS('font-weight', '700');
	expect(
		await page.evaluate(() =>
			window.wp.data.select('core/editor').getEditedPostContent()
		)
	).not.toContain('data-mtb-font-weight');
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${id}`);
	const front = page.locator('table.wp-block-modular-table-blocks-table');
	await expect(front).not.toHaveAttribute('data-mtb-font-weight');
	await expect(front.locator('caption')).toHaveCount(0);
	await expect(front.locator('th').nth(0)).toHaveCSS('font-weight', '300');
	await expect(front.locator('th').nth(1)).toHaveCSS('font-weight', '700');
});
