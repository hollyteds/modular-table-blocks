import {
	Button,
	Modal,
	Notice,
	Popover,
	SlotFillProvider,
} from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';
import type { PreviewEnvironment } from '../styles/bulk-preview';
import BulkSelectionPreview from './bulk-selection-preview';
import BulkCellPanels from './bulk/panels';
import { useBulkCellEditor } from './bulk/use-bulk-cell-editor';
import type { BulkEditorOptions } from './bulk/use-bulk-cell-editor';

export default function BulkModal({
	source,
	environment,
	onClose,
	onApplied,
}: BulkEditorOptions & {
	environment: PreviewEnvironment;
	onClose: () => void;
}) {
	const editor = useBulkCellEditor({ source, onApplied });
	const {
		projected,
		selection,
		draft,
		changeSelection,
		cells,
		affected,
		crossing,
		stale,
		error,
		applied,
		apply,
	} = editor;
	return (
		<SlotFillProvider>
			<Modal
				title={__('Bulk edit cells', 'modular-table-blocks')}
				onRequestClose={onClose}
				className="modular-table-blocks-bulk"
			>
				<div className="modular-table-blocks-bulk-layout">
					<div className="modular-table-blocks-bulk-selection">
						<BulkSelectionPreview
							table={projected}
							environment={environment}
							draft={draft}
							selection={selection}
							onChange={changeSelection}
						/>
						{(crossing || stale || error || applied) && (
							<div
								className="modular-table-blocks-bulk-selection-notifications"
								role="region"
								aria-label={__(
									'Notifications',
									'modular-table-blocks'
								)}
								tabIndex={0}
							>
								{crossing && (
									<Notice
										status="warning"
										isDismissible={false}
									>
										{__(
											'Merged cells extend beyond the selection. Only complete cell edges inside the selected rows or columns can change. Other edges are kept. Cell type, background, typography and alignment apply to the whole merged cell even when it is only partly selected.',
											'modular-table-blocks'
										)}
									</Notice>
								)}
								{stale && (
									<Notice
										status="warning"
										isDismissible={false}
									>
										{__(
											'The table structure changed. Close and reopen this dialog before applying.',
											'modular-table-blocks'
										)}
									</Notice>
								)}
								{error && (
									<Notice
										status="error"
										isDismissible={false}
									>
										{__(
											'The settings could not be applied. Check the values and table structure.',
											'modular-table-blocks'
										)}
									</Notice>
								)}
								{applied && (
									<Notice
										status="success"
										isDismissible={false}
									>
										{__(
											'Changes applied.',
											'modular-table-blocks'
										)}
									</Notice>
								)}
							</div>
						)}
						<p
							className="modular-table-blocks-bulk-selection-status"
							role="status"
						>
							{sprintf(
								// translators: %d: number of physical cells.
								__('%d cells selected', 'modular-table-blocks'),
								cells.length
							)}
							{selection.mode !== 'all' &&
								selection.indices.length > 0 &&
								` (${selection.indices.map((i) => i + 1).join(', ')})`}
						</p>
					</div>
					<div className="modular-table-blocks-bulk-settings-column">
						<BulkCellPanels editor={editor} />
						<div className="modular-table-blocks-bulk__actions">
							<Button variant="tertiary" onClick={onClose}>
								{__('Close', 'modular-table-blocks')}
							</Button>
							<Button
								variant="primary"
								disabled={!affected.length || stale || !!error}
								onClick={apply}
							>
								{sprintf(
									// translators: %d: number of physical cells.
									__(
										'Apply to %d cells',
										'modular-table-blocks'
									),
									affected.length
								)}
							</Button>
						</div>
					</div>
				</div>
				<Popover.Slot />
			</Modal>
		</SlotFillProvider>
	);
}
