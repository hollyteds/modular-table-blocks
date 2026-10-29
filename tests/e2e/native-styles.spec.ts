import { test, expect } from '@playwright/test';
import { openEditor } from './login';
import type { Page } from '@playwright/test';
const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
	const errors: string[] = [];
	runtimeErrors.set(page, errors);
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
});
test.afterEach(async ({ page }) => {
	expect(runtimeErrors.get(page)).toEqual([]);
});
async function fixture(page: Page) {
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const cell = (text: string, attributes = {}) =>
			createBlock('modular-table-blocks/cell', attributes, [
				createBlock('core/paragraph', { content: text }),
			]);
		const table = window.mtbCreateTable(
			{
				columns: [{}, {}],
				style: {
					typography: { fontSize: '150%', lineHeight: '1.5' },
					color: { text: '#123456' },
				},
				styleTokens: {
					cellPaddingBlock: '11px',
					cellPaddingInline: '13px',
					borderWidth: '2px',
					borderColor: '#112233',
					borderStyle: 'solid',
				},
			},
			[
				[
					cell('First', {
						styleTokens: {
							cellPaddingBlock: '12px',
							cellPaddingInline: '24px',
						},
					}),
					cell('Second'),
				],
				[cell('Third'), cell('Fourth')],
			]
		);
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(
				table.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 0
				)[0].clientId
			);
	});
	// Sidebar visibility is persisted by WordPress, including after mobile tests.
	if (!(await page.locator('.block-editor-block-inspector').isVisible())) {
		await page
			.getByRole('button', { name: 'Settings', exact: true })
			.click();
	}
	await expect(page.locator('.block-editor-block-inspector')).toBeVisible();
	const blockTab = page.getByRole('tab', { name: 'Block', exact: true });
	if (await blockTab.isVisible()) {
		await blockTab.click();
	}
}
const tokens = (page: Page) =>
	page.evaluate(
		() =>
			window.wp.data
				.select('core/block-editor')
				.getBlocks()[0]
				.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 0
				)[0].attributes.styleTokens as Record<string, string>
	);
async function unsetStyles(page: Page) {
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		const editor = window.wp.data.dispatch('core/block-editor');
		for (const block of [table, ...table.innerBlocks]) {
			editor.updateBlockAttributes(block.clientId, {
				styleTokens: undefined,
				style: undefined,
			});
		}
	});
}
test('header row replaces cell attributes and cell type uses ToggleGroupControl with atomic undo', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page);
	const settings = page.getByRole('tab', { name: 'Settings', exact: true });
	if (await settings.isVisible()) {
		await settings.click();
	}
	await expect(
		page.getByRole('combobox', { name: 'Cell type', exact: true })
	).toHaveCount(0);
	const headerCell = page.getByRole('radio', {
		name: 'Header cell (TH)',
		exact: true,
	});
	await headerCell.focus();
	await headerCell.press('Space');
	await expect(headerCell).toBeChecked();
	await page
		.getByLabel('Header association', { exact: true })
		.selectOption('row');
	await expect(headerCell).toBeChecked();
	await page
		.getByRole('radio', { name: 'Data cell (TD)', exact: true })
		.click();
	await expect(
		page.getByRole('radio', { name: 'Data cell (TD)', exact: true })
	).toBeChecked();
	await headerCell.click();
	const source = () =>
		page.evaluate(
			() => window.wp.data.select('core/block-editor').getBlocks()[0]
		);
	const before = await source();
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.clientId);
	});
	const toggle = page.getByLabel('Use first row as headers (TH)', {
		exact: true,
	});
	await toggle.check();
	let snapshot = await source();
	for (const cell of snapshot.innerBlocks.filter(
		(candidate) => candidate.attributes.row === 0
	)) {
		expect(cell.attributes).toMatchObject({ tag: 'th', scope: 'col' });
	}
	expect(snapshot.innerBlocks.filter((c) => c.attributes.row === 1)).toEqual(
		before.innerBlocks.filter((c) => c.attributes.row === 1)
	);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await expect.poll(source).toEqual(before);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').redo());
	await expect
		.poll(async () => (await source()).attributes.headerRows)
		.toBe(1);
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(
				table.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 0
				)[0].clientId
			);
	});
	await expect(headerCell).toBeDisabled();
	await expect(
		page.getByRole('radio', { name: 'Data cell (TD)', exact: true })
	).toBeDisabled();
	await expect(
		page.getByLabel('Header association', { exact: true })
	).toHaveValue('col');
	await expect(
		page.getByText('Managed by the table header row (TH).', { exact: true })
	).toBeVisible();
	// Table headers take precedence over conflicting local cell attributes.
	await page.evaluate(() => {
		const cell = window.wp.data
			.select('core/block-editor')
			.getBlocks()[0]
			.innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(cell.clientId, { tag: 'td', scope: 'row' });
	});
	await expect(headerCell).toBeChecked();
	await expect(
		page.getByLabel('Header association', { exact: true })
	).toHaveValue('col');
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	const canvas = page.frameLocator('iframe[name="editor-canvas"]');
	await expect(
		canvas.locator('.modular-table-blocks-editor__cell--header')
	).toHaveCount(2);
	const postId = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${postId}`);
	await expect(
		page.locator(
			'table.wp-block-modular-table-blocks-table thead th[scope="col"]'
		)
	).toHaveCount(2);
	await page.goto(`/wp-admin/post.php?post=${postId}&action=edit`);
	await expect(
		canvas.locator('.modular-table-blocks-editor__cell')
	).toHaveCount(4);
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.clientId);
	});
	const settingsAfter = page.getByRole('tab', {
		name: 'Settings',
		exact: true,
	});
	if (await settingsAfter.isVisible()) {
		await settingsAfter.click();
	}
	await toggle.uncheck();
	snapshot = await source();
	for (const cell of snapshot.innerBlocks.filter(
		(candidate) => candidate.attributes.row === 0
	)) {
		expect(cell.attributes).toMatchObject({ tag: 'td', scope: '' });
	}
	expect(
		snapshot.innerBlocks
			.filter((candidate) => candidate.attributes.row === 0)[0]
			.innerBlocks.map((block) => ({
				name: block.name,
				attributes: block.attributes,
			}))
	).toEqual(
		before.innerBlocks
			.filter((candidate) => candidate.attributes.row === 0)[0]
			.innerBlocks.map((block) => ({
				name: block.name,
				attributes: block.attributes,
			}))
	);
	expect(
		snapshot.innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0].attributes.styleTokens
	).toEqual(
		before.innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0].attributes.styleTokens
	);
});
test('cell background trigger matches native color dimensions and keeps palette clearing', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page);
	await page.evaluate(() => {
		const cell = window.wp.data
			.select('core/block-editor')
			.getBlocks()[0]
			.innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(cell.clientId, {
				style: { color: { text: '#123456' } },
				styleTokens: { cellBackgroundColor: '#a1b2c3' },
			});
	});
	await page.getByRole('tab', { name: 'Styles', exact: true }).click();
	const native = page
		.locator(
			'.block-editor-block-inspector button.block-editor-panel-color-gradient-settings__dropdown:visible'
		)
		.first();
	await expect(native).toBeVisible();
	const measure = (node: Element) => {
		const indicator = node.querySelector('.component-color-indicator')!;
		const box = node.getBoundingClientRect();
		const dot = indicator.getBoundingClientRect();
		const style = getComputedStyle(node);
		return {
			height: box.height,
			width: box.width,
			dot: dot.width,
			lineHeight: style.lineHeight,
			padding: style.padding,
			minHeight: style.minHeight,
			border: style.border,
			fontSize: style.fontSize,
			children: Array.from(
				node.querySelectorAll(
					'.component-color-indicator, .block-editor-panel-color-gradient-settings__color-name'
				)
			).map((child) => ({
				height: child.getBoundingClientRect().height,
				margin: getComputedStyle(child).margin,
				lineHeight: getComputedStyle(child).lineHeight,
				fontSize: getComputedStyle(child).fontSize,
			})),
		};
	};
	const expected = await native.evaluate(measure);
	await page.getByRole('tab', { name: 'Styles', exact: true }).click();
	await page.getByRole('button', { name: 'Background', exact: true }).click();
	const trigger = page.getByRole('button', {
		name: 'Cell background',
		exact: true,
	});
	const group = page
		.getByRole('tabpanel', { name: 'Styles', exact: true })
		.getByRole('group', { name: 'Cell background', exact: true });
	await expect(group).not.toContainText('#a1b2c3');
	await expect(group.locator('p')).toHaveCount(0);
	const actual = await trigger.evaluate(measure);
	expect(
		Math.abs(actual.height - expected.height),
		JSON.stringify({ actual, expected })
	).toBeLessThanOrEqual(1);
	expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(2);
	expect(actual.dot).toBe(expected.dot);
	await trigger.click();
	await page.getByRole('option', { name: /^(?:Color: )?Contrast$/ }).click();
	await expect(group).not.toContainText('var(--wp--preset--color--contrast)');
	await page.getByRole('button', { name: 'Clear', exact: true }).click();
	await page.keyboard.press('Escape');
	expect(await tokens(page)).not.toHaveProperty('cellBackgroundColor');
	await page.screenshot({
		path: test.info().outputPath('standard-cell-color-size.png'),
		fullPage: true,
	});
});
test('cell native typography uses standard controls and survives preview save reload and public rendering', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page);
	const selected = await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		const cell = table.innerBlocks[0];
		const features = window.wp.data
			.select('core/block-editor')
			.getSettings().__experimentalFeatures as {
			typography: {
				fontFamilies: { theme: { slug: string; fontFamily: string }[] };
			};
		};
		const font = features.typography.fontFamilies.theme.slice(-1)[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(cell.clientId, {
				fontFamily: font.slug,
				style: {
					typography: {
						fontWeight: '600',
						fontStyle: 'italic',
						letterSpacing: '2px',
						textDecoration: 'underline',
						textTransform: 'uppercase',
						lineHeight: '1.8',
						fontSize: '12px',
					},
				},
			});
		return { table: table.clientId, cell: cell.clientId, font };
	});
	await page.getByRole('tab', { name: 'Styles', exact: true }).click();
	const canvas = page.frameLocator('iframe[name="editor-canvas"]');
	const cell = canvas.locator('.modular-table-blocks-editor__cell').first();
	const family = await cell.evaluate(
		(node) => getComputedStyle(node).fontFamily
	);
	expect(family).toContain(
		selected.font.fontFamily.split(',')[0].replace(/["']/g, '').trim()
	);
	await expect(cell).toHaveCSS('font-weight', '600');
	await expect(cell).toHaveCSS('font-style', 'italic');
	await expect(cell).toHaveCSS('text-transform', 'uppercase');
	await expect(cell).toHaveCSS('text-decoration-line', 'underline');
	await expect(cell).toHaveCSS('font-size', '12px');
	const spacing = page.getByRole('spinbutton', {
		name: 'Letter spacing',
		exact: true,
	});
	await expect(spacing).toBeVisible();
	await spacing.fill('3');
	await spacing.press('Tab');
	await expect(cell).toHaveCSS('letter-spacing', '3px');
	await expect(
		page.getByRole('button', { name: 'Background', exact: true })
	).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Cell styles', exact: true })
	).toHaveCount(0);
	const source = await page.evaluate(() =>
		window.wp.data.select('core/editor').getEditedPostContent()
	);
	await page.getByRole('button', { name: 'Background', exact: true }).click();
	expect(
		await page.evaluate(() =>
			window.wp.data.select('core/editor').getEditedPostContent()
		)
	).toBe(source);
	await page.screenshot({
		path: test.info().outputPath('cell-typography-and-background.png'),
		fullPage: true,
	});
	await page.evaluate(
		(id) => window.wp.data.dispatch('core/block-editor').selectBlock(id),
		selected.table
	);
	await page.getByRole('tab', { name: 'Settings', exact: true }).click();
	await page
		.getByRole('button', { name: 'Bulk edit cells', exact: true })
		.click();
	const previewCell = page
		.locator('.modular-table-blocks-bulk-preview-cell')
		.first();
	await expect(previewCell).toHaveCSS('font-family', family);
	await expect(previewCell).toHaveCSS('font-style', 'italic');
	await expect(previewCell).toHaveCSS('font-weight', '600');
	await expect(previewCell).toHaveCSS('letter-spacing', '3px');
	await expect(previewCell).toHaveCSS('text-transform', 'uppercase');
	await expect(previewCell).toHaveCSS('text-decoration-line', 'underline');
	await page.getByRole('dialog').press('Escape');
	// Orientation is also a native typography setting, including on WP 6.6.
	await page.evaluate((id) => {
		const block = window.wp.data
			.select('core/block-editor')
			.getBlocks()[0]
			.innerBlocks.find((item) => item.clientId === id)!;
		const style = block.attributes.style as {
			typography: Record<string, unknown>;
		};
		window.wp.data.dispatch('core/block-editor').updateBlockAttributes(id, {
			style: {
				...style,
				typography: {
					...style.typography,
					writingMode: 'vertical-rl',
				},
			},
		});
	}, selected.cell);
	await expect(cell).toHaveCSS('writing-mode', 'vertical-rl');
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	await expect(cell).toHaveCSS('font-family', family);
	await expect(cell).toHaveCSS('writing-mode', 'vertical-rl');
	await expect(cell).toHaveCSS('letter-spacing', '3px');
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${id}`);
	const publicCell = page
		.locator('table.wp-block-modular-table-blocks-table td')
		.first();
	for (const [property, value] of Object.entries({
		'font-family': family,
		'font-style': 'italic',
		'font-weight': '600',
		'font-size': '12px',
		'letter-spacing': '3px',
		'text-transform': 'uppercase',
		'text-decoration-line': 'underline',
		'writing-mode': 'vertical-rl',
	})) {
		await expect(publicCell).toHaveCSS(property, value);
	}
	await expect(
		page.locator('table.wp-block-modular-table-blocks-table td').nth(1)
	).toHaveCSS(
		'letter-spacing',
		await page
			.locator('table.wp-block-modular-table-blocks-table')
			.evaluate((node) => getComputedStyle(node).letterSpacing)
	);
	await expect(publicCell).toContainText('First');
});
test('cell alignment matrix deselects with pointer and keyboard and preserves saved alignment', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page);
	const beforeTabs = await page.evaluate(() =>
		window.wp.data.select('core/editor').getEditedPostContent()
	);
	await page.getByRole('tab', { name: 'Settings', exact: true }).click();
	await expect(
		page.locator('.modular-table-blocks-alignment-matrix')
	).toHaveCount(0);
	await expect(
		page.getByRole('button', { name: 'Background', exact: true })
	).toHaveCount(0);
	await page.getByRole('tab', { name: 'Styles', exact: true }).click();
	expect(
		await page.evaluate(() =>
			window.wp.data.select('core/editor').getEditedPostContent()
		)
	).toBe(beforeTabs);
	const matrix = page.locator('.modular-table-blocks-alignment-matrix');
	const choices = matrix.getByRole('gridcell');
	await expect(choices).toHaveCount(9);
	await expect(matrix).toHaveClass(/--empty/);
	const before = await tokens(page);
	const center = choices.nth(4);
	await center.focus();
	await expect(matrix).toHaveClass(/--empty/);
	await center.press('Enter');
	const cell = page
		.frameLocator('iframe[name="editor-canvas"]')
		.locator('.modular-table-blocks-editor__cell')
		.first();
	await expect(cell).toHaveCSS('align-content', 'center');
	await expect(cell).toHaveCSS('text-align', 'center');
	await expect(matrix).not.toHaveClass(/--empty/);
	await center.click();
	await expect(matrix).toHaveClass(/--empty/);
	await expect
		.poll(() =>
			choices
				.locator('[role="presentation"]')
				.evaluateAll((nodes) =>
					Math.max(
						...nodes.map(
							(node) => node.getBoundingClientRect().width
						)
					)
				)
		)
		.toBe(6);
	await expect(cell).toHaveCSS('align-content', 'start');
	await center.press('Space');
	await expect(cell).toHaveCSS('align-content', 'center');
	await center.press('Enter');
	await expect(matrix).toHaveClass(/--empty/);
	await center.press('ArrowRight');
	await expect(cell).toHaveCSS('text-align', 'right');
	await expect(cell).toHaveCSS('align-content', 'center');
	await page.keyboard.press('Escape');
	await choices.nth(8).click();
	await expect(cell).toHaveCSS('align-content', 'end');
	await expect(cell).toHaveCSS('text-align', 'right');
	expect(await tokens(page)).toEqual(before);
	await expect(choices.nth(8).locator('[role="presentation"]')).toHaveCSS(
		'color',
		'rgb(30, 30, 30)'
	);
	await page.screenshot({
		path: test.info().outputPath('alignment-matrix.png'),
		fullPage: true,
	});
	// Toolbar removal must leave native attributes and their rendering intact.
	for (const level of ['table', 'cell']) {
		await page.evaluate((kind) => {
			const table = window.wp.data
				.select('core/block-editor')
				.getBlocks()[0];
			const blocks = {
				table,

				cell: table.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 0
				)[0],
			};
			const block = blocks[kind as keyof typeof blocks];
			window.wp.data
				.dispatch('core/block-editor')
				.selectBlock(block.clientId);
		}, level);
		await expect(
			page.getByRole('button', { name: 'Align text', exact: true })
		).toHaveCount(0);
	}
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	await expect(cell).toHaveCSS('align-content', 'end');
	await expect(cell).toHaveCSS('text-align', 'right');
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${id}`);
	const published = page
		.locator('table.wp-block-modular-table-blocks-table td')
		.first();
	await expect(published).toHaveCSS('vertical-align', 'bottom');
	await expect(published).toHaveCSS('text-align', 'right');
});
test('unset colors use the standard slash and saved color keywords still clear to inherit', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page);
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(table.clientId, {
				styleTokens: {
					...(table.attributes.styleTokens as Record<string, string>),
					cellBackgroundColor: '#cceeff',
				},
			});
	});
	const settings = page.getByRole('tab', { name: 'Styles', exact: true });
	if (await settings.isVisible()) {
		await settings.click();
	}
	await page.getByRole('button', { name: 'Background', exact: true }).click();
	const group = page.getByRole('group', {
		name: 'Cell background',
		exact: true,
	});
	await expect(
		group.getByRole('button', { name: /Reset .* to inherit/ })
	).toHaveCount(0);
	const cell = page
		.frameLocator('iframe[name="editor-canvas"]')
		.locator('.modular-table-blocks-editor__cell')
		.first();
	for (const value of ['transparent', 'currentColor', '#112233']) {
		await page.evaluate((color) => {
			const selectedCell = window.wp.data
				.select('core/block-editor')
				.getBlocks()[0].innerBlocks[0];
			window.wp.data
				.dispatch('core/block-editor')
				.updateBlockAttributes(selectedCell.clientId, {
					styleTokens: {
						...(selectedCell.attributes.styleTokens as Record<
							string,
							string
						>),
						cellBackgroundColor: color,
					},
				});
		}, value);
		expect((await tokens(page))?.cellBackgroundColor).toBe(value);
		await expect(group.locator('.component-color-indicator')).toHaveCSS(
			'background-image',
			'none'
		);
		if (value.startsWith('#')) {
			await expect(group.locator('.component-color-indicator')).toHaveCSS(
				'background-color',
				'rgb(17, 34, 51)'
			);
		}
		await group
			.getByRole('button', { name: 'Cell background', exact: true })
			.click();
		await expect(
			page.getByRole('button', { name: 'Transparent', exact: true })
		).toHaveCount(0);
		await expect(
			page.getByRole('button', {
				name: 'Current text color',
				exact: true,
			})
		).toHaveCount(0);
		await expect(
			page.getByRole('button', { name: 'Clear', exact: true })
		).toBeEnabled();
		await page.getByRole('button', { name: 'Clear', exact: true }).click();
		await page.keyboard.press('Escape');
		expect(await tokens(page)).not.toHaveProperty('cellBackgroundColor');
		await expect(cell).toHaveCSS('background-color', 'rgb(204, 238, 255)');
		await expect(group.locator('.component-color-indicator')).toHaveCSS(
			'background-image',
			/linear-gradient/
		);
	}
	await page.screenshot({
		path: test.info().outputPath('unset-color-slash.png'),
	});
});
test('solid is selected by default without persisting styles to unset cells', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page);
	await unsetStyles(page);
	await page.getByRole('tab', { name: 'Styles', exact: true }).click();
	const border = page.locator('.modular-table-blocks-border-control');
	const picker = border.getByRole('button', {
		name: 'Border color and style picker.',
		exact: true,
	});
	await picker.click();
	await expect(
		page.getByRole('button', { name: 'Solid', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await page.keyboard.press('Escape');
	expect(await tokens(page)).toBeUndefined();
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	const cell = page
		.frameLocator('iframe[name="editor-canvas"]')
		.locator('.modular-table-blocks-editor__cell')
		.first();
	await expect(cell).toHaveCSS('border-top-style', 'solid');
	expect(await tokens(page)).toBeUndefined();
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${id}`);
	const publicCells = page.locator(
		'table.wp-block-modular-table-blocks-table th, table.wp-block-modular-table-blocks-table td'
	);
	await expect(publicCells).toHaveCount(4);
	await expect(publicCells.first()).toHaveCSS('border-top-style', 'solid');
	await expect(
		page.locator(
			'table.wp-block-modular-table-blocks-table tr[style], table.wp-block-modular-table-blocks-table td[style], table.wp-block-modular-table-blocks-table th[style]'
		)
	).toHaveCount(0);
});
test('border width edits keep inherited styles sparse and solid can explicitly override dashed', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page);
	await unsetStyles(page);
	await page.getByRole('tab', { name: 'Styles', exact: true }).click();
	const border = page.locator('.modular-table-blocks-border-control');
	const width = border.getByRole('spinbutton', {
		name: 'Border width',
		exact: true,
	});
	await width.fill('3');
	await width.press('Tab');
	expect(await tokens(page)).toEqual({
		borderTopWidth: '3px',
		borderRightWidth: '3px',
		borderBottomWidth: '3px',
		borderLeftWidth: '3px',
	});
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(table.clientId, {
				styleTokens: { borderStyle: 'dashed' },
			});
	});
	const picker = border.getByRole('button', {
		name: 'Border color and style picker.',
		exact: true,
	});
	await picker.click();
	await expect(
		page.getByRole('button', { name: 'Dashed', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await page.keyboard.press('Escape');
	await width.fill('4');
	await width.press('Tab');
	expect(
		Object.keys((await tokens(page))!).filter((key) =>
			key.endsWith('Style')
		)
	).toEqual([]);
	const cell = page
		.frameLocator('iframe[name="editor-canvas"]')
		.locator('.modular-table-blocks-editor__cell')
		.first();
	await expect(cell).toHaveCSS('border-top-style', 'dashed');
	await picker.click();
	await page.getByRole('button', { name: 'Solid', exact: true }).click();
	await page.keyboard.press('Escape');
	await expect(cell).toHaveCSS('border-top-style', 'solid');
	expect(await tokens(page)).toMatchObject({
		borderTopStyle: 'solid',
		borderRightStyle: 'solid',
		borderBottomStyle: 'solid',
		borderLeftStyle: 'solid',
	});
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	await expect(cell).toHaveCSS('border-top-style', 'solid');
	expect(await tokens(page)).toMatchObject({ borderTopStyle: 'solid' });
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${id}`);
	await expect(
		page.locator('table.wp-block-modular-table-blocks-table td').first()
	).toHaveCSS('border-top-style', 'solid');
});
test('standard panels preserve directional values through undo, save and reload', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page);
	await page.getByRole('tab', { name: 'Styles', exact: true }).click();
	const padding = page.locator('.modular-table-blocks-padding-control');
	const border = page.locator('.modular-table-blocks-border-control');
	await expect(page.locator('.dimensions-block-support-panel')).toContainText(
		'Padding'
	);
	await expect(page.locator('.border-block-support-panel')).toContainText(
		'Border'
	);
	await expect(
		page
			.locator('.block-editor-block-inspector')
			.getByText('Shadow', { exact: true })
	).toHaveCount(0);
	const before = await tokens(page);
	const options = padding.getByRole('button', {
		name: 'Padding options',
		exact: true,
	});
	if (await options.count()) {
		for (const name of ['Custom', 'Horizontal & vertical', 'Custom']) {
			await options.click();
			await page
				.getByRole('menuitemradio', { name, exact: true })
				.click();
		}
	} else {
		await padding
			.getByRole('button', { name: 'Unlink sides', exact: true })
			.click();
		await padding
			.getByRole('button', { name: 'Link sides', exact: true })
			.click();
		await padding
			.getByRole('button', { name: 'Unlink sides', exact: true })
			.click();
	}
	expect(await tokens(page)).toEqual(before);
	const top = padding.getByRole('spinbutton').first();
	await top.fill('5');
	await top.press('Tab');
	expect(await tokens(page)).toMatchObject({
		cellPaddingTop: '5px',
		cellPaddingBottom: '12px',
		cellPaddingLeft: '24px',
		cellPaddingRight: '24px',
	});
	const cell = page
		.frameLocator('iframe[name="editor-canvas"]')
		.locator('.modular-table-blocks-editor__cell')
		.first();
	await expect(cell).toHaveCSS('padding-top', '5px');
	await expect(cell).toHaveCSS('padding-right', '24px');
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await top.fill('');
	await top.press('Tab');
	await expect(cell).toHaveCSS('padding-top', '11px');
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await expect(cell).toHaveCSS('padding-top', '5px');
	await page.evaluate(() => window.wp.data.dispatch('core/editor').redo());
	await expect(cell).toHaveCSS('padding-top', '11px');
	const borderBefore = await tokens(page);
	await border
		.getByRole('button', { name: 'Unlink sides', exact: true })
		.click();
	await border
		.getByRole('button', { name: 'Link sides', exact: true })
		.click();
	await border
		.getByRole('button', { name: 'Unlink sides', exact: true })
		.click();
	expect(await tokens(page)).toEqual(borderBefore);
	const left = border.getByRole('group', {
		name: 'Left border',
		exact: true,
	});
	await left
		.getByRole('spinbutton', { name: 'Border width', exact: true })
		.fill('0');
	await left
		.getByRole('spinbutton', { name: 'Border width', exact: true })
		.press('Tab');
	await expect(cell).toHaveCSS('border-left-width', '0px');
	const topBorder = border.getByRole('group', {
		name: 'Top border',
		exact: true,
	});
	await topBorder
		.getByRole('spinbutton', { name: 'Border width', exact: true })
		.fill('3');
	await topBorder
		.getByRole('spinbutton', { name: 'Border width', exact: true })
		.press('Tab');
	await topBorder
		.getByRole('button', {
			name: 'Border color and style picker.',
			exact: true,
		})
		.click();
	await page.getByRole('button', { name: 'Dashed', exact: true }).click();
	await page.keyboard.press('Escape');
	await expect(cell).toHaveCSS('border-top-style', 'dashed');
	await page.screenshot({
		path: test.info().outputPath('directional-controls.png'),
		fullPage: true,
	});
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	await expect(cell).toHaveCSS('padding-top', '11px');
	await expect(cell).toHaveCSS('padding-right', '24px');
	await expect(cell).toHaveCSS('border-left-width', '0px');
	await expect(cell).toHaveCSS('border-top-style', 'dashed');
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${id}`);
	const publicCell = page
		.locator('table.wp-block-modular-table-blocks-table td')
		.first();
	await expect(publicCell).toHaveCSS('padding-top', '11px');
	await expect(publicCell).toHaveCSS('padding-right', '24px');
	await expect(publicCell).toHaveCSS('border-left-width', '0px');
	await expect(publicCell).toHaveCSS('border-top-style', 'dashed');
});
test('native typography inherits once and legacy parsed attributes migrate without losing content', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page);
	const canvas = page.frameLocator('iframe[name="editor-canvas"]');
	const table = canvas.locator('.modular-table-blocks-editor').first();
	const cell = canvas.locator('.modular-table-blocks-editor__cell').first();
	const size = await table.evaluate(
		(node) => getComputedStyle(node).fontSize
	);
	await table.evaluate((node) => {
		node.ownerDocument.body.style.setProperty('--mtb-font-size', '2em');
		node.ownerDocument.body.style.setProperty(
			'--mtb-text-color',
			'#ff0000'
		);
	});
	await expect(cell).toHaveCSS('font-size', size);
	await expect(cell).toHaveCSS('color', 'rgb(18, 52, 86)');
	await page.evaluate(() => {
		const { createBlock, serialize, parse } = window.wp.blocks;
		const legacy = window.mtbCreateTable(
			{
				columns: [{}],
				styleTokens: {
					fontSize: '1.5em',
					lineHeight: 'normal',
					textColor: 'var(--wp--preset--color--contrast)',
				},
			},
			[
				[
					createBlock(
						'modular-table-blocks/cell',
						{ horizontalAlign: 'right' },
						[
							createBlock('core/paragraph', {
								content: 'Legacy content',
							}),
						]
					),
				],
			]
		);
		window.wp.data
			.dispatch('core/block-editor')
			.resetBlocks(parse(serialize([legacy])));
	});
	const attrs = await page.evaluate(() => {
		const block = window.wp.data.select('core/block-editor').getBlocks()[0];
		return {
			table: block.attributes,
			cell: block.innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[0].attributes,
		};
	});
	expect(attrs.table).toMatchObject({
		textColor: 'contrast',
		style: { typography: { fontSize: '1.5em', lineHeight: 'normal' } },
	});
	expect(attrs.table.styleTokens).not.toHaveProperty('fontSize');
	expect(attrs.cell.style).toMatchObject({
		typography: { textAlign: 'right' },
	});
	await expect(cell).toHaveCSS('text-align', 'right');
	await expect(cell).toHaveCSS(
		'font-size',
		await table.evaluate((node) => getComputedStyle(node).fontSize)
	);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	await expect(cell).toContainText('Legacy content');
	await expect(cell).toHaveCSS('text-align', 'right');
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${id}`);
	const publicTable = page.locator(
		'table.wp-block-modular-table-blocks-table'
	);
	const publicCell = publicTable.locator('td');
	await page.addStyleTag({
		content: ':root { --mtb-font-size: 2em; --mtb-text-color: #ff0000; }',
	});
	await expect(publicCell).toHaveCSS(
		'font-size',
		await publicTable.evaluate((node) => getComputedStyle(node).fontSize)
	);
	await expect(publicCell).toHaveCSS('text-align', 'right');
	await expect(publicCell).toContainText('Legacy content');
});
test('the standard typography inspector writes a custom cell size to native attributes', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page);
	await page.getByRole('tab', { name: 'Styles', exact: true }).click();
	const font = page.getByRole('group', { name: 'Font size', exact: true });
	if (!(await font.count())) {
		await page
			.getByRole('button', { name: 'Typography options', exact: true })
			.click();
		await page
			.getByRole('menuitemcheckbox', {
				name: /^(Show )?(Font size|Size)$/,
			})
			.click({ timeout: 5000 });
		await page.keyboard.press('Escape');
	}
	await page.getByRole('button', { name: /Set custom (size|value)/ }).click();
	const input = font.getByRole('spinbutton').first();
	await input.fill('32');
	await input.press('Tab');
	const attrs = await page.evaluate(
		() =>
			window.wp.data
				.select('core/block-editor')
				.getBlocks()[0]
				.innerBlocks.filter(
					(candidate) => candidate.attributes.row === 0
				)[0].attributes
	);
	expect(
		String(
			(
				attrs.style as {
					typography: {
						fontSize: string | number;
					};
				}
			).typography.fontSize
		)
	).toMatch(/^32(?:px)?$/);
	expect(attrs.styleTokens).not.toHaveProperty('fontSize');
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		const style = table.innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0].attributes.style as {
			typography: {
				fontSize: string | number;
			};
		};
		window.wp.data.dispatch('core/block-editor').insertBlocks([
			window.wp.blocks.createBlock('core/paragraph', {
				className: 'mtb-size-reference',
				content: 'Native size reference',
				style: {
					typography: { fontSize: style.typography.fontSize },
				},
			}),
		]);
	});
	const canvas = page.frameLocator('iframe[name="editor-canvas"]');
	const cell = canvas.locator('.modular-table-blocks-editor__cell').first();
	const reference = canvas.locator('.mtb-size-reference');
	await expect(cell).toHaveCSS(
		'font-size',
		await reference.evaluate((node) => getComputedStyle(node).fontSize)
	);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	await expect(cell).toHaveCSS(
		'font-size',
		await reference.evaluate((node) => getComputedStyle(node).fontSize)
	);
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${id}`);
	await expect(
		page.locator('table.wp-block-modular-table-blocks-table td').first()
	).toHaveCSS(
		'font-size',
		await page
			.locator('.mtb-size-reference')
			.evaluate((node) => getComputedStyle(node).fontSize)
	);
});
test('style components available in the supported WordPress editor', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	const exports = await page.evaluate(() => {
		const wp = window.wp as unknown as {
			components: Record<string, unknown>;
			blockEditor: Record<string, unknown>;
		};
		return Object.fromEntries(
			[
				'UnitControl',
				'__experimentalUnitControl',
				'BorderBoxControl',
				'__experimentalBorderBoxControl',
				'__experimentalSpacingSizesControl',
				'__experimentalToolsPanelItem',
				'ColorPaletteControl',
			].map((key) => [
				key,
				Boolean(wp.components[key] || wp.blockEditor[key]),
			])
		);
	});
	expect(exports.UnitControl || exports.__experimentalUnitControl).toBe(true);
	expect(
		exports.BorderBoxControl || exports.__experimentalBorderBoxControl
	).toBe(true);
	expect(exports.ColorPaletteControl).toBe(true);
	expect(exports.__experimentalSpacingSizesControl).toBe(true);
	expect(exports.__experimentalToolsPanelItem).toBe(true);
});
test('standard panel resets preserve later edits in the other panel', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await fixture(page);
	await page.getByRole('tab', { name: 'Styles', exact: true }).click();
	const border = page.locator('.modular-table-blocks-border-control');
	const width = border.getByRole('spinbutton', {
		name: 'Border width',
		exact: true,
	});
	await width.fill('3');
	await width.press('Tab');
	await border
		.getByRole('button', {
			name: 'Border color and style picker.',
			exact: true,
		})
		.click();
	await page.getByRole('option', { name: /^(?:Color: )?Contrast$/ }).click();
	await page.keyboard.press('Escape');
	expect(await tokens(page)).toMatchObject({
		borderTopWidth: '3px',
		borderTopColor: 'var(--wp--preset--color--contrast)',
	});
	await page.evaluate(() => {
		const cell = window.wp.data
			.select('core/block-editor')
			.getBlocks()[0]
			.innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(cell.clientId, {
				styleTokens: {
					...(cell.attributes.styleTokens as Record<string, string>),
					cellPaddingTop: '7px',
				},
			});
	});
	const beforeInvalid = await tokens(page);
	await width.fill('99');
	await width.press('Tab');
	await expect(border).toContainText('Unsupported value or unit.');
	expect(await tokens(page)).toEqual(beforeInvalid);
	await page
		.locator('.border-block-support-panel')
		.getByRole('button', { name: /^(?:Border|Borders) options$/ })
		.click();
	await page
		.getByRole('menuitem', { name: 'Reset all', exact: true })
		.click();
	const afterBorder = await tokens(page);
	await expect(border).not.toContainText('Unsupported value or unit.');
	expect(afterBorder).toMatchObject({
		cellPaddingTop: '7px',
		cellPaddingBlock: '12px',
		cellPaddingInline: '24px',
	});
	expect(
		Object.keys(afterBorder).some((key) => key.startsWith('border'))
	).toBe(false);
	// Edit the other panel after registration so a stale reset closure would lose this value.
	await width.fill('4');
	await width.press('Tab');
	await page
		.locator('.dimensions-block-support-panel')
		.getByRole('button', { name: 'Dimensions options', exact: true })
		.click();
	await page
		.getByRole('menuitem', { name: 'Reset all', exact: true })
		.click();
	const afterPadding = await tokens(page);
	expect(afterPadding).toMatchObject({
		borderTopWidth: '4px',
		borderLeftWidth: '4px',
	});
	expect(
		Object.keys(afterPadding).some((key) => key.startsWith('cellPadding'))
	).toBe(false);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	await page.waitForFunction(
		() =>
			window.wp.data.select('core/block-editor').getBlocks()[0]?.name ===
			'modular-table-blocks/table'
	);
	expect(await tokens(page)).toEqual(afterPadding);
});
for (const [scoped, showDefaults] of [
	[false, false],
	[true, false],
	[false, true],
	[true, true],
] as const) {
	test(`current ${scoped ? 'block-specific' : 'theme'} palette supplies grouped background and border colors with defaults ${showDefaults ? 'enabled' : 'disabled'}`, async ({
		page,
		context,
	}) => {
		await openEditor(page, context);
		// Update the owning editor settings so provider rerenders retain the fixture.
		await page.evaluate(
			({ blockScoped, includeDefaults }) => {
				const store = window.wp.data.select('core/block-editor');
				const settings = store.getSettings();
				const features = settings.__experimentalFeatures as {
					color?: Record<string, unknown>;
					blocks?: Record<
						string,
						{
							color?: Record<string, unknown>;
						}
					>;
				};
				const color = {
					...features.color,
					custom: false,
					defaultPalette: includeDefaults,
					palette: {
						theme: [
							{
								name: 'MTB Theme Accent',
								slug: 'mtb-theme-accent',
								color: 'rgb(12, 34, 56)',
							},
						],
						custom: [
							{
								name: 'MTB Site Accent',
								slug: 'mtb-site-accent',
								color: '#654321',
							},
						],
						default: [
							{
								name: 'MTB Default Color',
								slug: 'mtb-default',
								color: '#fff',
							},
						],
					},
				};
				window.wp.data.dispatch('core/editor').updateEditorSettings({
					colors: [
						{
							name: 'MTB Legacy Color',
							slug: 'mtb-legacy',
							color: '#ff0000',
						},
					],
					__experimentalFeatures: {
						...features,
						...(blockScoped
							? {
									blocks: {
										...features.blocks,
										'modular-table-blocks/cell': {
											...features.blocks?.[
												'modular-table-blocks/cell'
											],
											color,
										},
									},
								}
							: { color }),
					},
				});
			},
			{ blockScoped: scoped, includeDefaults: showDefaults }
		);
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(
							window.wp.data
								.select('core/block-editor')
								.getSettings().colors as { slug: string }[]
						)?.[0]?.slug
				)
			)
			.toBe('mtb-legacy');
		await fixture(page);
		await expect(
			page
				.frameLocator('iframe[name="editor-canvas"]')
				.locator('.modular-table-blocks-editor__cell')
				.first()
		).toBeVisible();
		const settings = page.getByRole('tab', {
			name: 'Styles',
			exact: true,
		});
		if (await settings.count()) {
			await settings.click();
		}
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
		await expect(
			page.getByRole('option', { name: /^(?:Color: )?MTB Theme Accent$/ })
		).toBeVisible();
		await expect(
			page.getByRole('option', { name: /^(?:Color: )?MTB Site Accent$/ })
		).toBeVisible();
		await expect(
			page.getByRole('option', {
				name: /MTB Legacy Color/,
			})
		).toHaveCount(0);
		for (const origin of ['Theme', 'Custom']) {
			await expect(
				page.getByRole('heading', { name: origin, exact: true })
			).toBeVisible();
		}
		if (showDefaults) {
			await expect(
				page.getByRole('heading', { name: 'Default', exact: true })
			).toBeVisible();
			await expect(
				page.getByRole('option', { name: /MTB Default Color/ })
			).toBeVisible();
			await page
				.locator('.modular-table-blocks-color-popover')
				.screenshot({
					path: test.info().outputPath('grouped-cell-background.png'),
					animations: 'disabled',
				});
			await page
				.getByRole('option', { name: /MTB Default Color/ })
				.click();
			expect(await tokens(page)).toMatchObject({
				cellBackgroundColor: 'var(--wp--preset--color--mtb-default)',
			});
		} else {
			await expect(
				page.getByRole('heading', { name: 'Default', exact: true })
			).toHaveCount(0);
			await expect(
				page.getByRole('option', { name: /MTB Default Color/ })
			).toHaveCount(0);
		}
		await page
			.getByRole('option', { name: /^(?:Color: )?MTB Theme Accent$/ })
			.click();
		await page.keyboard.press('Escape');
		expect(await tokens(page)).toMatchObject({
			cellBackgroundColor: 'var(--wp--preset--color--mtb-theme-accent)',
		});
		await page.getByRole('tab', { name: 'Styles', exact: true }).click();
		const border = page.locator('.modular-table-blocks-border-control');
		await border
			.getByRole('spinbutton', { name: 'Border width', exact: true })
			.fill('2');
		await border
			.getByRole('spinbutton', { name: 'Border width', exact: true })
			.press('Tab');
		await border
			.getByRole('button', {
				name: 'Border color and style picker.',
				exact: true,
			})
			.click();
		await expect(
			page.getByRole('option', { name: /^(?:Color: )?MTB Theme Accent$/ })
		).toBeVisible();
		await expect(
			page.getByRole('option', {
				name: /MTB Legacy Color/,
			})
		).toHaveCount(0);
		for (const origin of ['Theme', 'Custom']) {
			await expect(
				page.getByRole('heading', { name: origin, exact: true })
			).toBeVisible();
		}
		if (showDefaults) {
			await expect(
				page.getByRole('heading', { name: 'Default', exact: true })
			).toBeVisible();
		} else {
			await expect(
				page.getByRole('heading', { name: 'Default', exact: true })
			).toHaveCount(0);
		}
		await page
			.getByRole('option', { name: /^(?:Color: )?MTB Site Accent$/ })
			.click();
		await page.keyboard.press('Escape');
		expect(await tokens(page)).toMatchObject({
			borderTopColor: 'var(--wp--preset--color--mtb-site-accent)',
		});
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').savePost()
		);
		await page.reload();
		await page.waitForFunction(
			() =>
				window.wp.data.select('core/block-editor').getBlocks()[0]
					?.name === 'modular-table-blocks/table'
		);
		expect(await tokens(page)).toMatchObject({
			cellBackgroundColor: 'var(--wp--preset--color--mtb-theme-accent)',
			borderTopColor: 'var(--wp--preset--color--mtb-site-accent)',
		});
	});
}

test('canonical cell variables preserve shorthand precedence, side resets and live parent inheritance', async ({
	page,
	context,
}) => {
	await openEditor(page, context);
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const cell = (content: string, styleTokens?: Record<string, string>) =>
			createBlock('modular-table-blocks/cell', { styleTokens }, [
				createBlock('core/paragraph', { content }),
			]);
		const table = window.mtbCreateTable(
			{
				columns: [{}, {}],
				styleTokens: {
					borderWidth: '2px',
					borderTopWidth: '4px',
					borderColor: '#224466',
					borderStyle: 'dashed',
					cellPaddingBlock: '8px',
					cellPaddingInline: '12px',
					cellBackgroundColor: '#eeeeee',
				},
			},
			[
				[
					cell('Uniform', { borderWidth: '3px' }),
					cell('Top only', {
						borderTopWidth: '5px',
						cellPaddingTop: '16px',
					}),
				],
				[cell('Inherited'), cell('Zero', { borderBottomWidth: '0' })],
			]
		);
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
		window.wp.data
			.dispatch('core/editor')
			.editPost({ title: 'Canonical cell variables', status: 'publish' });
	});
	const cells = page
		.frameLocator('iframe[name="editor-canvas"]')
		.locator('.modular-table-blocks-editor__cell');
	await expect(cells.nth(0)).toHaveCSS('border-top-width', '3px');
	await expect(cells.nth(0)).toHaveCSS('border-right-width', '3px');
	await expect(cells.nth(1)).toHaveCSS('border-top-width', '5px');
	await expect(cells.nth(1)).toHaveCSS('border-right-width', '2px');
	await expect(cells.nth(1)).toHaveCSS('padding-top', '16px');
	await expect(cells.nth(1)).toHaveCSS('padding-right', '12px');
	await expect(cells.nth(2)).toHaveCSS('border-top-width', '4px');
	await expect(cells.nth(3)).toHaveCSS('border-bottom-width', '0px');
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	await expect(cells.nth(0)).toHaveCSS('border-top-width', '3px');
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		const actions = window.wp.data.dispatch('core/block-editor');
		actions.updateBlockAttributes(table.clientId, {
			styleTokens: {
				...(table.attributes.styleTokens as object),
				borderWidth: '6px',
				borderTopWidth: '7px',
				cellPaddingInline: '14px',
			},
		});
		// Unset one side without copying its inherited value into the cell.
		actions.updateBlockAttributes(table.innerBlocks[1].clientId, {
			styleTokens: { cellPaddingTop: '16px' },
		});
	});
	await expect(cells.nth(0)).toHaveCSS('border-top-width', '3px');
	await expect(cells.nth(0)).toHaveCSS('border-right-width', '3px');
	await expect(cells.nth(1)).toHaveCSS('border-top-width', '7px');
	await expect(cells.nth(1)).toHaveCSS('border-right-width', '6px');
	await expect(cells.nth(1)).toHaveCSS('padding-right', '14px');
	await expect(cells.nth(1)).toHaveCSS('padding-top', '16px');
	await expect(cells.nth(3)).toHaveCSS('border-bottom-width', '0px');
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	await page.goto(`/?p=${id}`);
	const publicCells = page.locator(
		'table.wp-block-modular-table-blocks-table td'
	);
	await expect(publicCells.nth(0)).toHaveCSS('border-top-width', '3px');
	await expect(publicCells.nth(0)).toHaveCSS('border-right-width', '3px');
	await expect(publicCells.nth(1)).toHaveCSS('border-top-width', '7px');
	await expect(publicCells.nth(1)).toHaveCSS('border-right-width', '6px');
	await expect(publicCells.nth(1)).toHaveCSS('padding-right', '14px');
	await expect(publicCells.nth(1)).toHaveCSS('padding-top', '16px');
	await expect(publicCells.nth(3)).toHaveCSS('border-bottom-width', '0px');
	await expect(publicCells.nth(0)).toHaveCSS(
		'border-top-color',
		'rgb(34, 68, 102)'
	);
	await expect(publicCells.nth(0)).toHaveCSS('border-top-style', 'dashed');
	await expect(publicCells.nth(0)).toHaveCSS(
		'background-color',
		'rgb(238, 238, 238)'
	);
	await expect(publicCells.nth(2)).not.toHaveAttribute('style');
	expect(
		await publicCells
			.nth(0)
			.evaluate((element: HTMLElement) => Array.from(element.style))
	).toEqual([
		'--mtb-cell-border-t-width',
		'--mtb-cell-border-r-width',
		'--mtb-cell-border-b-width',
		'--mtb-cell-border-l-width',
	]);
	for (const style of await page
		.locator(
			'table.wp-block-modular-table-blocks-table, td.wp-block-modular-table-blocks-cell'
		)
		.evaluateAll((elements) =>
			elements.map((element) => element.getAttribute('style') ?? '')
		)) {
		expect(style).not.toMatch(
			/--mtb-(?:border-(?:width|style|color|top-|right-|bottom-|left-)|cell-padding-|cell-background-color)/
		);
		const names = style
			.split(';')
			.filter(Boolean)
			.map((declaration) => declaration.split(':')[0]);
		expect(new Set(names).size).toBe(names.length);
	}
});
