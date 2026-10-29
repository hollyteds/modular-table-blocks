import { useLayoutEffect, useRef, useState } from '@wordpress/element';
import type { ReactNode } from 'react';
import type { BulkSelection } from '../styles/bulk';
import { selectionBoxes } from '../styles/bulk-selection';
import type { TrackBounds } from '../styles/bulk-selection';

type Bounds = { columns: TrackBounds[]; rows: TrackBounds[] };

export default function BulkSelectionOverlay({
	selection,
	children,
}: {
	selection: BulkSelection;
	children: ReactNode;
}) {
	const root = useRef<HTMLDivElement>(null);
	const [bounds, setBounds] = useState<Bounds>({ columns: [], rows: [] });
	useLayoutEffect(() => {
		const surface = root.current;
		const table = surface?.querySelector('table');
		if (!surface || !table) {
			return;
		}
		const columns = Array.from(
			table.querySelectorAll('thead > tr > th')
		).slice(1);
		const rows = Array.from(table.querySelectorAll('tbody > tr'));
		const measure = () => {
			const origin = surface.getBoundingClientRect();
			// WP's modal entrance can scale its content without a layout resize.
			const scaleX = origin.width / surface.offsetWidth || 1;
			const scaleY = origin.height / surface.offsetHeight || 1;
			const next = {
				columns: columns.map((node) => {
					const rect = node.getBoundingClientRect();
					return {
						start: (rect.left - origin.left) / scaleX,
						end: (rect.right - origin.left) / scaleX,
					};
				}),
				rows: rows.map((node) => {
					const rect = node.getBoundingClientRect();
					return {
						start: (rect.top - origin.top) / scaleY,
						end: (rect.bottom - origin.top) / scaleY,
					};
				}),
			};
			setBounds((previous) =>
				JSON.stringify(previous) === JSON.stringify(next)
					? previous
					: next
			);
		};
		measure();
		const observer = new ResizeObserver(measure);
		[surface, table, ...columns, ...rows].forEach((node) =>
			observer.observe(node)
		);
		return () => observer.disconnect();
	}, [children]);
	return (
		<div ref={root} className="modular-table-blocks-bulk-preview-surface">
			{children}
			<div
				className="modular-table-blocks-bulk-preview-overlay"
				aria-hidden="true"
			>
				{selectionBoxes(selection, bounds.columns, bounds.rows).map(
					(box, index) => (
						<div
							key={index}
							className="modular-table-blocks-bulk-preview-selection"
							style={box}
						/>
					)
				)}
			</div>
		</div>
	);
}
