import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openEditor, openAuthorEditor } from './login';
const TEXT_BLOCK = 'modular-table-blocks/cell-text';
const tree = (page: Page) =>
	page.evaluate(
		() => window.wp.data.select('core/block-editor').getBlocks()[0]
	);
async function selectCell(page: Page, row = 0, column = 0) {
	await page.evaluate(
		({ r, c }) => {
			const table = window.wp.data
				.select('core/block-editor')
				.getBlocks()[0];
			window.wp.data
				.dispatch('core/block-editor')
				.selectBlock(
					table.innerBlocks.filter(
						(candidate) => candidate.attributes.row === r
					)[c].clientId
				);
		},
		{ r: row, c: column }
	);
}
const canvas = (page: Page) =>
	page.frameLocator('iframe[name="editor-canvas"]');
async function cellTextInput(page: Page, row = 0, column = 0) {
	await selectCell(page, row, column);
	const cells = canvas(page).locator(
		`.modular-table-blocks-editor__cell[data-mtb-row="${row}"]`
	);
	const input = cells
		.nth(column)
		.getByRole('textbox', { name: 'Cell text', exact: true });
	await expect(input).toBeVisible();
	return input;
}
async function fillText(
	page: Page,
	input: ReturnType<Page['getByRole']>,
	content: string
) {
	await input.fill('');
	const lines = content.split('\n');
	for (let i = 0; i < lines.length; i++) {
		if (i) {
			await input.press('Shift+Enter');
		}
		if (lines[i]) {
			await page.keyboard.insertText(lines[i]);
		}
	}
}
test.beforeEach(async ({ page, context }) => {
	await openEditor(page, context);
	await page.evaluate(() =>
		window.wp.data
			.dispatch('core/block-editor')
			.resetBlocks([
				window.wp.blocks.createBlock('modular-table-blocks/table'),
			])
	);
	const frame = canvas(page);
	await frame.getByLabel('Rows', { exact: true }).fill('2');
	await frame.getByLabel('Columns', { exact: true }).fill('2');
	await frame
		.getByRole('button', { name: 'Create table', exact: true })
		.click();
	await expect(
		frame.locator('.modular-table-blocks-editor__cell')
	).toHaveCount(4);
});
test('new cells contain blank cell text and cleared cells keep the standard inserter', async ({
	page,
	context,
}) => {
	for (const cell of (await tree(page)).innerBlocks) {
		expect(cell.innerBlocks).toHaveLength(1);
		expect(cell.innerBlocks[0].name).toBe(TEXT_BLOCK);
		expect(cell.innerBlocks[0].attributes).toEqual({ content: '' });
	}
	await selectCell(page);
	await expect(
		canvas(page)
			.locator('.modular-table-blocks-editor__cell')
			.first()
			.locator('button.block-editor-inserter__toggle')
	).toHaveCount(0);
	await page.screenshot({
		path: test.info().outputPath('default-cell-text.png'),
		fullPage: true,
	});
	expect(
		(await tree(page)).innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0].innerBlocks
	).toHaveLength(1);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	await expect(
		canvas(page).locator('.modular-table-blocks-editor__cell')
	).toHaveCount(4);
	for (const cell of (await tree(page)).innerBlocks) {
		expect(cell.innerBlocks).toHaveLength(1);
		expect(cell.innerBlocks[0].name).toBe(TEXT_BLOCK);
		expect(cell.innerBlocks[0].attributes).toEqual({ content: '' });
	}
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	const frontend = await context.newPage();
	try {
		await frontend.goto(`/?p=${id}`);
		const cells = frontend.locator(
			'table.wp-block-modular-table-blocks-table td'
		);
		await expect(cells).toHaveCount(4);
		for (const cell of await cells.all()) {
			await expect(cell).toHaveText('');
			await expect(cell.locator('*')).toHaveCount(0);
		}
	} finally {
		await frontend.close();
	}
	await selectCell(page);
	const input = canvas(page)
		.locator('.modular-table-blocks-editor__cell')
		.first()
		.getByRole('textbox', { name: 'Cell text', exact: true });
	await input.fill('Text without a paragraph');
	const blocks = (await tree(page)).innerBlocks.filter(
		(candidate) => candidate.attributes.row === 0
	)[0].innerBlocks;
	expect(blocks).toHaveLength(1);
	expect(blocks[0].name).toBe(TEXT_BLOCK);
	expect(blocks[0].attributes).toEqual({
		content: 'Text without a paragraph',
	});
	const accessibility = await new AxeBuilder({ page })
		.include([
			'iframe[name="editor-canvas"]',
			'.modular-table-blocks-cell-text',
		])
		.withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
		.analyze();
	expect(accessibility.violations).toEqual([]);
	await selectCell(page, 0, 1);
	const second = canvas(page)
		.locator('.modular-table-blocks-editor__cell')
		.nth(1);
	await page.evaluate(() => {
		const cell = window.wp.data.select('core/block-editor').getBlocks()[0]
			.innerBlocks[1];
		window.wp.data
			.dispatch('core/block-editor')
			.removeBlocks([cell.innerBlocks[0].clientId]);
		window.wp.data.dispatch('core/block-editor').selectBlock(cell.clientId);
	});
	await second.locator('button.block-editor-inserter__toggle').click();
	const choices = page.getByRole('option');
	await expect(choices.first()).toHaveAccessibleName(/Cell text$/);
	for (const label of [
		'Cell text',
		'Paragraph',
		'List',
		'Heading',
		'Image',
		'Buttons',
	]) {
		await expect(
			page.getByRole('option', { name: new RegExp(`${label}$`) })
		).toBeVisible();
	}

	await page.getByRole('option', { name: 'Paragraph', exact: true }).click();
	await second
		.locator('p[contenteditable="true"]')
		.fill('Standard paragraph');
	expect(
		(await tree(page)).innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[1].innerBlocks[0].name
	).toBe('core/paragraph');
	await page.screenshot({
		path: test.info().outputPath('default-text-and-standard-blocks.png'),
		fullPage: true,
	});
});
test('row and column insertion and splitting create one cell text while retaining origin content', async ({
	page,
}) => {
	const first = canvas(page)
		.getByRole('textbox', { name: 'Cell text', exact: true })
		.first();
	await first.fill('Origin content');
	const origin = (await tree(page)).innerBlocks[0].innerBlocks;
	await selectCell(page);
	const action = async (menu: string, item: string) => {
		await page
			.getByRole('toolbar', { name: 'Block tools', exact: true })
			.getByRole('button', { name: menu, exact: true })
			.click();
		await page
			.getByRole('menu', { name: menu, exact: true })
			.getByRole('menuitem', { name: item, exact: true })
			.click();
	};
	const selectTable = () =>
		page.evaluate(() => {
			const table = window.wp.data
				.select('core/block-editor')
				.getBlocks()[0];
			window.wp.data
				.dispatch('core/block-editor')
				.selectBlock(table.clientId);
		});
	await selectTable();
	await action('Table structure', 'Add row at end');
	await selectTable();
	await action('Table structure', 'Add column at end');
	let table = await tree(page);
	expect(table.attributes.rowCount).toBe(3);
	expect(table.attributes.columns).toHaveLength(3);
	expect(table.innerBlocks).toHaveLength(9);
	expect(table.innerBlocks[0].innerBlocks).toEqual(origin);
	for (const cell of table.innerBlocks) {
		expect(cell.innerBlocks).toHaveLength(1);
		expect(cell.innerBlocks[0].name).toBe(TEXT_BLOCK);
	}
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await expect
		.poll(async () => (await tree(page)).innerBlocks.length)
		.toBe(6);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').redo());
	await expect
		.poll(async () => (await tree(page)).innerBlocks.length)
		.toBe(9);
	await selectCell(page);
	const mergeToggle = page
		.getByRole('toolbar', { name: 'Block tools', exact: true })
		.getByRole('button', { name: 'Merge and split cells', exact: true });
	await expect(mergeToggle).toHaveAttribute('aria-pressed', 'false');
	await mergeToggle.click();
	const merge = page.getByRole('dialog', {
		name: 'Merge cells',
		exact: true,
	});
	await merge
		.getByRole('button', { name: 'End at row 1, column 2', exact: true })
		.click();
	await merge
		.getByRole('button', { name: 'Merge cells', exact: true })
		.click();
	// Existing deletion policy includes the default blank text block.
	await page
		.getByRole('dialog', {
			name: 'Delete other cell contents?',
			exact: true,
		})
		.getByRole('button', { name: 'Delete contents and merge', exact: true })
		.click();
	await expect
		.poll(async () => (await tree(page)).innerBlocks.length)
		.toBe(8);
	await expect(mergeToggle).toHaveAttribute('aria-pressed', 'true');
	await mergeToggle.click();
	await expect(mergeToggle).toHaveAttribute('aria-pressed', 'false');
	table = await tree(page);
	expect(table.innerBlocks).toHaveLength(9);
	expect(table.innerBlocks[0].innerBlocks).toEqual(origin);
	const ids = table.innerBlocks.flatMap((cell) =>
		cell.innerBlocks.map((block) => block.clientId)
	);
	expect(new Set(ids).size).toBe(9);
	for (const cell of table.innerBlocks.slice(1)) {
		expect(cell.innerBlocks).toHaveLength(1);
		expect(cell.innerBlocks[0].name).toBe(TEXT_BLOCK);
		expect(cell.innerBlocks[0].attributes.content).toBe('');
	}
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	await expect(
		canvas(page).getByRole('textbox', { name: 'Cell text', exact: true })
	).toHaveCount(9);
	await expect(
		canvas(page)
			.getByRole('textbox', { name: 'Cell text', exact: true })
			.first()
	).toHaveText('Origin content');
});
for (const author of [false, true]) {
	test(`cell text transforms to a paragraph with line breaks and ${author ? 'native author sanitization' : 'text preserved'}`, async ({
		page,
		context,
	}) => {
		if (author) {
			await openAuthorEditor(page, context);
			// Compare with an ordinary paragraph to distinguish core KSES behavior.
			await page.evaluate(() => {
				const cell = window.wp.data
					.select('core/block-editor')
					.getBlocks()[0]
					.innerBlocks.filter(
						(candidate) => candidate.attributes.row === 0
					)[1];
				window.wp.data.dispatch('core/block-editor').replaceInnerBlocks(
					cell.clientId,
					[
						window.wp.blocks.createBlock('core/paragraph', {
							content: '&amp;#65;',
						}),
					],
					false
				);
			});
		}
		const input = await cellTextInput(page);
		const text = '日本語 <em>literal</em> &amp; &#65;\nSecond line';
		await fillText(page, input, text);
		await page
			.getByRole('button', { name: 'Cell text', exact: true })
			.click();
		await page
			.getByRole('menuitem', { name: 'Paragraph', exact: true })
			.click();
		const paragraph = canvas(page)
			.locator('.modular-table-blocks-editor__cell')
			.first()
			.locator('p[contenteditable="true"]');
		await expect(paragraph).toHaveText(text, { useInnerText: true });
		await expect(paragraph.locator('em')).toHaveCount(0);
		expect(
			(await tree(page)).innerBlocks.filter(
				(candidate) => candidate.attributes.row === 0
			)[0].innerBlocks[0].name
		).toBe('core/paragraph');
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').undo()
		);
		await expect(input).toHaveText(text, { useInnerText: true });
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').redo()
		);
		await expect(paragraph).toHaveText(text, { useInnerText: true });
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').savePost()
		);
		const id = await page.evaluate(() =>
			window.wp.data.select('core/editor').getCurrentPostId()
		);
		await page.reload();
		let expected = text;
		if (author) {
			const native = await canvas(page)
				.locator('.modular-table-blocks-editor__cell')
				.nth(1)
				.locator('p[contenteditable="true"]')
				.innerText();
			expect(['&#65;', 'A']).toContain(native);
			expected = text.replace('&#65;', native);
			if (native === 'A') {
				test.info().annotations.push({
					type: 'WordPress core KSES limitation',
					description:
						'Literal numeric entities normalize after author save, including in ordinary core/paragraph blocks.',
				});
			}
		}
		await expect(paragraph).toHaveText(expected, { useInnerText: true });
		const saved = (await tree(page)).innerBlocks.filter(
			(candidate) => candidate.attributes.row === 0
		)[0].innerBlocks[0];
		expect(saved.name).toBe('core/paragraph');
		expect(saved.isValid).toBe(true);
		await page.goto(`/?p=${id}`);
		const output = page
			.locator('table.wp-block-modular-table-blocks-table td')
			.first();
		await expect(output.locator('p')).toHaveCount(1);
		await expect(output).toHaveText(expected, { useInnerText: true });
		await expect(output.locator('em')).toHaveCount(0);
		await expect(output.locator('br')).toHaveCount(1);
	});
	test(`cell text keeps native inline tools without block settings and renders escaped wrapper-free text after ${author ? 'author' : 'administrator'} save`, async ({
		page,
		context,
	}) => {
		if (author) {
			await openAuthorEditor(page, context);
		}
		await page.evaluate(() => {
			const table = window.wp.data
				.select('core/block-editor')
				.getBlocks()[0];
			window.wp.data
				.dispatch('core/block-editor')
				.updateBlockAttributes(table.clientId, {
					style: {
						typography: {
							fontSize: '28px',
							lineHeight: '1.5',
							textAlign: 'right',
						},
						color: { text: '#123456' },
					},
				});
		});
		const input = await cellTextInput(page);
		const text =
			'  日本語 <em>literal</em> & "quotes" &amp; &#65;\nSecond line  ';
		await fillText(page, input, text);
		const inheritedSize = await input.evaluate(
			(node) =>
				getComputedStyle(
					node.closest('.modular-table-blocks-editor__cell')!
				).fontSize
		);
		await expect(input).toHaveCSS('font-size', inheritedSize);
		await expect(input).toHaveCSS('text-align', 'right');
		await expect(input).toHaveCSS('color', 'rgb(18, 52, 86)');
		for (const label of ['Bold', 'Italic', 'Link']) {
			await expect(
				page.getByRole('button', { name: label, exact: true })
			).toBeVisible();
		}
		await expect(
			page.getByRole('button', { name: 'Align text', exact: true })
		).toHaveCount(0);
		const metadata = await page.evaluate(() => {
			const type = window.wp.blocks.getBlockType(
				'modular-table-blocks/cell-text'
			)!;
			return { supports: type.supports, parent: type.parent };
		});
		expect(metadata.parent).toEqual(['modular-table-blocks/cell']);
		expect(metadata.supports).not.toHaveProperty('typography');
		expect(metadata.supports).not.toHaveProperty('color');
		expect(metadata.supports).toMatchObject({
			html: false,
			customClassName: false,
			customCSS: false,
			anchor: false,
			visibility: false,
		});
		const advanced = page.getByRole('button', {
			name: 'Advanced',
			exact: true,
		});
		if (await advanced.isVisible()) {
			await advanced.click();
			await expect(
				page.locator(
					'.block-editor-block-inspector__advanced input, .block-editor-block-inspector__advanced textarea, .block-editor-block-inspector__advanced select'
				)
			).toHaveCount(0);
		}
		await input.press('End');
		await input.pressSequentially('!');
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').undo()
		);
		// WordPress groups this continuous typing session into one undo step.
		await expect(input).toHaveText('');
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').redo()
		);
		await expect(input).toHaveText(text + '!', { useInnerText: true });
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').savePost()
		);
		const id = await page.evaluate(() =>
			window.wp.data.select('core/editor').getCurrentPostId()
		);
		await page.reload();
		const reloaded = canvas(page)
			.locator('.modular-table-blocks-editor__cell')
			.first()
			.getByRole('textbox', { name: 'Cell text', exact: true });
		await expect(reloaded).toHaveText(text + '!', { useInnerText: true });
		const result = await page.evaluate(() => {
			const blocks = window.wp.data
				.select('core/block-editor')
				.getBlocks();
			const valid = (items: typeof blocks): boolean =>
				items.every((b) => b.isValid && valid(b.innerBlocks));
			return {
				valid: valid(blocks),
				source: window.wp.blocks.serialize(blocks),
			};
		});
		expect(result.valid).toBe(true);
		expect(result.source).toContain('wp:modular-table-blocks/cell-text');
		expect(result.source).not.toContain('modular-table-blocks-cell-text');
		await page.goto(`/?p=${id}`);
		const cell = page
			.locator('table.wp-block-modular-table-blocks-table td')
			.first();
		// Public RichText uses WordPress's normal typographic quote conversion.
		await expect(cell).toHaveText(
			text.replace('"quotes"', '“quotes”') + '!',
			{ useInnerText: true }
		);
		await expect(cell.locator('br')).toHaveCount(1);
		await expect(cell.locator(':scope > :not(br)')).toHaveCount(0);
		await expect(cell).toHaveCSS('text-align', 'right');
	});
}
test('cell text keeps boundary whitespace, literal entities and an explicitly empty block across reloads', async ({
	page,
}) => {
	const input = await cellTextInput(page);
	for (const content of [
		'\n  First\t\nLast  \n',
		'　\u00a0First\t\nLast\u202f　',
		'&amp; &#65; &#x41; &copy;',
		'',
	]) {
		await fillText(page, input, content);
		const expected = await input.innerText();
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').savePost()
		);
		await page.reload();
		await expect.poll(() => input.innerText()).toBe(expected);
		expect((await tree(page)).innerBlocks[0].innerBlocks[0].isValid).toBe(
			true
		);
	}
});

for (const author of [false, true]) {
	test(`native inline bold italic and link survive ${author ? 'author' : 'administrator'} save and paragraph conversion`, async ({
		page,
		context,
	}) => {
		if (author) {
			await openAuthorEditor(page, context);
		}
		const input = await cellTextInput(page);
		await input.fill('Formatted text');
		await input.press('ControlOrMeta+a');
		await page.getByRole('button', { name: 'Bold', exact: true }).click();
		await expect(input.locator('strong')).toHaveText('Formatted text');
		await page.getByRole('button', { name: 'Italic', exact: true }).click();
		await expect(input.locator('em')).toHaveText('Formatted text');
		await input.press('ControlOrMeta+k');
		const url = page.getByRole('combobox', {
			name: /^(Link|Search or type URL)$/,
			exact: true,
		});
		await url.fill('https://example.com/inline');
		await url.press('Enter');
		await page.keyboard.press('Escape');
		await expect(input.locator('a')).toHaveAttribute(
			'href',
			'https://example.com/inline'
		);
		await test.info().attach('inline-editor-dom.html', {
			body: await input.evaluate((node) => node.outerHTML),
			contentType: 'text/html',
		});
		await page.screenshot({
			path: test.info().outputPath('native-inline-toolbar.png'),
			fullPage: true,
		});
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').savePost()
		);
		const id = await page.evaluate(() =>
			window.wp.data.select('core/editor').getCurrentPostId()
		);
		await page.reload();
		await expect(input.locator('strong')).toHaveText('Formatted text');
		await expect(input.locator('em')).toHaveText('Formatted text');
		await expect(input.locator('a')).toHaveAttribute(
			'href',
			'https://example.com/inline'
		);
		expect((await tree(page)).innerBlocks[0].innerBlocks[0].isValid).toBe(
			true
		);
		const published = await context.newPage();
		await published.goto(`/?p=${id}`);
		const output = published
			.locator('table.wp-block-modular-table-blocks-table td')
			.first();
		await expect(output.locator('strong')).toHaveText('Formatted text');
		await expect(output.locator('em')).toHaveText('Formatted text');
		await expect(output.locator('a')).toHaveAttribute(
			'href',
			'https://example.com/inline'
		);
		await expect(output.locator('p,div')).toHaveCount(0);
		await published.close();
		await input.click();
		await page
			.getByRole('button', { name: 'Cell text', exact: true })
			.click();
		await page
			.getByRole('menuitem', { name: 'Paragraph', exact: true })
			.click();
		const paragraph = canvas(page)
			.locator('.modular-table-blocks-editor__cell')
			.first()
			.locator('p[contenteditable="true"]');
		await expect(paragraph.locator('strong')).toHaveText('Formatted text');
		await expect(paragraph.locator('em')).toHaveText('Formatted text');
		await expect(paragraph.locator('a')).toHaveAttribute(
			'href',
			'https://example.com/inline'
		);
	});
}
