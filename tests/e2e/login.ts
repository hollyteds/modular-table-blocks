import { expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

export async function openEditor(
	page: Page,
	context: BrowserContext,
	username = process.env.WP_USERNAME || 'admin',
	password = process.env.WP_PASSWORD || 'password'
) {
	// Test fixture builder: logical row arrays become the canonical flat tree.
	await page.addInitScript(() => {
		window.mtbMergeCells = (table, row, column, height, width) =>
			table.innerBlocks
				.filter(
					(cell) =>
						(cell.attributes.row === row &&
							cell.attributes.column === column) ||
						Number(cell.attributes.row) < row ||
						Number(cell.attributes.row) >= row + height ||
						Number(cell.attributes.column) < column ||
						Number(cell.attributes.column) >= column + width
				)
				.map((cell) =>
					cell.attributes.row === row &&
					cell.attributes.column === column
						? {
								...cell,
								attributes: {
									...cell.attributes,
									rowSpan: height,
									colSpan: width,
								},
							}
						: cell
				);
		window.mtbRows = (table) =>
			Array.from({ length: Number(table.attributes.rowCount) }, (_, r) =>
				table.innerBlocks.filter((cell) => cell.attributes.row === r)
			);
		window.mtbCreateTable = (attributes, rows) => {
			const columns = (attributes.columns as unknown[] | undefined) ?? [
				{},
				{},
				{},
			];
			const occupied: boolean[][] = Array.from(
				{ length: rows.length },
				() => []
			);
			const cells = rows.flatMap((row, r) => {
				let column = 0;
				return row.map((cell) => {
					while (occupied[r][column]) {
						column++;
					}
					const c = column;
					const width = Number(cell.attributes.colSpan ?? 1);
					const height = Number(cell.attributes.rowSpan ?? 1);
					for (
						let i = r;
						i < Math.min(rows.length, r + height);
						i++
					) {
						for (let j = c; j < c + width; j++) {
							occupied[i][j] = true;
						}
					}
					column += width;
					return {
						...cell,
						attributes: { ...cell.attributes, row: r, column: c },
					};
				});
			});
			return window.wp.blocks.createBlock(
				'modular-table-blocks/table',
				{ ...attributes, columns, rowCount: rows.length },
				cells
			);
		};
	});
	await context.clearCookies();
	await context.request.get('/wp-login.php');
	const response = await context.request.post('/wp-login.php', {
		form: {
			log: username,
			pwd: password,
			testcookie: '1',
			redirect_to: '/wp-admin/',
		},
	});
	expect(new URL(response.url()).pathname).toMatch(/^\/wp-admin\//);
	await page.goto('/wp-admin/post-new.php');
	await page.waitForFunction(
		() => !!window.wp?.blocks?.getBlockType('modular-table-blocks/table')
	);
	const close = page.getByRole('button', { name: 'Close', exact: true });
	if (await close.isVisible()) {
		await close.click();
	}
	// WordPress persists sidebar closure per user, including at mobile widths.
	// Start each editor fixture with its normal settings sidebar available.
	const settings = page.getByRole('button', {
		name: /^(Settings|設定)$/,
		exact: true,
	});
	if ((await settings.getAttribute('aria-pressed')) !== 'true') {
		await settings.click();
	}
}

export async function openAuthorEditor(page: Page, context: BrowserContext) {
	const source = await page.evaluate(async () => {
		const existing = await window.wp.apiFetch<Array<{ id: number }>>({
			path: '/wp/v2/users?slug=mtb-reload-author&context=edit',
		});
		if (existing.length === 0) {
			await window.wp.apiFetch({
				path: '/wp/v2/users',
				method: 'POST',
				data: {
					username: 'mtb-reload-author',
					email: 'mtb-reload-author@example.test',
					password: 'password',
					roles: ['author'],
				},
			});
		}
		return window.wp.blocks.serialize(
			window.wp.data.select('core/block-editor').getBlocks()
		);
	});
	await openEditor(page, context, 'mtb-reload-author', 'password');
	const currentUser = await page.evaluate(() =>
		window.wp.apiFetch<{ roles: string[] }>({
			path: '/wp/v2/users/me?context=edit',
		})
	);
	expect(currentUser.roles).toContain('author');
	await page.evaluate(
		(serialized) =>
			window.wp.data
				.dispatch('core/block-editor')
				.resetBlocks(window.wp.blocks.parse(serialized)),
		source
	);
}
