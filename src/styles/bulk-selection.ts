import type { BulkSelection } from './bulk';

export type TrackBounds = { start: number; end: number };
export type SelectionBox = {
	left: number;
	top: number;
	width: number;
	height: number;
};

/**
 * Derive outlines from logical tracks, independently of physical cell spans.
 * @param selection
 * @param columns
 * @param rows
 */
export function selectionBoxes(
	selection: BulkSelection,
	columns: TrackBounds[],
	rows: TrackBounds[]
): SelectionBox[] {
	if (!columns.length || !rows.length) {
		return [];
	}
	const tracks = selection.mode === 'rows' ? rows : columns;
	const allIndices = selection.all
		? tracks.map((_track, index) => index)
		: [];
	const indices =
		selection.mode === 'all'
			? allIndices
			: [...new Set(selection.indices)]
					.filter(
						(index) =>
							Number.isInteger(index) &&
							index >= 0 &&
							index < tracks.length
					)
					.sort((a, b) => a - b);
	const runs: { start: number; end: number }[] = [];
	for (const index of indices) {
		const last = runs[runs.length - 1];
		if (last && index === last.end + 1) {
			last.end = index;
		} else {
			runs.push({ start: index, end: index });
		}
	}
	return runs.flatMap((run) => {
		const horizontal = selection.mode === 'columns';
		const vertical = selection.mode === 'rows';
		const left = columns[horizontal ? run.start : 0].start;
		const right = columns[horizontal ? run.end : columns.length - 1].end;
		const top = rows[vertical ? run.start : 0].start;
		const bottom = rows[vertical ? run.end : rows.length - 1].end;
		return right > left && bottom > top
			? [{ left, top, width: right - left, height: bottom - top }]
			: [];
	});
}
