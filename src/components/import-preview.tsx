import { Button } from '@wordpress/components';
import { useMemo } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { placements } from '../grid/layout';
import type { BlockTree } from '../grid/operations';
import { plainCellText } from '../import/parse-html';
import type { ImportData } from '../import/types';

function blockText(block: BlockTree): string {
	return [
		String(
			block.attributes.content ??
				block.attributes.text ??
				block.attributes.alt ??
				''
		),
		...block.innerBlocks.map(blockText),
	]
		.filter(Boolean)
		.join('\n');
}

export default function ImportPreview({
	title,
	table,
	data,
	anchor,
	original,
	onAnchor,
}: {
	title: string;
	table: BlockTree;
	data?: ImportData;
	anchor: { row: number; column: number };
	original?: BlockTree;
	onAnchor?: (row: number, column: number) => void;
}) {
	const cells = useMemo(() => placements(table), [table]);
	const texts = useMemo(
		() =>
			new Map(
				cells.map((p) => [
					p.cell,
					plainCellText(p.cell.innerBlocks.map(blockText).join('\n')),
				])
			),
		[cells]
	);
	const rows = Number(table.attributes.rowCount);
	const columns = (table.attributes.columns as unknown[]).length;
	const oldRows = original ? Number(original.attributes.rowCount) : rows;
	const oldColumns = original
		? (original.attributes.columns as unknown[]).length
		: columns;
	const imported = useMemo(
		() =>
			new Set(
				data?.cells.map(
					(cell) =>
						`${anchor.row + cell.row}:${anchor.column + cell.column}`
				)
			),
		[data, anchor.row, anchor.column]
	);
	const byRow = useMemo(
		() =>
			Array.from({ length: rows }, (_, r) =>
				cells.filter((cell) => cell.row === r)
			),
		[rows, cells]
	);
	return (
		<section>
			<h2>{title}</h2>
			<div
				className="modular-table-blocks-import__scroll"
				tabIndex={0}
				role="region"
				aria-label={title}
			>
				<table>
					<thead>
						<tr>
							<th scope="col">
								<span className="screen-reader-text">
									{__('Rows', 'modular-table-blocks')}
								</span>
							</th>
							{Array.from({ length: columns }, (_, c) => (
								<th scope="col" key={c}>
									{c + 1}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{byRow.map((row, r) => (
							<tr key={r}>
								<th scope="row">{r + 1}</th>
								{row.map((p) => {
									const key = `${p.row}:${p.column}`;
									const selected = onAnchor
										? p.row === anchor.row &&
											p.column === anchor.column
										: imported.has(key);
									const added =
										p.row >= oldRows ||
										p.column >= oldColumns;
									const value = texts.get(p.cell) || '—';
									return (
										<td
											key={key}
											rowSpan={p.height}
											colSpan={p.width}
											data-mtb-import-selected={
												selected || undefined
											}
											data-mtb-import-added={
												added || undefined
											}
										>
											{onAnchor ? (
												<Button
													variant={
														selected
															? 'primary'
															: 'tertiary'
													}
													aria-pressed={selected}
													label={sprintf(
														/* translators: 1: row number, 2: column number. */ __(
															'Row %1$d, column %2$d',
															'modular-table-blocks'
														),
														p.row + 1,
														p.column + 1
													)}
													onClick={() =>
														onAnchor(
															p.row,
															p.column
														)
													}
												>
													{value}
												</Button>
											) : (
												<span>{value}</span>
											)}
										</td>
									);
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}
