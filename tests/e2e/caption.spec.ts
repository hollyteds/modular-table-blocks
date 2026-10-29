import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openEditor, openAuthorEditor } from './login';

const canvas = (page: Page) =>
	page.frameLocator('iframe[name="editor-canvas"]');
const caption = (page: Page) =>
	canvas(page).getByRole('textbox', { name: 'Caption', exact: true });
const attributes = (page: Page) =>
	page.evaluate(
		() =>
			window.wp.data.select('core/block-editor').getBlocks()[0].attributes
	);
const controls = (page: Page) =>
	page.getByRole('group', { name: 'Caption', exact: true });

async function settings(page: Page) {
	await page.getByRole('tab', { name: 'Settings', exact: true }).click();
}

async function align(page: Page, value: 'left' | 'center' | 'right') {
	await controls(page)
		.getByRole('button', { name: 'Caption alignment', exact: true })
		.click();
	await page
		.getByRole('menuitemradio', {
			name: `Align text ${value}`,
			exact: true,
		})
		.click();
}

async function publish(page: Page) {
	await page.evaluate(() =>
		window.wp.data
			.dispatch('core/editor')
			.editPost({ title: 'Inline captions', status: 'publish' })
	);
	await page.evaluate(() =>
		window.wp.data.dispatch('core/editor').savePost()
	);
	return page.evaluate(() =>
		window.wp.data.select('core/editor').getCurrentPostId()
	);
}

test.beforeEach(async ({ page, context }) => {
	await openEditor(page, context);
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const table = window.mtbCreateTable(
			{
				columns: [{}, {}],
				responsiveMode: 'scroll',
				style: { dimensions: { minHeight: '280px' } },
			},
			Array.from({ length: 2 }, () =>
				Array.from({ length: 2 }, () =>
					createBlock('modular-table-blocks/cell', {}, [
						createBlock('modular-table-blocks/cell-text', {
							content: 'Cell',
						}),
					])
				)
			)
		);
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.clientId);
	});
	await settings(page);
});

test('inline caption controls preserve content through positions alignment visibility undo and an empty edit', async ({
	page,
}) => {
	const original = await page.evaluate(
		() =>
			window.wp.data.select('core/block-editor').getBlocks()[0]
				.innerBlocks
	);
	await expect(
		controls(page).getByRole('checkbox', {
			name: 'Display caption',
			exact: true,
		})
	).not.toBeChecked();
	await expect(caption(page)).toHaveCount(0);
	await expect(
		page.getByRole('textbox', { name: 'Caption', exact: true })
	).toHaveCount(0);
	await controls(page)
		.getByRole('checkbox', { name: 'Display caption', exact: true })
		.check();
	await expect(caption(page)).toBeVisible();
	await caption(page).fill('Caption < A & B');
	await expect
		.poll(async () => (await attributes(page)).caption)
		.toBe('Caption &lt; A &amp; B');
	const editor = canvas(page).locator('.modular-table-blocks-editor');
	const grid = editor.locator('.modular-table-blocks-editor__cells');
	await expect
		.poll(
			async () =>
				(await caption(page).boundingBox())!.y +
				(await caption(page).boundingBox())!.height -
				(await grid.boundingBox())!.y
		)
		.toBeLessThan(1);
	await controls(page)
		.getByRole('radio', { name: 'Below table', exact: true })
		.click();
	await align(page, 'center');
	await expect(caption(page)).toHaveCSS('text-align', 'center');
	await expect
		.poll(
			async () =>
				(await grid.boundingBox())!.y +
				(await grid.boundingBox())!.height -
				(await caption(page).boundingBox())!.y
		)
		.toBeLessThan(1);
	await expect(editor).toHaveCSS('min-height', '280px');
	await expect(
		grid.locator('.modular-table-blocks-editor__cell').first()
	).not.toHaveCSS('text-align', 'center');
	await align(page, 'right');
	await expect(caption(page)).toHaveCSS('text-align', 'right');
	const text = (await attributes(page)).caption;
	await controls(page)
		.getByRole('checkbox', { name: 'Display caption', exact: true })
		.uncheck();
	await expect(caption(page)).toHaveCount(0);
	expect((await attributes(page)).caption).toBe(text);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(caption(page)).toHaveText('Caption < A & B');
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	await expect(caption(page)).toHaveCount(0);
	await controls(page)
		.getByRole('checkbox', { name: 'Display caption', exact: true })
		.check();
	await expect(caption(page)).toHaveText('Caption < A & B');
	await caption(page).fill('');
	await expect(caption(page)).toBeVisible();
	await expect.poll(async () => (await attributes(page)).caption).toBe('');
	expect((await attributes(page)).captionEnabled).toBe(true);
	expect(
		await page.evaluate(
			() =>
				window.wp.data.select('core/block-editor').getBlocks()[0]
					.innerBlocks
		)
	).toEqual(original);
	const id = await publish(page);
	await page.goto(`/?p=${id}`);
	await expect(
		page.locator('table.wp-block-modular-table-blocks-table > caption')
	).toHaveCount(0);
	await expect(page.locator('.modular-table-blocks-scroll')).toHaveAttribute(
		'aria-label',
		'Scrollable table'
	);
});

for (const author of [false, true]) {
	test(`rich caption and placement survive ${author ? 'author' : 'administrator'} reload and public output and hidden captions leave no public label`, async ({
		page,
		context,
	}) => {
		await controls(page)
			.getByRole('checkbox', { name: 'Display caption', exact: true })
			.check();
		await caption(page).fill('Caption ');
		await caption(page).press('End');
		await page.keyboard.press('ControlOrMeta+b');
		await page.keyboard.type('bold');
		await page.keyboard.press('ControlOrMeta+b');
		await page.keyboard.type(' & <literal>');
		await expect
			.poll(async () => String((await attributes(page)).caption))
			.toContain('<strong>bold</strong>');
		await controls(page)
			.getByRole('radio', { name: 'Below table', exact: true })
			.click();
		await align(page, 'right');
		if (author) {
			await openAuthorEditor(page, context);
		}
		const cellSource = await page.evaluate(() =>
			window.wp.blocks.serialize(
				window.wp.data.select('core/block-editor').getBlocks()[0]
					.innerBlocks
			)
		);
		const id = await publish(page);
		await page.reload();
		await expect(caption(page)).toHaveText('Caption bold & <literal>');
		expect(
			await page.evaluate(() =>
				window.wp.blocks.serialize(
					window.wp.data.select('core/block-editor').getBlocks()[0]
						.innerBlocks
				)
			)
		).toBe(cellSource);
		const reloaded = await page.evaluate(() =>
			window.wp.data.select('core/editor').getEditedPostContent()
		);
		await page.reload();
		await expect(caption(page)).toHaveText('Caption bold & <literal>');
		expect(
			await page.evaluate(() =>
				window.wp.data.select('core/editor').getEditedPostContent()
			)
		).toBe(reloaded);
		await expect(caption(page)).toHaveCSS('text-align', 'right');
		await page.evaluate(() =>
			window.wp.data
				.dispatch('core/block-editor')
				.selectBlock(
					window.wp.data.select('core/block-editor').getBlocks()[0]
						.clientId
				)
		);
		await settings(page);
		await expect(
			controls(page).getByRole('radio', {
				name: 'Below table',
				exact: true,
			})
		).toBeChecked();
		await controls(page).scrollIntoViewIfNeeded();
		await page.screenshot({
			path: test.info().outputPath('inline-caption-settings.png'),
			animations: 'disabled',
		});
		const front = await context.newPage();
		try {
			await front.goto(`/?p=${id}`);
			await front.addStyleTag({
				content:
					'caption { caption-side:top; text-align:left; padding:40px; }',
			});
			const table = front.locator(
				'table.wp-block-modular-table-blocks-table'
			);
			const publicCaption = table.locator(':scope > caption');
			await expect(publicCaption).toHaveText('Caption bold & <literal>');
			await expect(publicCaption.locator('strong')).toHaveText('bold');
			await expect(publicCaption).toHaveCSS('caption-side', 'bottom');
			await expect(publicCaption).toHaveCSS('text-align', 'right');
			await expect(
				table.locator(':scope > :first-child')
			).toHaveJSProperty('tagName', 'CAPTION');
			await expect(front.locator('figcaption')).toHaveCount(0);
			await expect(
				front.locator('.modular-table-blocks-scroll')
			).toHaveAttribute('aria-label', 'Caption bold & <literal>');
			await expect
				.poll(
					async () =>
						(await table.locator('tbody').boundingBox())!.y +
						(await table.locator('tbody').boundingBox())!.height -
						(await publicCaption.boundingBox())!.y
				)
				.toBeLessThan(1);
			await front.addStyleTag({
				url: '/wp-content/plugins/modular-table-blocks/build/style-index-rtl.css',
			});
			await front.addStyleTag({ content: 'html { direction:rtl; }' });
			await expect(publicCaption).toHaveCSS('text-align', 'right');
			await controls(page)
				.getByRole('checkbox', { name: 'Display caption', exact: true })
				.uncheck();
			await page.evaluate(() =>
				window.wp.data.dispatch('core/editor').savePost()
			);
			await front.reload();
			await expect(front.locator('caption')).toHaveCount(0);
			await expect(
				front.locator('.modular-table-blocks-scroll')
			).toHaveAttribute('aria-label', 'Scrollable table');
			expect((await attributes(page)).caption).toContain(
				'<strong>bold</strong>'
			);
		} finally {
			await front.close();
		}
	});
}

test('caption controls belong to the selected table and do not affect another table', async ({
	page,
}) => {
	await page.evaluate(() => {
		const original = window.wp.data
			.select('core/block-editor')
			.getBlocks()[0];
		const { createBlock, cloneBlock } = window.wp.blocks;
		window.wp.data.dispatch('core/block-editor').resetBlocks([
			createBlock(
				original.name,
				{
					...original.attributes,
					caption: 'First caption',
					captionSide: 'bottom',
					captionAlign: 'left',
				},
				original.innerBlocks.map((cell) => cloneBlock(cell))
			),
			createBlock(
				original.name,
				{
					...original.attributes,
					caption: 'Second caption',
					captionSide: 'top',
					captionAlign: 'center',
				},
				original.innerBlocks.map((cell) => cloneBlock(cell))
			),
		]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(
				window.wp.data.select('core/block-editor').getBlocks()[0]
					.clientId
			);
	});
	await expect(caption(page)).toHaveCount(2);
	await caption(page).first().fill('First edited');
	await controls(page)
		.getByRole('checkbox', { name: 'Display caption', exact: true })
		.uncheck();
	await expect(caption(page)).toHaveCount(1);
	await expect(caption(page)).toHaveText('Second caption');
	await expect(caption(page)).toHaveCSS('text-align', 'center');
	const id = await publish(page);
	await page.goto(`/?p=${id}`);
	await expect(page.locator('caption')).toHaveCount(1);
	await expect(page.locator('caption')).toHaveText('Second caption');
	await expect(page.locator('caption')).toHaveCSS('caption-side', 'top');
});
