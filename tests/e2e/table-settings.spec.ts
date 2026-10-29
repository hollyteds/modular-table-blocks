import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openEditor } from './login';

const tree = (page: Page) =>
	page.evaluate(
		() => window.wp.data.select('core/block-editor').getBlocks()[0]
	);
const canvas = (page: Page) =>
	page.frameLocator('iframe[name="editor-canvas"]');

async function menu(page: Page, label: string) {
	await page
		.getByRole('button', { name: `${label} options`, exact: true })
		.click();
}

test.beforeEach(async ({ page, context }) => {
	await openEditor(page, context);
	await page.evaluate(() => {
		const { createBlock } = window.wp.blocks;
		const table = window.mtbCreateTable(
			{
				columns: [{ width: '20%' }, { width: '80%' }],
				columnWidthMode: 'auto',
				borderCollapse: 'separate',
				caption: '<strong>Caption</strong>',
				captionEnabled: true,
				captionSide: 'bottom',
				captionAlign: 'right',
				responsiveMode: 'scroll',
				style: { color: { background: '#abcdef' } },
				styleTokens: {
					tableWidth: '80%',
					borderSpacingHorizontal: '12px',
					borderSpacingVertical: '8px',
					borderWidth: '2px',
					cellPaddingTop: '6px',
				},
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
	await page.getByRole('tab', { name: 'Settings', exact: true }).click();
});

for (const label of [
	'Column widths',
	'Cell spacing',
	'Table width',
	'Caption',
]) {
	test(`native ${label} header resets only its section using current values and one undo restores it`, async ({
		page,
	}) => {
		await expect(
			page.getByRole('heading', { name: label, exact: true })
		).toBeVisible();
		// Update after panel registration to catch stale callbacks on older WP versions.
		await page.evaluate(() => {
			const table = window.wp.data
				.select('core/block-editor')
				.getBlocks()[0];
			window.wp.data
				.dispatch('core/block-editor')
				.updateBlockAttributes(table.clientId, {
					caption: '<em>Latest caption</em>',
					styleTokens: {
						...(table.attributes.styleTokens as object),
						tableWidth: '640px',
						borderSpacingHorizontal: '17px',
						borderSpacingVertical: '0px',
					},
				});
		});
		const before = await tree(page);
		await menu(page, label);
		const opened = page.getByRole('menu', {
			name: `${label} options`,
			exact: true,
		});
		// Cover the native item reset as well as the panel's Reset all action.
		await opened
			.getByRole('menuitem', {
				name:
					label === 'Column widths' ? `Reset ${label}` : 'Reset all',
				exact: true,
			})
			.click();
		const after = await tree(page);
		expect(after.innerBlocks).toEqual(before.innerBlocks);
		const expected = { ...before.attributes };
		const tokens = { ...(expected.styleTokens as Record<string, string>) };
		if (label === 'Column widths') {
			delete expected.columnWidthMode;
			expected.columns = [{}, {}];
			await expect(
				page.getByRole('radio', { name: 'Equal width', exact: true })
			).toBeChecked();
		} else if (label === 'Cell spacing') {
			delete expected.borderCollapse;
			delete tokens.borderSpacingHorizontal;
			delete tokens.borderSpacingVertical;
			expected.styleTokens = tokens;
			await expect(
				page.getByRole('radio', {
					name: 'Collapse borders',
					exact: true,
				})
			).toBeChecked();
		} else if (label === 'Table width') {
			delete tokens.tableWidth;
			expected.styleTokens = tokens;
			const section = page.getByRole('group', {
				name: 'Table width',
				exact: true,
			});
			await expect(
				section.getByRole('spinbutton', {
					name: 'Table width',
					exact: true,
				})
			).toHaveValue('');
			await expect(
				section.getByRole('combobox', {
					name: 'Select unit',
					exact: true,
				})
			).toHaveValue('%');
		} else {
			expected.captionEnabled = false;
			delete expected.captionSide;
			delete expected.captionAlign;
			await expect(
				canvas(page).getByRole('textbox', {
					name: 'Caption',
					exact: true,
				})
			).toHaveCount(0);
			expect(after.attributes.caption).toBe('<em>Latest caption</em>');
		}
		expect(after.attributes).toEqual(expected);
		await page.getByRole('button', { name: 'Undo', exact: true }).click();
		await expect
			.poll(async () => (await tree(page)).attributes)
			.toEqual(before.attributes);
		await page.getByRole('button', { name: 'Redo', exact: true }).click();
		await expect
			.poll(async () => (await tree(page)).attributes)
			.toEqual(after.attributes);
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').savePost()
		);
		await page.reload();
		await expect(
			canvas(page).locator('.modular-table-blocks-editor')
		).toBeVisible();
		const restored = await tree(page);
		// WordPress may serialize empty column objects as arrays during save.
		// Compare their fields without treating that PHP representation as a width.
		expect({
			...restored.attributes,
			columns: (
				restored.attributes.columns as Record<string, unknown>[]
			).map((column) => ({ ...column })),
		}).toEqual(after.attributes);
	});
}

test('all four headers stay visible without initializing attributes and disabled resets work with the keyboard', async ({
	page,
}) => {
	await page.evaluate(() => {
		const previous = window.wp.data
			.select('core/block-editor')
			.getBlocks()[0];
		const table = window.wp.blocks.createBlock(
			previous.name,
			{ columns: [{}, {}], rowCount: 2 },
			previous.innerBlocks.map((cell) =>
				window.wp.blocks.cloneBlock(cell)
			)
		);
		window.wp.data.dispatch('core/block-editor').resetBlocks([table]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(table.clientId);
	});
	const before = await tree(page);
	for (const label of [
		'Column widths',
		'Cell spacing',
		'Table width',
		'Caption',
	]) {
		const opener = page.getByRole('button', {
			name: `${label} options`,
			exact: true,
		});
		await opener.focus();
		await opener.press('Enter');
		const opened = page.getByRole('menu', {
			name: `${label} options`,
			exact: true,
		});
		await expect(opened).toBeVisible();
		await expect(
			opened.getByRole('menuitemcheckbox', { name: label, exact: true })
		).toBeFocused();
		await expect(
			page
				.getByRole('menu', { name: `${label} options`, exact: true })
				.getByRole('menuitem', { name: 'Reset all', exact: true })
		).toBeDisabled();
		await page.keyboard.press('Escape');
		await expect(opener).toHaveAttribute('aria-expanded', 'false');
		await expect(
			page.getByRole('menu', { name: `${label} options`, exact: true })
		).toBeHidden();
		await expect(opener).toBeFocused();
	}
	expect(await tree(page)).toEqual(before);
	await page.screenshot({
		path: test.info().outputPath('settings-tools-headers.png'),
		animations: 'disabled',
	});
});

test('section resets remain scoped when switching between tables', async ({
	page,
}) => {
	await page.evaluate(() => {
		const first = window.wp.data.select('core/block-editor').getBlocks()[0];
		const second = window.wp.blocks.createBlock(
			first.name,
			{ ...first.attributes, styleTokens: { tableWidth: '60%' } },
			first.innerBlocks.map((cell) => window.wp.blocks.cloneBlock(cell))
		);
		window.wp.data.dispatch('core/block-editor').insertBlocks([second]);
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(first.clientId);
	});
	await menu(page, 'Table width');
	await page
		.getByRole('menuitem', { name: 'Reset all', exact: true })
		.click();
	await expect
		.poll(() =>
			page.evaluate(() =>
				window.wp.data
					.select('core/block-editor')
					.getBlocks()
					.map(
						(table) =>
							(
								table.attributes.styleTokens as Record<
									string,
									string
								>
							)?.tableWidth
					)
			)
		)
		.toEqual([undefined, '60%']);
	await page.evaluate(() =>
		window.wp.data
			.dispatch('core/block-editor')
			.selectBlock(
				window.wp.data.select('core/block-editor').getBlocks()[1]
					.clientId
			)
	);
	await menu(page, 'Table width');
	await page
		.getByRole('menuitem', { name: 'Reset all', exact: true })
		.click();
	await expect
		.poll(() =>
			page.evaluate(() =>
				window.wp.data
					.select('core/block-editor')
					.getBlocks()
					.map(
						(table) =>
							(
								table.attributes.styleTokens as Record<
									string,
									string
								>
							)?.tableWidth
					)
			)
		)
		.toEqual([undefined, undefined]);
});
