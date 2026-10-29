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
		await page.evaluate((index) => {
			const table = window.wp.data
				.select('core/block-editor')
				.getBlocks()
				.find((block) => block.name === 'modular-table-blocks/table')!;
			window.wp.data
				.dispatch('core/block-editor')
				.selectBlock(
					table.innerBlocks.filter(
						(candidate) =>
							candidate.attributes.row === Math.floor(index / 2)
					)[index % 2].clientId
				);
		}, i);
		await cells
			.nth(i)
			.getByRole('textbox', { name: 'Cell text', exact: true })
			.fill(`Cell ${i + 1}`);
	}
	await cells
		.first()
		.getByRole('textbox', { name: 'Cell text', exact: true })
		.press('ControlOrMeta+ArrowRight');
	await page.keyboard.type(' keyboard');
	await expect(
		cells.first().getByRole('textbox', { name: 'Cell text', exact: true })
	).toHaveText('Cell 1 keyboard');
	const hierarchy = await cells.first().evaluate((node) => ({
		cell: node.tagName,
		container: node.parentElement?.tagName,
		containerClass: node.parentElement?.className,
	}));
	expect(hierarchy).toMatchObject({ cell: 'DIV', container: 'DIV' });
	expect(hierarchy.containerClass).toContain(
		'modular-table-blocks-editor__cells'
	);
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
				table.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 0
				)[0].clientId,
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
	await expect(
		cells.first().getByRole('textbox', { name: 'Cell text', exact: true })
	).toHaveText('Cell 1 keyboard');
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
			rowBlockRegistered: Boolean(
				window.wp.blocks.getBlockType('modular-table-blocks/row')
			),
			rowCount: blocks[0].attributes.rowCount,
			cells: blocks[0].innerBlocks.map((cell) => ({
				name: cell.name,
				row: cell.attributes.row,
				column: cell.attributes.column,
			})),
		};
	});
	expect(result.valid).toBe(true);
	expect(result.rowBlockRegistered).toBe(false);
	expect(result.rowCount).toBe(2);
	expect(result.cells).toEqual(
		Array.from({ length: 4 }, (_, i) => ({
			name: 'modular-table-blocks/cell',
			row: Math.floor(i / 2),
			column: i % 2,
		}))
	);
	const grid = canvas.locator('.modular-table-blocks-editor__cells--grid');
	await expect(grid).toHaveCount(1);
	await expect(
		grid.locator(':scope > .modular-table-blocks-editor__cell')
	).toHaveCount(4);
	await test.info().attach('flat-editor-dom.html', {
		body: await grid.evaluate((node) => node.outerHTML),
		contentType: 'text/html',
	});
	expect(result.serialized).toBe(result.source);
	expect(result.source).not.toContain('wp:modular-table-blocks/row');
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
	).toHaveCount(0);
	await expect(table.locator('div')).toHaveCount(0);
	expect(errors).toEqual([]);
});
test('CSS tokens inherit through site/table/cell in editor and public output', async ({
	page,
}) => {
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const makeCell = (text: string, styleTokens = {}) =>
			createBlock('modular-table-blocks/cell', { styleTokens }, [
				createBlock('core/paragraph', { content: text }),
			]);
		const first = window.mtbCreateTable(
			{ columns: [{}, {}], styleTokens: { borderColor: '#123456' } },
			[
				[
					makeCell('A', {
						textColor: '#ff0000',
						cellBackgroundColor: '#ffff00',
					}),
					makeCell('B', { cellPaddingInline: '24px' }),
				],
				[makeCell('C'), makeCell('D')],
			]
		);
		const second = window.mtbCreateTable({ columns: [{}] }, [
			[makeCell('E')],
		]);
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
		for (const side of ['t', 'r', 'b', 'l']) {
			body.style.setProperty(
				`--mtb-cell-border-${side}-color`,
				'#00ff00'
			);
		}
		body.style.setProperty('--mtb-cell-pr', '18px');
		body.style.setProperty('--mtb-cell-pl', '18px');
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
			':root { --mtb-cell-border-t-color: #00ff00; --mtb-cell-border-r-color: #00ff00; --mtb-cell-border-b-color: #00ff00; --mtb-cell-border-l-color: #00ff00; --mtb-cell-pr: 18px; --mtb-cell-pl: 18px; --mtb-text-color: #0000ff; }',
	});
	const publicCells = page.locator('.wp-block-modular-table-blocks-cell');
	await expect(
		page.locator('table.wp-block-modular-table-blocks-table')
	).toHaveCount(2);
	await checkCells(publicCells);
	await expect(publicCells.nth(2)).not.toHaveAttribute('style');
	await page.addStyleTag({
		content:
			':root { --mtb-cell-border-t-color: #ff00ff; --mtb-cell-border-r-color: #ff00ff; --mtb-cell-border-b-color: #ff00ff; --mtb-cell-border-l-color: #ff00ff; --mtb-cell-pr: 20px; --mtb-cell-pl: 20px; }',
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
		page.locator('table.wp-block-modular-table-blocks-table tr').first()
	).toHaveCSS('display', 'table-row');
});
test('style inspector selects presets, saves and clears explicit values', async ({
	page,
}) => {
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const cell = createBlock('modular-table-blocks/cell', {}, [
			createBlock('core/paragraph', { content: 'Inspector check' }),
		]);
		window.wp.data
			.dispatch('core/block-editor')
			.resetBlocks([window.mtbCreateTable({ columns: [{}] }, [[cell]])]);
		window.wp.data.dispatch('core/block-editor').selectBlock(cell.clientId);
	});
	const open = async () => {
		await page.getByRole('tab', { name: 'Styles', exact: true }).click();
		const panel = page.getByRole('button', {
			name: 'Background',
			exact: true,
		});
		if ((await panel.getAttribute('aria-expanded')) !== 'true') {
			await panel.click();
		}
		await page
			.getByRole('button', { name: 'Cell background', exact: true })
			.click();
	};
	await open();
	const tokens = () =>
		page.evaluate(
			() =>
				window.wp.data
					.select('core/block-editor')
					.getBlocks()[0]
					.innerBlocks.filter(
						(candidate) => candidate.attributes.row === 0
					)[0].attributes.styleTokens
		);
	expect(await tokens()).toBeUndefined();
	await page.getByRole('option', { name: /^(?:Color: )?Contrast$/ }).click();
	await page.keyboard.press('Escape');
	expect(await tokens()).toEqual({
		cellBackgroundColor: 'var(--wp--preset--color--contrast)',
	});
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	const canvas = page.frameLocator('iframe[name="editor-canvas"]');
	await expect(
		canvas.locator('.modular-table-blocks-editor__cell')
	).toHaveAttribute(
		'style',
		/--mtb-cell-bg: var\(--wp--preset--color--contrast\)/
	);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/block-editor').selectBlock(
			window.wp.data
				.select('core/block-editor')
				.getBlocks()[0]
				.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 0
				)[0].clientId
		)
	);
	await open();
	await expect(
		page.getByRole('button', {
			name: 'Reset Cell background to inherit',
			exact: true,
		})
	).toHaveCount(0);
	await page.getByRole('button', { name: 'Clear', exact: true }).click();
	expect(await tokens()).toEqual({});
	await expect
		.poll(() =>
			canvas
				.locator('.modular-table-blocks-editor__cell')
				.evaluate((node) =>
					(node as HTMLElement).style.getPropertyValue(
						'--mtb-cell-bg'
					)
				)
		)
		.toBe('');
});
test('Japanese catalogs translate metadata and style controls without changing saved content', async ({
	page,
}) => {
	await page.goto('/wp-admin/post-new.php?mtb_test_locale=ja');
	await page.waitForFunction(
		() => !!window.wp?.blocks?.getBlockType('modular-table-blocks/table')
	);
	const titles = await page.evaluate(() =>
		['table', 'cell', 'cell-text'].map(
			(name) =>
				window.wp.blocks.getBlockType(`modular-table-blocks/${name}`)
					?.title
		)
	);
	expect(titles).toEqual([
		'モジュラーテーブル',
		'テーブルセル',
		'セルテキスト',
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
		.getByRole('tab', { name: /^(Settings|設定)$/, exact: true })
		.click();
	await expect(
		page.getByRole('button', { name: 'セルのスタイル', exact: true })
	).toHaveCount(0);
	await expect(
		page.locator('.modular-table-blocks-padding-control')
	).toHaveCount(0);
	await expect(
		page.locator('.modular-table-blocks-border-control')
	).toHaveCount(0);
	await expect(
		page.getByRole('button', { name: 'セルの背景色', exact: true })
	).toHaveCount(0);
	await expect(
		page.getByRole('checkbox', { name: 'キャプションを表示', exact: true })
	).toBeVisible();
	const catalog = await page.evaluate(() => ({
		title: window.wp.i18n._x(
			'Table Cell',
			'block title',
			'modular-table-blocks'
		),
		description: window.wp.i18n._x(
			'A table with independently editable cells.',
			'block description',
			'modular-table-blocks'
		),
		source: window.wp.data.select('core/editor').getEditedPostContent(),
	}));
	expect(catalog.title).toBe('テーブルセル');
	expect(catalog.description).toBe(
		'セルをそれぞれ独立して編集できるテーブルです。'
	);
	expect(catalog.source).toContain('wp:modular-table-blocks/table');
	expect(catalog.source).not.toContain('テーブル設定');
	await page
		.getByRole('button', { name: 'セルの一括設定', exact: true })
		.click();
	const bulk = page.getByRole('dialog', {
		name: 'セルの一括設定',
		exact: true,
	});
	await expect(bulk).not.toContainText(
		'閉じると未適用の変更は破棄されます。'
	);
	await expect(bulk.getByRole('status')).toHaveText('0個のセルを選択中');
	await expect(
		bulk.getByRole('button', { name: '0個のセルに適用', exact: true })
	).toBeDisabled();
	await bulk.getByRole('button', { name: '全セル', exact: true }).click();
	await expect(bulk.getByRole('status')).toHaveText('4個のセルを選択中');
	await expect(bulk.locator('details')).toHaveCount(0);
	await expect(
		bulk.getByRole('region', { name: 'セルの選択', exact: true })
	).toBeVisible();
	await expect(
		bulk.getByText('閉じると未適用の変更は破棄されます。', { exact: true })
	).toHaveCount(0);
	for (const name of ['全選択', '選択解除', 'リセット', '変更しない']) {
		await expect(
			bulk.getByRole('button', { name, exact: true })
		).toHaveCount(0);
	}
	await expect(
		bulk.locator('.modular-table-blocks-bulk-settings-column')
	).toHaveCSS('width', '240px');
	await expect(
		bulk.getByRole('heading', { name: 'タイポグラフィ', exact: true })
	).toBeVisible();
	await expect
		.poll(() =>
			bulk
				.locator('.modular-table-blocks-bulk-card')
				.evaluateAll((nodes) =>
					nodes.every(
						(node) => node.scrollWidth <= node.clientWidth + 1
					)
				)
		)
		.toBe(true);
	await bulk.screenshot({
		path: test.info().outputPath('japanese-bulk-settings.png'),
		animations: 'disabled',
	});
	const cellTypes = bulk.getByRole('radiogroup', {
		name: 'セルの種類',
		exact: true,
	});
	await expect(
		cellTypes.getByRole('radio', { name: 'データセル（TD）', exact: true })
	).toBeChecked();
	await expect(
		cellTypes.getByRole('radio', { name: '見出しセル（TH）', exact: true })
	).toBeVisible();
	await expect(
		bulk.locator('.modular-table-blocks-bulk-preview-type')
	).toHaveText(['TD', 'TD', 'TD', 'TD']);

	await bulk.getByRole('button', { name: '全セル', exact: true }).click();
	await expect(bulk.getByRole('status')).toHaveText('0個のセルを選択中');
	await bulk.press('Escape');
	await page
		.getByRole('tab', { name: /^(Styles|スタイル)$/, exact: true })
		.click();
	await expect(
		page.getByRole('group', { name: 'セル背景のルール', exact: true })
	).toBeVisible();
	await expect(
		page.getByRole('button', { name: '見出し背景色（TH）', exact: true })
	).toBeVisible();
	const headerColor = page.getByRole('button', {
		name: '見出し背景色（TH）',
		exact: true,
	});
	await expect(headerColor.locator('.component-color-indicator')).toHaveCSS(
		'background-image',
		/linear-gradient/
	);
	await headerColor.click();
	await expect(
		page.getByRole('button', { name: '透明', exact: true })
	).toHaveCount(0);
	await expect(
		page.getByRole('button', { name: '現在の文字色', exact: true })
	).toHaveCount(0);
	await page.keyboard.press('Escape');
	const stripes = page.getByRole('radiogroup', {
		name: 'データセルのストライプ（TD）',
		exact: true,
	});
	await expect(
		stripes.getByRole('radio', { name: 'なし', exact: true })
	).toBeChecked();
	await expect(
		stripes.getByRole('radio', { name: '行', exact: true })
	).toBeVisible();
	await expect(
		stripes.getByRole('radio', { name: '列', exact: true })
	).toBeVisible();
	await page.screenshot({
		path: test.info().outputPath('japanese-background-rules.png'),
		animations: 'disabled',
	});
	expect(
		await page.evaluate(() =>
			window.wp.data.select('core/editor').getEditedPostContent()
		)
	).toBe(catalog.source);
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
