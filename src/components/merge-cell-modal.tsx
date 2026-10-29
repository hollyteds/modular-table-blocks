import { Button, Modal, Notice } from '@wordpress/components';
import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';
import type { KeyboardEvent } from 'react';
import { mergeEndpointOperation, mergeOptions } from '../grid/merge-options';
import type { MergeEndpoint } from '../grid/merge-options';
import type { BlockTree, TableOperation } from '../grid/operations';
import { planOperation } from '../grid/operations';

export default function MergeCellModal({
	source,
	cellId,
	stale,
	onClose,
	onMerge,
}: {
	source: BlockTree;
	cellId: string;
	stale: boolean;
	onClose: () => void;
	onMerge: (operation: TableOperation, approvedDeletion: boolean) => void;
}) {
	const options = useMemo(
		() => mergeOptions(source, cellId),
		[source, cellId]
	);
	const [endpoint, setEndpoint] = useState<MergeEndpoint | null>(null);
	const [focused, setFocused] = useState('');
	const [confirming, setConfirming] = useState(false);
	const cancelButton = useRef<HTMLButtonElement>(null);
	const mergeButton = useRef<HTMLButtonElement>(null);
	const returning = useRef(false);
	const plan = useMemo(
		() =>
			options && endpoint
				? planOperation(
						source,
						mergeEndpointOperation(options, endpoint)
					)
				: null,
		[source, options, endpoint]
	);
	useEffect(() => {
		if (confirming) {
			cancelButton.current?.focus();
		} else if (returning.current) {
			returning.current = false;
			mergeButton.current?.focus();
		}
	}, [confirming]);
	const buttons = useRef(new Map<string, HTMLButtonElement>());
	if (!options) {
		return null;
	}
	const { origin } = options;
	const discarded = plan?.discardedCells ?? [];
	if (confirming) {
		return (
			<Modal
				title={__(
					'Delete other cell contents?',
					'modular-table-blocks'
				)}
				onRequestClose={onClose}
				className="modular-table-blocks-merge"
			>
				<Notice status="warning" isDismissible={false}>
					{sprintf(
						/* translators: %d: number of non-origin cells containing blocks. */ _n(
							'Only the starting cell content will remain. Contents in %d other cell will be deleted, including locked blocks. You can undo this change.',
							'Only the starting cell content will remain. Contents in %d other cells will be deleted, including locked blocks. You can undo this change.',
							discarded.length,
							'modular-table-blocks'
						),
						discarded.length
					)}
				</Notice>
				<p>
					{sprintf(
						/* translators: 1: origin row, 2: origin column. */ __(
							'Start: row %1$d, column %2$d',
							'modular-table-blocks'
						),
						origin.row + 1,
						origin.column + 1
					)}
				</p>
				<ul>
					{discarded.slice(0, 20).map((cell) => (
						<li key={`${cell.row}:${cell.column}`}>
							{sprintf(
								/* translators: 1: row, 2: column of a cell whose contents will be deleted. */ __(
									'Delete contents: row %1$d, column %2$d',
									'modular-table-blocks'
								),
								cell.row + 1,
								cell.column + 1
							)}
						</li>
					))}
				</ul>
				{discarded.length > 20 && (
					<p>
						{sprintf(
							/* translators: %d: number of additional cells whose contents will be deleted. */ _n(
								'And %d more cell.',
								'And %d more cells.',
								discarded.length - 20,
								'modular-table-blocks'
							),
							discarded.length - 20
						)}
					</p>
				)}
				{stale && (
					<Notice status="warning" isDismissible={false}>
						{__(
							'The table changed. Close and reopen this dialog before merging.',
							'modular-table-blocks'
						)}
					</Notice>
				)}
				<div className="modular-table-blocks-merge__actions">
					<Button
						ref={cancelButton}
						variant="secondary"
						onClick={onClose}
					>
						{__('Cancel', 'modular-table-blocks')}
					</Button>
					<Button
						variant="tertiary"
						onClick={() => {
							returning.current = true;
							setConfirming(false);
						}}
					>
						{__('Back to range selection', 'modular-table-blocks')}
					</Button>
					<Button
						variant="primary"
						isDestructive
						disabled={
							stale ||
							!endpoint ||
							!!plan?.errors.length ||
							!discarded.length
						}
						onClick={() => {
							if (endpoint) {
								onMerge(
									mergeEndpointOperation(options, endpoint),
									true
								);
							}
						}}
					>
						{__(
							'Delete contents and merge',
							'modular-table-blocks'
						)}
					</Button>
				</div>
			</Modal>
		);
	}
	const valid = new Set(options.endpoints.map((p) => `${p.row}:${p.column}`));
	const key = (p: MergeEndpoint) => `${p.row}:${p.column}`;
	const moveFocus = (from: MergeEndpoint, direction: string) => {
		const next = options.endpoints
			.filter((p) => {
				if (direction === 'ArrowRight') {
					return p.row === from.row && p.column > from.column;
				}
				if (direction === 'ArrowLeft') {
					return p.row === from.row && p.column < from.column;
				}
				if (direction === 'ArrowDown') {
					return p.column === from.column && p.row > from.row;
				}
				return p.column === from.column && p.row < from.row;
			})
			.sort(
				(a, b) =>
					Math.abs(a.row - from.row) +
					Math.abs(a.column - from.column) -
					(Math.abs(b.row - from.row) +
						Math.abs(b.column - from.column))
			)[0];
		if (next) {
			buttons.current.get(key(next))?.focus();
		}
	};
	return (
		<Modal
			title={__('Merge cells', 'modular-table-blocks')}
			onRequestClose={onClose}
			className="modular-table-blocks-merge"
		>
			<p>
				{__(
					'Only complete cells within the same header or body section can be merged.',
					'modular-table-blocks'
				)}
			</p>
			<p>
				{__(
					'Only the starting cell content and settings will remain. If other cells contain blocks, you will be asked to confirm deleting them, including locked blocks. Splitting later creates empty cells.',
					'modular-table-blocks'
				)}
			</p>
			<div
				className="modular-table-blocks-merge__scroll"
				role="region"
				aria-label={__('Merge range preview', 'modular-table-blocks')}
				tabIndex={0}
			>
				<div
					className="modular-table-blocks-merge__grid"
					role="group"
					aria-label={__('End cell', 'modular-table-blocks')}
					style={{
						gridTemplateColumns: `repeat(${options.right - origin.column + 1}, minmax(3rem, 1fr))`,
						gridTemplateRows: `repeat(${options.bottom - origin.row + 1}, 3rem)`,
					}}
				>
					{options.cells.map((p) => {
						const end = {
							row: p.row + p.height - 1,
							column: p.column + p.width - 1,
						};
						const available = valid.has(key(end));
						const start = p.cell.clientId === cellId;
						return (
							<Button
								key={p.cell.clientId}
								ref={(node) => {
									if (node) {
										buttons.current.set(key(end), node);
									} else {
										buttons.current.delete(key(end));
									}
								}}
								className={`modular-table-blocks-merge__cell${start ? ' is-origin' : ''}`}
								style={{
									gridRow: `${Math.max(origin.row, p.row) - origin.row + 1} / ${Math.min(options.bottom + 1, p.row + p.height) - origin.row + 1}`,
									gridColumn: `${Math.max(origin.column, p.column) - origin.column + 1} / ${Math.min(options.right + 1, p.column + p.width) - origin.column + 1}`,
								}}
								disabled={!available || stale}
								tabIndex={
									available &&
									key(end) ===
										(focused ||
											(options.endpoints[0] &&
												key(options.endpoints[0])))
										? 0
										: -1
								}
								onFocus={() => setFocused(key(end))}
								aria-pressed={
									!!endpoint && key(endpoint) === key(end)
								}
								aria-label={
									start
										? sprintf(
												/* translators: 1: origin row, 2: origin column. */ __(
													'Start cell: row %1$d, column %2$d',
													'modular-table-blocks'
												),
												p.row + 1,
												p.column + 1
											)
										: sprintf(
												/* translators: 1: end row, 2: end column. */ __(
													'End at row %1$d, column %2$d',
													'modular-table-blocks'
												),
												end.row + 1,
												end.column + 1
											)
								}
								onClick={() => setEndpoint(end)}
								onKeyDown={(
									event: KeyboardEvent<HTMLButtonElement>
								) => {
									if (
										[
											'ArrowLeft',
											'ArrowRight',
											'ArrowUp',
											'ArrowDown',
										].includes(event.key)
									) {
										event.preventDefault();
										moveFocus(end, event.key);
									}
								}}
							>
								{p.row + 1}:{p.column + 1}
								{start && (
									<span className="modular-table-blocks-merge__origin">
										{__('Start', 'modular-table-blocks')}
									</span>
								)}
							</Button>
						);
					})}
					{endpoint && (
						<div
							aria-hidden="true"
							className="modular-table-blocks-merge__selection"
							style={{
								gridRow: `1 / ${endpoint.row - origin.row + 2}`,
								gridColumn: `1 / ${endpoint.column - origin.column + 2}`,
							}}
						/>
					)}
				</div>
			</div>
			<p role="status">
				{endpoint
					? sprintf(
							/* translators: 1: selected row count, 2: selected column count. */ __(
								'Merge range: %1$d rows × %2$d columns',
								'modular-table-blocks'
							),
							endpoint.row - origin.row + 1,
							endpoint.column - origin.column + 1
						)
					: __('Choose an end cell.', 'modular-table-blocks')}
			</p>
			{!options.endpoints.length && (
				<Notice status="info" isDismissible={false}>
					{__(
						'There are no cells that can be merged from this starting cell.',
						'modular-table-blocks'
					)}
				</Notice>
			)}
			{stale && (
				<Notice status="warning" isDismissible={false}>
					{__(
						'The table changed. Close and reopen this dialog before merging.',
						'modular-table-blocks'
					)}
				</Notice>
			)}
			<div className="modular-table-blocks-merge__actions">
				<Button variant="secondary" onClick={onClose}>
					{__('Cancel', 'modular-table-blocks')}
				</Button>
				<Button
					ref={mergeButton}
					variant="primary"
					disabled={!endpoint || stale || !!plan?.errors.length}
					onClick={() => {
						if (endpoint) {
							if (discarded.length) {
								setConfirming(true);
							} else {
								onMerge(
									mergeEndpointOperation(options, endpoint),
									false
								);
							}
						}
					}}
				>
					{__('Merge cells', 'modular-table-blocks')}
				</Button>
			</div>
		</Modal>
	);
}
