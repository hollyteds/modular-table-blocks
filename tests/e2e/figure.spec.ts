import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openEditor, openAuthorEditor } from './login';

const host = `:root :is(.wp-block-post-content, .entry-content) {
 font:20px/1.5 Arial,sans-serif; color:#234567;
}`;
const theme = `figure {
 margin:2em 40px; padding:19px; border:7px solid red;
 border-radius:21px; box-shadow:0 0 9px red; background:orange;
 font:900 9px/.8 monospace; color:red; letter-spacing:5px;
 text-transform:uppercase; text-align:center;
}`;
const figure = (page: Page, caption: string) =>
	page.locator('figure.modular-table-blocks-figure').filter({
		has: page.locator('caption', { hasText: caption }),
	});

test.beforeEach(async ({ page, context }) => {
	await openEditor(page, context);
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const table = (caption: string, attributes = {}) =>
			window.mtbCreateTable(
				{
					caption,
					headerRows: 1,
					columns: [{ width: '50%' }, { width: '50%' }],
					...attributes,
				},
				Array.from({ length: 2 }, (_row, row) =>
					Array.from({ length: 2 }, (_column, column) =>
						createBlock('modular-table-blocks/cell', {}, [
							createBlock('modular-table-blocks/cell-text', {
								content: `Row ${row + 1} column ${column + 1}`,
							}),
						])
					)
				)
			);
		const control = (align: string) =>
			createBlock('core/table', {
				align,
				body: [{ cells: [{ content: 'Core reference', tag: 'td' }] }],
			});
		window.wp.data.dispatch('core/block-editor').resetBlocks([
			createBlock('core/paragraph', { content: 'Before tables' }),
			table('Styled table', {
				className: 'mtb-figure-custom',
				style: {
					color: { background: '#ccddee', text: '#123456' },
					typography: {
						fontSize: '24px',
						lineHeight: '1.6',
						fontWeight: '500',
						fontStyle: 'italic',
						letterSpacing: '2px',
					},
					spacing: { margin: { top: '23px', bottom: '29px' } },
					dimensions: { minHeight: '240px' },
				},
				styleTokens: {
					tableWidth: '80%',
					cellPaddingTop: '10px',
					borderWidth: '2px',
					borderStyle: 'dashed',
					borderColor: '#123456',
				},
			}),
			createBlock('core/table', {
				className: 'mtb-figure-width-reference',
				style: { spacing: { margin: { top: '23px', bottom: '29px' } } },
				body: [{ cells: [{ content: 'Width reference', tag: 'td' }] }],
			}),
			table('Default table'),
			table('Wide table', { align: 'wide' }),
			control('wide'),
			table('Full table', { align: 'full' }),
			control('full'),
			table('Scrollable table caption', {
				responsiveMode: 'scroll',
				columns: [{ width: '600px' }, { width: '600px' }],
			}),
		]);
	});
});

async function publish(page: Page) {
	await page.evaluate(() =>
		window.wp.data
			.dispatch('core/editor')
			.editPost({ title: 'Semantic figure tables', status: 'publish' })
	);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	return page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
}

for (const author of [false, true]) {
	test(`figure preserves semantic tables and native styles after ${author ? 'author' : 'administrator'} save`, async ({
		page,
		context,
	}) => {
		if (author) {
			await openAuthorEditor(page, context);
		}
		const source = await page.evaluate(() =>
			window.wp.data.select('core/editor').getEditedPostContent()
		);
		const editor = await page
			.frameLocator('iframe[name="editor-canvas"]')
			.locator('.modular-table-blocks-editor')
			.first()
			.evaluate((node) => ({
				fontSize: getComputedStyle(node).fontSize,
				viewport: node.ownerDocument.defaultView!.innerWidth,
			}));
		const id = await publish(page);
		await page.reload();
		await expect(
			page
				.frameLocator('iframe[name="editor-canvas"]')
				.locator('.modular-table-blocks-editor')
		).toHaveCount(5);
		expect(
			await page.evaluate(() =>
				window.wp.data.select('core/editor').getEditedPostContent()
			)
		).toBe(source);
		await page.goto(`/?p=${id}`);
		// Fluid typography uses viewport width; compare equal viewport sizes.
		await page.setViewportSize({ width: editor.viewport, height: 900 });
		await page.addStyleTag({ content: host + theme });
		await expect(
			page.locator('figure.modular-table-blocks-figure')
		).toHaveCount(5);
		const wrapper = figure(page, 'Styled table');
		const table = wrapper.locator(':scope > table');
		await expect(table).toHaveClass(/mtb-figure-custom/);
		await expect(wrapper).toHaveAttribute('style', /--mtb-w:80%/);
		await expect(table).toHaveCSS('background-color', 'rgb(204, 221, 238)');
		await expect(table).toHaveCSS('font-size', editor.fontSize);
		await expect(table).toHaveCSS('font-weight', '500');
		await expect(table).toHaveCSS('min-height', '240px');
		await expect(wrapper).toHaveCSS('margin-top', '23px');
		await expect(wrapper).toHaveCSS('margin-bottom', '29px');
		await expect(table).toHaveCSS('margin-top', '0px');
		await expect(table).toHaveCSS('margin-bottom', '0px');
		const cell = table.locator('th').first();
		await expect(cell).toHaveCSS('font-size', editor.fontSize);
		await expect(cell).toHaveCSS('font-weight', '500');
		await expect(cell).toHaveCSS('padding-top', '10px');
		await expect(cell).toHaveCSS('border-top-width', '2px');
		await expect(cell).toHaveCSS('border-top-style', 'dashed');
		await expect(table.getByRole('columnheader')).toHaveCount(2);
		await expect(wrapper.locator('figcaption')).toHaveCount(0);
		await expect(
			wrapper.getByRole('table', { name: 'Styled table', exact: true })
		).toHaveCount(1);
		for (const node of [wrapper, figure(page, 'Default table')]) {
			await expect(node).toHaveCSS('padding-top', '0px');
			await expect(node).toHaveCSS('border-top-width', '0px');
			await expect(node).toHaveCSS('box-shadow', 'none');
			await expect(node).toHaveCSS(
				'background-color',
				'rgba(0, 0, 0, 0)'
			);
		}
		const plain = figure(page, 'Default table').locator(':scope > table');
		await expect(plain).not.toHaveAttribute('style');
		await expect(plain).toHaveCSS('font-size', '20px');
		await expect(plain.locator('th').first()).toHaveCSS(
			'font-weight',
			'700'
		);
		await expect(page.locator('figure.wp-block-table').first()).toHaveCSS(
			'padding-top',
			'19px'
		);
		await expect(
			table.locator(':scope > :not(caption,colgroup,thead,tbody,tfoot)')
		).toHaveCount(0);
		const results = await new AxeBuilder({ page })
			.include('figure.modular-table-blocks-figure')
			.withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
			.analyze();
		expect(results.violations).toEqual([]);
	});
}

test('figure follows native wide and full placement without horizontal figure margins or duplicated alignment', async ({
	page,
}) => {
	const id = await publish(page);
	await page.goto(`/?p=${id}`);
	await page.addStyleTag({
		content: 'figure.mtb-figure-width-reference { width:80%; }',
	});
	const styled = (await figure(page, 'Styled table').boundingBox())!;
	const widthReference = (await page
		.locator('figure.mtb-figure-width-reference')
		.boundingBox())!;
	expect(Math.abs(styled.x - widthReference.x)).toBeLessThan(1);
	expect(Math.abs(styled.width - widthReference.width)).toBeLessThan(1);
	for (const [caption, alignment] of [
		['Wide table', 'wide'],
		['Full table', 'full'],
	]) {
		const wrapper = figure(page, caption);
		const reference = page.locator(
			`figure.wp-block-table.align${alignment}`
		);
		await expect(wrapper).toHaveClass(new RegExp(`align${alignment}`));
		await expect(wrapper.locator('table')).not.toHaveClass(
			/align(wide|full)/
		);
		const actual = (await wrapper.boundingBox())!;
		const expected = (await reference.boundingBox())!;
		expect(Math.abs(actual.x - expected.x)).toBeLessThan(1);
		expect(Math.abs(actual.width - expected.width)).toBeLessThan(1);
	}
	const plain = figure(page, 'Default table');
	const root = plain.locator('..');
	const bounds = (await plain.boundingBox())!;
	const inner = (await plain.locator('table').boundingBox())!;
	const parent = (await root.boundingBox())!;
	const core = (await page
		.locator('figure.wp-block-table.alignwide')
		.boundingBox())!;
	expect(bounds.width).toBeLessThanOrEqual(core.width);
	expect(Math.abs(bounds.x - inner.x)).toBeLessThan(1);
	expect(Math.abs(bounds.width - inner.width)).toBeLessThan(1);
	expect(bounds.x).toBeGreaterThanOrEqual(parent.x);
	await page.screenshot({
		path: test.info().outputPath('figure-desktop.png'),
		fullPage: true,
		animations: 'disabled',
	});
	await page.setViewportSize({ width: 375, height: 900 });
	expect(
		await page.evaluate(
			() =>
				document.documentElement.scrollWidth -
				document.documentElement.clientWidth
		)
	).toBeLessThanOrEqual(1);
	await page.screenshot({
		path: test.info().outputPath('figure-mobile.png'),
		fullPage: true,
		animations: 'disabled',
	});
});

test('figure keeps the named keyboard scroll region and contains wide columns on narrow screens', async ({
	page,
}) => {
	const id = await publish(page);
	await page.goto(`/?p=${id}`);
	await page.setViewportSize({ width: 375, height: 900 });
	const wrapper = figure(page, 'Scrollable table caption');
	await expect(wrapper).not.toHaveAttribute('role');
	const region = wrapper.getByRole('region', {
		name: 'Scrollable table caption',
		exact: true,
	});
	await expect(region).toHaveAttribute('tabindex', '0');
	await expect(region.locator(':scope > table > caption')).toHaveText(
		'Scrollable table caption'
	);
	expect(
		await region.evaluate((node) => node.scrollWidth - node.clientWidth)
	).toBeGreaterThan(100);
	await region.focus();
	await expect(region).toBeFocused();
	await page.keyboard.press('ArrowRight', { delay: 100 });
	await expect
		.poll(() => region.evaluate((node) => node.scrollLeft))
		.toBeGreaterThan(0);
	await expect(region).toBeFocused();
	await expect(region).toHaveCSS('outline-style', 'solid');
	expect(
		await page.evaluate(
			() =>
				document.documentElement.scrollWidth -
				document.documentElement.clientWidth
		)
	).toBeLessThanOrEqual(1);
});

test('native spacing selectors apply theme margins once and preserve explicit overrides in editor and public output', async ({
	page,
}) => {
	const selector = await page.evaluate(() => {
		const block = window.wp.blocks.getBlockType(
			'modular-table-blocks/table'
		) as { selectors?: { spacing?: string } };
		return block.selectors?.spacing;
	});
	expect(selector).toContain('.modular-table-blocks-figure');
	expect(selector).toContain('.modular-table-blocks-editor');
	const declarations = 'margin-top:37px; margin-bottom:31px;';
	const css = `:root :where(${selector}) { ${declarations} }`;
	await page
		.frames()
		.find((frame) => frame.name() === 'editor-canvas')!
		.addStyleTag({
			content: `.editor-styles-wrapper ${selector} { ${declarations} }`,
		});
	const editor = page
		.frameLocator('iframe[name="editor-canvas"]')
		.locator('.modular-table-blocks-editor');
	await expect(editor.nth(1)).toHaveCSS('margin-top', '37px');
	await expect(editor.nth(1)).toHaveCSS('margin-bottom', '31px');
	await expect(editor.first()).toHaveCSS('margin-top', '23px');
	const id = await publish(page);
	await page.goto(`/?p=${id}`);
	await page.addStyleTag({ content: css });
	const plain = figure(page, 'Default table');
	await expect(plain).toHaveCSS('margin-top', '37px');
	await expect(plain).toHaveCSS('margin-bottom', '31px');
	await expect(plain.locator('table')).toHaveCSS('margin-top', '0px');
	await expect(plain.locator('table')).toHaveCSS('margin-bottom', '0px');
	await expect(figure(page, 'Styled table')).toHaveCSS('margin-top', '23px');
	await expect(figure(page, 'Styled table')).toHaveCSS(
		'margin-bottom',
		'29px'
	);
});
