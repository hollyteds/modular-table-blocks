import { test, expect } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { openEditor } from './login';

for (const selector of ['td, th', ':root:root table td, :root:root table th']) {
	test(`public cell styles override theme defaults (${selector})`, async ({
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
			window.wp.data.dispatch('core/block-editor').resetBlocks([
				createBlock(
					'modular-table-blocks/table',
					{
						columns: [{}, {}, {}],
						headerRows: 1,
						styleTokens: {
							borderColor: '#123456',
							borderWidth: '3px',
							borderStyle: 'solid',
							cellPaddingBlock: '11px',
							cellPaddingInline: '13px',
							cellBackgroundColor: '#e5e7eb',
							textColor: '#112233',
						},
					},
					[
						createBlock(
							'modular-table-blocks/row',
							{ styleTokens: { cellPaddingInline: '23px' } },
							[
								cell('Cell override', {
									styleTokens: {
										cellPaddingBlock: '17px',
										cellPaddingInline: '19px',
										borderColor: '#008800',
										borderStyle: 'dotted',
										borderWidth: '4px',
									},
								}),
								cell('Row override', {
									verticalAlign: 'middle',
									horizontalAlign: 'right',
								}),
								cell('Bottom aligned', {
									verticalAlign: 'bottom',
								}),
							]
						),
						createBlock('modular-table-blocks/row', {}, [
							cell('No border or padding', {
								styleTokens: {
									borderStyle: 'none',
									cellPaddingBlock: '0',
									cellPaddingInline: '0',
								},
							}),
							cell('Table override'),
							cell('Table override 2'),
						]),
					]
				),
				createBlock('modular-table-blocks/table', { columns: [{}] }, [
					createBlock('modular-table-blocks/row', {}, [
						cell('Site override'),
					]),
				]),
				createBlock('core/table', {
					body: [
						{
							cells: [
								{ content: 'Other table data', tag: 'td' },
								{ content: 'Other table header', tag: 'th' },
							],
						},
					],
				}),
			]);
			window.wp.data.dispatch('core/editor').editPost({
				title: 'MTB theme compatibility',
				status: 'publish',
			});
		});
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').savePost()
		);
		const postId = await page.evaluate(() =>
			window.wp.data.select('core/editor').getCurrentPostId()
		);
		await page.goto(`/?p=${postId}`);
		// Loaded after the plugin CSS to exercise both specificity and importance.
		await page.addStyleTag({
			content: `
				:root {
					--ark-color--border--table: #ee00aa;
					--ark-padding--cell: 41px 43px;
					--mtb-border-color: #224466;
					--mtb-border-width: 2px;
					--mtb-border-style: dashed;
					--mtb-cell-padding-block: 18px;
					--mtb-cell-padding-inline: 20px;
				}
				${selector} {
					border-bottom: 1px solid var(--ark-color--border--table);
					border-left: 1px solid var(--ark-color--border--table);
					padding: var(--ark-padding--cell, .5em .75em) !important;
					vertical-align: top;
					word-break: break-all;
					text-align: center;
					background-color: #ddccff;
					color: #aa0000;
				}
			`,
		});
		const tables = page.locator(
			'table.wp-block-modular-table-blocks-table'
		);
		await expect(tables).toHaveCount(2);
		const cells = tables
			.first()
			.locator('.wp-block-modular-table-blocks-cell');
		await expect(cells.nth(0)).toHaveJSProperty('tagName', 'TH');
		await expect(cells.nth(3)).toHaveJSProperty('tagName', 'TD');
		const checkPadding = async (
			target: Locator,
			block: string,
			inline: string
		) => {
			for (const side of ['top', 'bottom']) {
				await expect(target).toHaveCSS(`padding-${side}`, block);
			}
			for (const side of ['left', 'right']) {
				await expect(target).toHaveCSS(`padding-${side}`, inline);
			}
		};
		await checkPadding(cells.nth(0), '17px', '19px');
		await checkPadding(cells.nth(1), '11px', '23px');
		await checkPadding(cells.nth(3), '0px', '0px');
		await checkPadding(cells.nth(4), '11px', '13px');
		const siteCell = tables.nth(1).locator('td');
		await checkPadding(siteCell, '18px', '20px');
		for (const side of ['top', 'right', 'bottom', 'left']) {
			await expect(cells.nth(0)).toHaveCSS(
				`border-${side}-color`,
				'rgb(0, 136, 0)'
			);
			await expect(cells.nth(0)).toHaveCSS(`border-${side}-width`, '4px');
			await expect(cells.nth(0)).toHaveCSS(
				`border-${side}-style`,
				'dotted'
			);
			await expect(cells.nth(3)).toHaveCSS(
				`border-${side}-style`,
				'none'
			);
			await expect(cells.nth(4)).toHaveCSS(
				`border-${side}-color`,
				'rgb(18, 52, 86)'
			);
			await expect(siteCell).toHaveCSS(
				`border-${side}-color`,
				'rgb(34, 68, 102)'
			);
		}
		await expect(cells.nth(1)).toHaveCSS('vertical-align', 'middle');
		await expect(cells.nth(2)).toHaveCSS('vertical-align', 'bottom');
		await expect(cells.nth(4)).toHaveCSS('vertical-align', 'top');
		await expect(cells.nth(1)).toHaveCSS('text-align', 'right');
		await expect(cells.nth(4)).toHaveCSS(
			'text-align',
			await tables
				.first()
				.evaluate((node) => getComputedStyle(node).textAlign)
		);
		await expect(cells.nth(0)).toHaveCSS('color', 'rgb(17, 34, 51)');
		await expect(cells.nth(4)).toHaveCSS(
			'background-color',
			'rgb(229, 231, 235)'
		);
		await expect(cells.nth(0)).toHaveCSS('word-break', 'normal');
		await expect(cells.nth(4)).toHaveCSS('word-break', 'normal');
		const other = page.locator('.wp-block-table table');
		await expect(other.locator('td')).toHaveCSS('padding-top', '41px');
		await expect(other.locator('th')).toHaveCSS('padding-right', '43px');
		await expect(other.locator('td')).toHaveCSS('color', 'rgb(170, 0, 0)');
		await page.addStyleTag({
			content:
				':root { --mtb-cell-padding-block: 22px; --mtb-cell-padding-inline: 24px; --mtb-border-color: #660066; }',
		});
		await checkPadding(siteCell, '22px', '24px');
		await checkPadding(cells.nth(0), '17px', '19px');
		await expect(siteCell).toHaveCSS(
			'border-left-color',
			'rgb(102, 0, 102)'
		);
		await page.setViewportSize({ width: 375, height: 812 });
		await expect(cells.nth(0)).toHaveCSS('display', 'table-cell');
		await expect(cells.nth(4)).toHaveCSS('display', 'table-cell');
		await page.screenshot({
			path: test.info().outputPath('theme-styles.png'),
			fullPage: true,
		});
	});
}

for (const selector of ['table', ':root table']) {
	test(`public table has no outer border over theme defaults (${selector})`, async ({
		page,
		context,
	}) => {
		await openEditor(page, context);
		await page.evaluate(() => {
			const { createBlock } = window.wp.blocks;
			const table = (borderStyle: string, className = '') =>
				createBlock(
					'modular-table-blocks/table',
					{
						columns: [{}, {}],
						headerRows: 1,
						className,
						styleTokens: {
							borderWidth: '3px',
							borderStyle,
							borderColor: '#123456',
						},
					},
					['Heading', 'Data'].map((text) =>
						createBlock('modular-table-blocks/row', {}, [
							createBlock('modular-table-blocks/cell', {}, [
								createBlock('core/paragraph', {
									content: `${text} one`,
								}),
							]),
							createBlock('modular-table-blocks/cell', {}, [
								createBlock('core/paragraph', {
									content: `${text} two`,
								}),
							]),
						])
					)
				);
			window.wp.data.dispatch('core/block-editor').resetBlocks([
				table('solid'),
				table('none', 'mtb-explicit-outer-border'),
				createBlock('core/table', {
					body: [{ cells: [{ content: 'Other table', tag: 'td' }] }],
				}),
			]);
			window.wp.data
				.dispatch('core/editor')
				.editPost({ title: 'Table border reset', status: 'publish' });
		});
		await page.evaluate(() =>
			window.wp.data.dispatch('core/editor').savePost()
		);
		const postId = await page.evaluate(() =>
			window.wp.data.select('core/editor').getCurrentPostId()
		);
		await page.goto(`/?p=${postId}`);
		await page.addStyleTag({
			content: `${selector} { border: 17px solid #ee00aa; }`,
		});
		const tables = page.locator(
			'table.wp-block-modular-table-blocks-table'
		);
		await expect(tables).toHaveCount(2);
		for (const side of ['top', 'right', 'bottom', 'left']) {
			for (const table of await tables.all()) {
				await expect(table).toHaveCSS(`border-${side}-style`, 'none');
				await expect(table).toHaveCSS(`border-${side}-width`, '0px');
			}
			for (const cell of await tables.first().locator('td, th').all()) {
				await expect(cell).toHaveCSS(`border-${side}-style`, 'solid');
				await expect(cell).toHaveCSS(`border-${side}-width`, '3px');
				await expect(cell).toHaveCSS(
					`border-${side}-color`,
					'rgb(18, 52, 86)'
				);
			}
			await expect(tables.nth(1).locator('td').first()).toHaveCSS(
				`border-${side}-style`,
				'none'
			);
			await expect(page.locator('.wp-block-table table')).toHaveCSS(
				`border-${side}-width`,
				'17px'
			);
		}
		await page.setViewportSize({ width: 375, height: 812 });
		await expect(tables.first()).toHaveCSS('border-top-style', 'none');
		await expect(tables.first().locator('th').first()).toHaveCSS(
			'border-top-width',
			'3px'
		);
		// The reset is a default, so explicitly scoped custom CSS can restore an outer border.
		await page.addStyleTag({
			content:
				':root table.wp-block-modular-table-blocks-table.mtb-explicit-outer-border { border: 5px dashed #008800; }',
		});
		await expect(tables.nth(1)).toHaveCSS('border-top-style', 'dashed');
		await expect(tables.nth(1)).toHaveCSS('border-top-width', '5px');
		await page.screenshot({
			path: test.info().outputPath('table-border-default.png'),
			fullPage: true,
		});
	});
}
