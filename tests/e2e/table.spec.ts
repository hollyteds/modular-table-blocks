import { test, expect } from '@playwright/test';
import { openEditor } from './login';

test.beforeEach(async ({ page, context }) => {
	await openEditor(page, context);
});

test('M0: 2×2 nested editing, keyboard, save/reload, round-trip and public DOM', async ({
	page,
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') {
			if (
				message.text() ===
				'Warning: You are importing createRoot from "react-dom" which is not supported. You should instead import it from "react-dom/client".'
			) {
				test.info().annotations.push({
					type: 'WordPress 6.6 core development warning',
					description: message.text(),
				});
				return;
			}
			errors.push(message.text());
		}
	});
	await page.evaluate(() => {
		window.wp.data
			.dispatch('core/block-editor')
			.insertBlocks([
				window.wp.blocks.createBlock('modular-table-blocks/table'),
			]);
	});
	const canvas = page.frameLocator('iframe[name="editor-canvas"]');
	await canvas.getByLabel('Rows', { exact: true }).fill('2');
	await canvas.getByLabel('Columns', { exact: true }).fill('2');
	await canvas.getByRole('button', { name: 'Create table' }).click();
	const cells = canvas.locator('.modular-table-blocks-editor__cell');
	await expect(cells).toHaveCount(4);
	for (let i = 0; i < 4; i++) {
		await cells
			.nth(i)
			.locator('[contenteditable="true"]')
			.fill(`Cell ${i + 1}`);
	}
	await cells
		.first()
		.locator('[contenteditable="true"]')
		.press('ControlOrMeta+ArrowRight');
	await page.keyboard.type(' keyboard');
	await expect(cells.first()).toContainText('Cell 1 keyboard');
	const hierarchy = await cells.first().evaluate((node) => ({
		cell: node.tagName,
		row: node.parentElement?.tagName,
		rowClass: node.parentElement?.className,
	}));
	expect(hierarchy).toMatchObject({ cell: 'DIV', row: 'DIV' });
	expect(hierarchy.rowClass).toContain('modular-table-blocks-editor__row');
	await page.evaluate(() => {
		const table = window.wp.data
			.select('core/block-editor')
			.getBlocks()
			.find((b) => b.name === 'modular-table-blocks/table')!;
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(table.clientId, { caption: 'M0 caption' });
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(
				table.innerBlocks[0].innerBlocks[0].clientId,
				{ tag: 'th', scope: 'col' }
			);
		window.wp.data
			.dispatch('core/editor')
			.editPost({ title: 'MTB M0 E2E', status: 'publish' });
	});
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	const postId = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.reload();
	await expect(cells).toHaveCount(4);
	await expect(cells.first()).toContainText('Cell 1 keyboard');
	const result = await page.evaluate(() => {
		const source = window.wp.data
			.select('core/editor')
			.getEditedPostContent();
		const blocks = window.wp.blocks.parse(source);
		const validTree = (items: typeof blocks): boolean =>
			items.every((b) => b.isValid && validTree(b.innerBlocks));
		return {
			source,
			serialized: window.wp.blocks.serialize(blocks),
			valid: validTree(blocks),
		};
	});
	expect(result.valid).toBe(true);
	expect(result.serialized).toBe(result.source);
	expect(result.source).toContain('wp:modular-table-blocks/row');
	expect(result.source).toContain('wp:modular-table-blocks/cell');
	expect(result.source).not.toContain('modular-table-blocks-editor');
	await page.screenshot({
		path: test.info().outputPath('editor.png'),
		fullPage: true,
	});
	await page.goto(`/?p=${postId}`);
	const table = page.locator('table.wp-block-modular-table-blocks-table');
	await expect(table.locator(':scope > tbody > tr')).toHaveCount(2);
	await expect(table.locator('th[scope="col"]')).toHaveText(
		'Cell 1 keyboard'
	);
	await expect(table.locator(':scope > caption')).toHaveText('M0 caption');
	await expect(
		table.locator(':scope > tbody > tr > :is(td,th) > p')
	).toHaveCount(4);
	await expect(table.locator('div')).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('CSS tokens inherit through site/table/row/cell in editor and public output', async ({
	page,
}) => {
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const makeCell = (text: string, styleTokens = {}) =>
			createBlock('modular-table-blocks/cell', { styleTokens }, [
				createBlock('core/paragraph', { content: text }),
			]);
		const first = createBlock(
			'modular-table-blocks/table',
			{ columns: [{}, {}], styleTokens: { borderColor: '#123456' } },
			[
				createBlock(
					'modular-table-blocks/row',
					{ styleTokens: { cellPaddingInline: '24px' } },
					[
						makeCell('A', {
							textColor: '#ff0000',
							cellBackgroundColor: '#ffff00',
						}),
						makeCell('B'),
					]
				),
				createBlock('modular-table-blocks/row', {}, [
					makeCell('C'),
					makeCell('D'),
				]),
			]
		);
		const second = createBlock(
			'modular-table-blocks/table',
			{ columns: [{}] },
			[createBlock('modular-table-blocks/row', {}, [makeCell('E')])]
		);
		window.wp.data
			.dispatch('core/block-editor')
			.resetBlocks([first, second]);
		window.wp.data
			.dispatch('core/editor')
			.editPost({ title: 'MTB token inheritance', status: 'publish' });
	});
	const canvas = page.frameLocator('iframe[name="editor-canvas"]');
	const cells = canvas.locator('.modular-table-blocks-editor__cell');
	await expect(cells).toHaveCount(5);
	await canvas.locator('body').evaluate((body) => {
		body.style.setProperty('--mtb-border-color', '#00ff00');
		body.style.setProperty('--mtb-cell-padding-inline', '18px');
		body.style.setProperty('--mtb-text-color', '#0000ff');
	});
	const checkCells = async (locator: typeof cells) => {
		await expect(locator.nth(0)).toHaveCSS('color', 'rgb(255, 0, 0)');
		await expect(locator.nth(0)).toHaveCSS(
			'background-color',
			'rgb(255, 255, 0)'
		);
		await expect(locator.nth(1)).toHaveCSS('color', 'rgb(0, 0, 255)');
		await expect(locator.nth(0)).toHaveCSS(
			'border-top-color',
			'rgb(18, 52, 86)'
		);
		await expect(locator.nth(4)).toHaveCSS(
			'border-top-color',
			'rgb(0, 255, 0)'
		);
		await expect(locator.nth(1)).toHaveCSS('padding-inline-start', '24px');
		await expect(locator.nth(2)).toHaveCSS('padding-inline-start', '18px');
	};
	await checkCells(cells);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	const postId = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${postId}`);
	await page.addStyleTag({
		content:
			':root { --mtb-border-color: #00ff00; --mtb-cell-padding-inline: 18px; --mtb-text-color: #0000ff; }',
	});
	const publicCells = page.locator('.wp-block-modular-table-blocks-cell');
	await expect(
		page.locator('table.wp-block-modular-table-blocks-table')
	).toHaveCount(2);
	await checkCells(publicCells);
	await expect(publicCells.nth(2)).not.toHaveAttribute('style');
	await page.addStyleTag({
		content:
			':root { --mtb-border-color: #ff00ff; --mtb-cell-padding-inline: 20px; }',
	});
	await expect(publicCells.nth(4)).toHaveCSS(
		'border-top-color',
		'rgb(255, 0, 255)'
	);
	await expect(publicCells.nth(0)).toHaveCSS(
		'border-top-color',
		'rgb(18, 52, 86)'
	);
	await expect(publicCells.nth(1)).toHaveCSS('padding-inline-start', '24px');
	await expect(publicCells.nth(2)).toHaveCSS('padding-inline-start', '20px');
	await page.setViewportSize({ width: 375, height: 812 });
	await expect(publicCells.first()).toHaveCSS('display', 'table-cell');
	await expect(
		page.locator('.wp-block-modular-table-blocks-row').first()
	).toHaveCSS('display', 'table-row');
});

test('style inspector validates, saves and clears explicit values', async ({
	page,
}) => {
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const cell = createBlock('modular-table-blocks/cell', {}, [
			createBlock('core/paragraph', { content: 'Inspector check' }),
		]);
		window.wp.data
			.dispatch('core/block-editor')
			.resetBlocks([
				createBlock('modular-table-blocks/table', { columns: [{}] }, [
					createBlock('modular-table-blocks/row', {}, [cell]),
				]),
			]);
		window.wp.data.dispatch('core/block-editor').selectBlock(cell.clientId);
	});
	await page
		.getByRole('button', { name: 'Table styles', exact: true })
		.click();
	const color = page.getByLabel('Text color', { exact: true });
	await color.fill('red;position:fixed');
	await expect(color).toHaveAttribute('aria-invalid', 'true');
	const tokens = () =>
		page.evaluate(
			() =>
				window.wp.data.select('core/block-editor').getBlocks()[0]
					.innerBlocks[0].innerBlocks[0].attributes.styleTokens
		);
	expect(await tokens()).toBeUndefined();
	await color.fill('#ff0000');
	expect(await tokens()).toEqual({ textColor: '#ff0000' });
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	const canvas = page.frameLocator('iframe[name="editor-canvas"]');
	await expect(
		canvas.locator('.modular-table-blocks-editor__cell')
	).toHaveCSS('color', 'rgb(255, 0, 0)');
	await page.evaluate(() => {
		const cell = window.wp.data.select('core/block-editor').getBlocks()[0]
			.innerBlocks[0].innerBlocks[0];
		window.wp.data.dispatch('core/block-editor').selectBlock(cell.clientId);
	});
	await page
		.getByRole('button', { name: 'Table styles', exact: true })
		.click();
	await color.fill('');
	expect(await tokens()).toEqual({});
	await expect
		.poll(() =>
			canvas
				.locator('.modular-table-blocks-editor__cell')
				.evaluate((node) =>
					(node as HTMLElement).style.getPropertyValue(
						'--mtb-text-color'
					)
				)
		)
		.toBe('');
});

test('Japanese catalogs translate metadata, controls and validation without changing saved content', async ({
	page,
}) => {
	await page.goto('/wp-admin/post-new.php?mtb_test_locale=ja');
	await page.waitForFunction(
		() => !!window.wp?.blocks?.getBlockType('modular-table-blocks/table')
	);
	const titles = await page.evaluate(() =>
		['table', 'row', 'cell'].map(
			(name) =>
				window.wp.blocks.getBlockType(`modular-table-blocks/${name}`)
					?.title
		)
	);
	expect(titles).toEqual([
		'モジュラーテーブル',
		'テーブル行',
		'テーブルセル',
	]);
	await page.evaluate(() =>
		window.wp.data
			.dispatch('core/block-editor')
			.insertBlocks([
				window.wp.blocks.createBlock('modular-table-blocks/table'),
			])
	);
	const canvas = page.frameLocator('iframe[name="editor-canvas"]');
	await canvas.getByLabel('行数', { exact: true }).fill('2');
	await canvas.getByLabel('列数', { exact: true }).fill('2');
	await canvas
		.getByRole('button', { name: 'テーブルを作成', exact: true })
		.click();
	await expect(
		canvas.locator('.modular-table-blocks-editor__cell')
	).toHaveCount(4);
	await expect(
		page.getByRole('button', { name: 'テーブル設定', exact: true })
	).toBeVisible();
	await page
		.getByRole('button', { name: 'テーブルのスタイル', exact: true })
		.click();
	await page.getByLabel('文字色', { exact: true }).fill('invalid');
	await expect(
		page.getByText(
			'入力値が正しくありません。この変更は保存されていません。',
			{ exact: true }
		)
	).toBeVisible();
	const catalog = await page.evaluate(() => ({
		title: window.wp.i18n._x(
			'Table Row',
			'block title',
			'modular-table-blocks'
		),
		description: window.wp.i18n._x(
			'A table with independently editable rows and cells.',
			'block description',
			'modular-table-blocks'
		),
		source: window.wp.data.select('core/editor').getEditedPostContent(),
	}));
	expect(catalog.title).toBe('テーブル行');
	expect(catalog.description).toBe(
		'行とセルをそれぞれ独立して編集できるテーブルです。'
	);
	expect(catalog.source).toContain('wp:modular-table-blocks/table');
	expect(catalog.source).not.toContain('テーブル設定');
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.goto('/wp-admin/post-new.php?mtb_test_locale=en_US');
	await page.waitForFunction(
		() => !!window.wp?.blocks?.getBlockType('modular-table-blocks/table')
	);
	expect(
		await page.evaluate(
			() =>
				window.wp.blocks.getBlockType('modular-table-blocks/table')
					?.title
		)
	).toBe('Modular Table');
});

test('semantic editor prototype exposes invalid section appender markup', async ({
	page,
}) => {
	await page.evaluate(() => {
		const { registerBlockType, createBlock } = window.wp.blocks;
		const { createElement: el } = window.wp.element;
		const { useBlockProps, useInnerBlocksProps } = window.wp.blockEditor;
		registerBlockType('modular-table-blocks/probe-table', {
			apiVersion: 3,
			title: 'MTB semantic probe',
			category: 'design',
			attributes: {},
			edit: function ProbeTableEdit() {
				const props = useBlockProps();
				const inner = useInnerBlocksProps(
					{},
					{ allowedBlocks: ['modular-table-blocks/probe-row'] }
				);
				return el(
					'table',
					props,
					el('tbody', { ...inner, 'data-mtb-probe': 'section' })
				);
			},
			save: () => null,
		});
		registerBlockType('modular-table-blocks/probe-row', {
			apiVersion: 3,
			title: 'MTB probe row',
			category: 'design',
			attributes: {},
			edit: function ProbeRowEdit() {
				return el(
					'tr',
					useInnerBlocksProps(useBlockProps(), {
						allowedBlocks: ['modular-table-blocks/probe-cell'],
					})
				);
			},
			save: () => null,
		});
		registerBlockType('modular-table-blocks/probe-cell', {
			apiVersion: 3,
			title: 'MTB probe cell',
			category: 'design',
			attributes: {},
			edit: function ProbeCellEdit() {
				return el('td', useBlockProps(), 'Probe');
			},
			save: () => null,
		});
		const row = createBlock('modular-table-blocks/probe-row', {}, [
			createBlock('modular-table-blocks/probe-cell'),
			createBlock('modular-table-blocks/probe-cell'),
		]);
		const table = createBlock('modular-table-blocks/probe-table', {}, [
			row,
			createBlock('modular-table-blocks/probe-row', {}, [
				createBlock('modular-table-blocks/probe-cell'),
				createBlock('modular-table-blocks/probe-cell'),
			]),
		]);
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.clientId);
	});
	const canvas = page.frameLocator('iframe[name="editor-canvas"]');
	const section = canvas.locator('[data-mtb-probe="section"]');
	await expect(section).toBeVisible();
	const markup = await section.evaluate((node) => node.outerHTML);
	await test.info().attach('semantic-editor-dom.html', {
		body: markup,
		contentType: 'text/html',
	});
	// Default Gutenberg appender is a div, which cannot be a child of tbody/tr.
	await expect(section.locator(':scope > :not(tr)')).not.toHaveCount(0);
});
