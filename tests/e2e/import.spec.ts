import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openEditor } from './login';
import { writeFile } from 'node:fs/promises';

test.use({ reducedMotion: 'reduce' });

const canvas = (page: Page) =>
	page.frameLocator('iframe[name="editor-canvas"]');
const dialog = (page: Page) =>
	page.getByRole('dialog', { name: 'Import data', exact: true });
const blocks = (page: Page) =>
	page.evaluate(() => window.wp.data.select('core/block-editor').getBlocks());
async function openImport(page: Page, cellIndex?: number) {
	await page.evaluate((index) => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(
				index === undefined
					? table.clientId
					: table.innerBlocks[index].clientId
			);
	}, cellIndex);
	await page
		.getByRole('button', { name: 'Import data', exact: true })
		.click();
	await expect(dialog(page)).toBeVisible();
}
async function makeTable(page: Page, merged = false) {
	await page.evaluate((merge) => {
		const rows = Array.from({ length: 3 }, (_, r) =>
			Array.from({ length: 3 }, (_column, c) =>
				window.wp.blocks.createBlock(
					'modular-table-blocks/cell',
					{
						tag: r === 1 && c === 1 ? 'th' : 'td',
						styleTokens:
							r === 1 && c === 1
								? { paddingTop: '12px' }
								: undefined,
					},
					[
						window.wp.blocks.createBlock(
							'modular-table-blocks/cell-text',
							{ content: `${r + 1}:${c + 1}` }
						),
					]
				)
			)
		);
		const table = window.mtbCreateTable(
			{
				rowCount: 3,
				columns: [{ width: '20%' }, { width: '30%' }, { width: '50%' }],
				columnWidthMode: 'custom',
				caption: 'Keep caption',
				style: { color: { background: '#fedcba' } },
			},
			rows
		);
		if (merge) {
			table.innerBlocks = window.mtbMergeCells(table, 0, 0, 2, 2);
		}
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
	}, merged);
	await expect(
		canvas(page).locator('.modular-table-blocks-editor__cell')
	).toHaveCount(merged ? 6 : 9);
}
async function paste(page: Page, plain: string, html = '') {
	await dialog(page)
		.getByLabel('Table data', { exact: true })
		.evaluate(
			(element, data) => {
				// Firefox discards data passed to a synthetic ClipboardEvent constructor.
				// Supply the native read-only clipboard interface to the paste handler.
				const event = new Event('paste', {
					bubbles: true,
					cancelable: true,
				});
				Object.defineProperty(event, 'clipboardData', {
					value: {
						getData: (type: string) =>
							type === 'text/html' ? data.html : data.plain,
					},
				});
				element.dispatchEvent(event);
			},
			{ plain, html }
		);
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
});

test('CSV creates a new table, safely preserves strings, saves and renders semantic HTML', async ({
	page,
	context,
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await canvas(page)
		.getByRole('button', { name: 'Import data', exact: true })
		.click();
	await dialog(page)
		.getByLabel('Table data', { exact: true })
		.fill('Code,Value\n001,"hello\nworld"\n<img src=x>,=1+1\n');
	await dialog(page)
		.getByLabel('Use first row as headers (TH)', { exact: true })
		.check();
	await expect(
		dialog(page)
			.getByRole('region', { name: 'Import preview', exact: true })
			.getByText('001', { exact: true })
	).toBeVisible();
	await dialog(page)
		.getByRole('button', { name: 'Import', exact: true })
		.click();
	await expect(dialog(page)).toHaveCount(0);
	await expect(
		canvas(page).locator('.modular-table-blocks-editor__cell')
	).toHaveCount(6);
	const after = (await blocks(page))[0];
	expect(after.attributes.headerRows).toBe(1);
	expect(after.innerBlocks[2].innerBlocks[0].attributes.content).toBe('001');
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	await page.reload();
	await expect(
		canvas(page).locator('.modular-table-blocks-editor__cell')
	).toHaveCount(6);
	const reloaded = (await blocks(page))[0];
	expect(reloaded.isValid).toBe(true);
	expect(reloaded.innerBlocks.every((cell) => cell.isValid)).toBe(true);
	expect(reloaded.innerBlocks[3].innerBlocks[0].attributes.content).toBe(
		'hello<br>world'
	);
	const id = await page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
	const front = await context.newPage();
	await front.goto(`/?p=${id}`);
	const table = front.locator('figure.modular-table-blocks-figure > table');
	await expect(table.locator('thead th')).toHaveCount(2);
	await expect(table.locator('tbody td')).toHaveCount(4);
	await expect(table.locator('tbody td').nth(2)).toHaveText('<img src=x>');
	await expect(table.locator('img,script')).toHaveCount(0);
	expect(
		await table
			.locator('tbody')
			.evaluate((body) =>
				Array.from(body.children).every(
					(row) =>
						row.tagName === 'TR' &&
						Array.from(row.children).every((cell) =>
							['TH', 'TD'].includes(cell.tagName)
						)
				)
			)
	).toBe(true);
	expect(errors).toEqual([]);
	await front.close();
});

test('overwrite starts from selected cell, expands, confirms deletion, preserves settings and undoes in one step', async ({
	page,
}) => {
	await makeTable(page);
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(table.innerBlocks[0].clientId, {
				lock: { remove: true },
			});
		window.wp.data.dispatch('core/block-editor').replaceInnerBlocks(
			table.innerBlocks[4].clientId,
			[
				window.wp.blocks.createBlock('core/group', {}, [
					window.wp.blocks.createBlock('core/paragraph', {
						content: 'Grouped content',
					}),
				]),
			],
			false
		);
	});
	const before = (await blocks(page))[0];
	await openImport(page, 4);
	await expect(
		dialog(page)
			.getByRole('region', { name: 'Starting cell', exact: true })
			.getByRole('button', { name: 'Row 2, column 2', exact: true })
	).toContainText('Grouped content');
	await paste(page, 'a\tb\tc\td\ne\tf\tg\th\ni\tj\tk\tl');
	const apply = dialog(page).getByRole('button', {
		name: 'Expand to 4 rows × 5 columns and import',
		exact: true,
	});
	await expect(apply).toBeDisabled();
	await expect(
		dialog(page).getByText('Starting at row 2, column 2', { exact: true })
	).toBeVisible();
	await dialog(page)
		.getByRole('checkbox', { name: /Replace contents in 4 cells/ })
		.check();
	await apply.click();
	await expect(
		canvas(page).locator('.modular-table-blocks-editor__cell')
	).toHaveCount(20);
	const after = (await blocks(page))[0];
	expect(after.attributes.rowCount).toBe(4);
	expect((after.attributes.columns as unknown[]).length).toBe(5);
	expect(after.attributes.caption).toBe(before.attributes.caption);
	expect(after.attributes.style).toEqual(before.attributes.style);
	expect(after.innerBlocks[6].attributes).toEqual(
		before.innerBlocks[4].attributes
	);
	expect(after.innerBlocks[6].innerBlocks[0].attributes.content).toBe('a');
	expect(after.innerBlocks[0]).toEqual(before.innerBlocks[0]);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').undo());
	await expect.poll(() => blocks(page)).toEqual([before]);
	await page.evaluate(() => window.wp.data.dispatch('core/editor').redo());
	await expect.poll(() => blocks(page)).toEqual([after]);
});

test('anchor changes, missing fields, explicit blanks, new-table mode and cancel preserve unrelated contents', async ({
	page,
}) => {
	await makeTable(page);
	const before = await blocks(page);
	await openImport(page);
	await dialog(page).getByLabel('Table data', { exact: true }).fill('x,\ny');
	await dialog(page)
		.getByRole('region', { name: 'Starting cell', exact: true })
		.getByRole('button', { name: 'Row 2, column 2', exact: true })
		.click();
	await expect(
		dialog(page).getByText(/Some rows have missing fields/)
	).toBeVisible();
	await dialog(page)
		.getByRole('button', { name: 'Cancel', exact: true })
		.click();
	expect(await blocks(page)).toEqual(before);
	await openImport(page, 4);
	await dialog(page).getByLabel('Table data', { exact: true }).fill('x,\ny');
	await dialog(page)
		.getByRole('checkbox', { name: /Replace contents in 3 cells/ })
		.check();
	await dialog(page)
		.getByRole('button', { name: 'Import', exact: true })
		.click();
	const next = (await blocks(page))[0];
	expect(next.innerBlocks[4].innerBlocks[0].attributes.content).toBe('x');
	expect(next.innerBlocks[5].innerBlocks[0].attributes.content).toBe('');
	expect(next.innerBlocks[8]).toEqual(before[0].innerBlocks[8]);
	await openImport(page);
	await dialog(page).getByLabel('Table data', { exact: true }).fill('new');
	await dialog(page)
		.getByRole('radio', { name: 'New table', exact: true })
		.click();
	await dialog(page)
		.getByRole('button', { name: 'Import', exact: true })
		.click();
	const all = await blocks(page);
	expect(all).toHaveLength(2);
	expect(all[0]).toEqual(next);
	expect(all[1].attributes.caption).toBe('');
	expect(all[1].attributes.style).toBeUndefined();
});

test('HTML clipboard uses inert plain text and preserves new-table merges; existing mismatches refuse', async ({
	page,
}) => {
	const requests: string[] = [];
	page.on('request', (request) => {
		if (request.url().includes('import-invalid.test')) {
			requests.push(request.url());
		}
	});
	await canvas(page)
		.getByRole('button', { name: 'Import data', exact: true })
		.click();
	await paste(
		page,
		'fallback',
		'<table><thead><tr><th colspan="2">Header</th></tr></thead><tbody><tr><td rowspan="2"><b>001</b><img src="https://import-invalid.test/x"><script>window.importExecuted=true</script></td><td>A<br>B</td></tr><tr><td>C</td></tr></tbody></table>'
	);
	await expect(
		dialog(page)
			.getByRole('region', { name: 'Import preview', exact: true })
			.getByText('001', { exact: true })
	).toBeVisible();
	await dialog(page)
		.getByRole('button', { name: 'Import', exact: true })
		.click();
	const imported = (await blocks(page))[0];
	expect(imported.attributes.headerRows).toBe(1);
	expect(imported.innerBlocks[0].attributes.colSpan).toBe(2);
	expect(imported.innerBlocks[1].attributes.rowSpan).toBe(2);
	expect(imported.innerBlocks[1].innerBlocks[0].attributes.content).toBe(
		'001'
	);
	expect(requests).toEqual([]);
	await makeTable(page, true);
	const before = await blocks(page);
	await openImport(page, 0);
	await paste(page, 'a\tb\nc\td');
	await expect(
		dialog(page).getByText(/Merged cells do not match/)
	).toBeVisible();
	await expect(
		dialog(page).getByRole('button', { name: 'Import', exact: true })
	).toBeDisabled();
	expect(await blocks(page)).toEqual(before);
	await dialog(page)
		.getByLabel('Table data', { exact: true })
		.fill(
			'<table><tbody><tr><td rowspan="2">x</td></tr></tbody><tbody><tr><td>y</td></tr></tbody></table>'
		);
	await dialog(page)
		.getByLabel('Input format', { exact: true })
		.selectOption('html');
	await expect(
		dialog(page).getByText(
			/The HTML table has invalid or overlapping merged cells/
		)
	).toBeVisible();
	await expect(
		dialog(page).getByRole('button', { name: 'Import', exact: true })
	).toBeDisabled();
	expect(await blocks(page)).toEqual(before);
});

test('locked descendants, stale source and over-limit input refuse without partial changes', async ({
	page,
}) => {
	await makeTable(page);
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(
				table.innerBlocks[0].innerBlocks[0].clientId,
				{ lock: { remove: true } }
			);
	});
	const before = await blocks(page);
	await openImport(page);
	await paste(page, 'x');
	await expect(
		dialog(page).getByText(/affected contents are locked/)
	).toBeVisible();
	await expect(
		dialog(page).getByRole('button', { name: 'Import', exact: true })
	).toBeDisabled();
	await dialog(page)
		.getByRole('button', { name: 'Cancel', exact: true })
		.click();
	expect(await blocks(page)).toEqual(before);
	await openImport(page, 4);
	await paste(page, 'x');
	await page.evaluate(() => {
		const table = window.wp.data.select('core/block-editor').getBlocks()[0];
		window.wp.data
			.dispatch('core/block-editor')
			.updateBlockAttributes(table.clientId, { caption: 'changed' });
	});
	await expect(dialog(page).getByText(/The table changed/)).toBeVisible();
	await expect(
		dialog(page).getByRole('button', { name: 'Import', exact: true })
	).toBeDisabled();
	await dialog(page)
		.getByRole('button', { name: 'Cancel', exact: true })
		.click();
	await openImport(page, 4);
	await paste(page, Array(101).fill('x').join('\n'));
	await expect(
		dialog(page).getByText(/Import exceeds the limit/)
	).toBeVisible();
	await expect(
		dialog(page).getByRole('button', { name: 'Import', exact: true })
	).toBeDisabled();
});

test('modal keyboard, contrast and narrow viewport keep actions reachable', async ({
	page,
}) => {
	await makeTable(page);
	await openImport(page);
	await paste(page, 'a,b\nc,d');
	const results = await new AxeBuilder({ page })
		.include('.modular-table-blocks-import')
		.analyze();
	expect(results.violations).toEqual([]);
	await page.setViewportSize({ width: 390, height: 760 });
	await expect(dialog(page)).toBeVisible();
	await dialog(page)
		.getByRole('button', { name: 'Cancel', exact: true })
		.scrollIntoViewIfNeeded();
	await expect(
		dialog(page).getByRole('button', { name: 'Cancel', exact: true })
	).toBeInViewport();
	await page.screenshot({
		path: test.info().outputPath('import-narrow.png'),
		fullPage: true,
	});
	await page.keyboard.press('Escape');
	await expect(dialog(page)).toHaveCount(0);
});

test('maximum 100 by 50 import previews and applies without truncation', async ({
	page,
	browserName,
}, info) => {
	test.skip(
		browserName !== 'chromium',
		'Large-grid timing is measured in Chromium; UI and merge compatibility run in all browsers.'
	);
	test.setTimeout(120000);
	await canvas(page)
		.getByRole('button', { name: 'Import data', exact: true })
		.click();
	const started = Date.now();
	await paste(
		page,
		Array.from({ length: 100 }, (_, r) =>
			Array.from({ length: 50 }, (_column, c) => `${r}:${c}`).join('\t')
		).join('\n')
	);
	await expect(
		dialog(page)
			.getByRole('region', { name: 'Import preview', exact: true })
			.locator('tbody td')
	).toHaveCount(5000, { timeout: 30000 });
	const preview = Date.now() - started;
	const applied = Date.now();
	await dialog(page)
		.getByRole('button', { name: 'Import', exact: true })
		.click();
	await expect(
		canvas(page).locator('.modular-table-blocks-editor__cell')
	).toHaveCount(5000, { timeout: 90000 });
	const render = Date.now() - applied;
	await writeFile(
		info.outputPath('import-timing.json'),
		JSON.stringify({ previewMs: preview, applyAndRenderMs: render })
	);
	await info.attach('import-timing.json', {
		body: JSON.stringify({ previewMs: preview, applyAndRenderMs: render }),
		contentType: 'application/json',
	});
	expect(
		(await blocks(page))[0].innerBlocks[4999].innerBlocks[0].attributes
			.content
	).toBe('99:49');
});

test('Japanese translations are available before the import chunk is loaded', async ({
	page,
}) => {
	await page.goto('/wp-admin/post-new.php?mtb_test_locale=ja');
	await page.waitForFunction(
		() => !!window.wp?.blocks?.getBlockType('modular-table-blocks/table')
	);
	await page.evaluate(() =>
		window.wp.data
			.dispatch('core/block-editor')
			.resetBlocks([
				window.wp.blocks.createBlock('modular-table-blocks/table'),
			])
	);
	await canvas(page)
		.getByRole('button', { name: 'データを取り込む', exact: true })
		.click();
	const modal = page.getByRole('dialog', {
		name: 'データを取り込む',
		exact: true,
	});
	await modal.getByLabel('表のデータ', { exact: true }).fill('001,002');
	await expect(modal.getByLabel('入力形式', { exact: true })).toBeVisible();
	await expect(
		modal.getByRole('region', { name: '取り込みプレビュー', exact: true })
	).toContainText('001');
	await page.screenshot({
		path: test.info().outputPath('import-japanese.png'),
		animations: 'disabled',
	});
	await modal.getByRole('button', { name: '取り込む', exact: true }).click();
	await expect(
		canvas(page).locator('.modular-table-blocks-editor__cell')
	).toHaveCount(2);
	expect(
		(await blocks(page))[0].innerBlocks[0].innerBlocks[0].attributes.content
	).toBe('001');
});

test('native clipboard text imports while ordinary cell text paste stays in the cell', async ({
	page,
	context,
	browserName,
}) => {
	test.skip(
		browserName !== 'chromium',
		'Native clipboard permissions are available in Chromium; synthetic MIME payloads run in all browsers.'
	);
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await canvas(page)
		.getByRole('button', { name: 'Import data', exact: true })
		.click();
	await dialog(page).getByLabel('Table data', { exact: true }).focus();
	await page.evaluate(() => navigator.clipboard.writeText('A\tB\n001\t002'));
	await page.keyboard.press(
		process.platform === 'darwin' ? 'Meta+V' : 'Control+V'
	);
	await expect(
		dialog(page).getByRole('region', {
			name: 'Import preview',
			exact: true,
		})
	).toContainText('001');
	await dialog(page)
		.getByRole('button', { name: 'Import', exact: true })
		.click();
	const input = canvas(page)
		.getByRole('textbox', { name: 'Cell text', exact: true })
		.first();
	await input.fill('');
	await input.focus();
	await page.evaluate(() =>
		navigator.clipboard.writeText('ordinary paste 001')
	);
	await page.keyboard.press(
		process.platform === 'darwin' ? 'Meta+V' : 'Control+V'
	);
	await expect(input).toHaveText('ordinary paste 001');
	await expect(dialog(page)).toHaveCount(0);
	expect((await blocks(page))[0].innerBlocks).toHaveLength(4);
});
