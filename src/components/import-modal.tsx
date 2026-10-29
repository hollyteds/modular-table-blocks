import { store as blockEditorStore } from '@wordpress/block-editor';
import {
	Button,
	CheckboxControl,
	Modal,
	Notice,
	SelectControl,
	TextareaControl,
} from '@wordpress/components';
import { useRegistry, useSelect } from '@wordpress/data';
import { useMemo, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { placements } from '../grid/layout';
import type { BlockTree } from '../grid/operations';
import { validateImport } from '../import/editor';
import { materializeBlock } from '../editor/materialize';
import type { ImportEditor } from '../import/editor';
import { parseImport } from '../import/parse';
import { ImportError } from '../import/types';
import type { ImportFormat } from '../import/types';
import type { ImportOptions } from '../import/plan';
import { ToggleGroupControl, ToggleGroupControlOption } from './style-compat';
import ImportPreview from './import-preview';

const messages = {
	empty: __('Paste table data or enter CSV.', 'modular-table-blocks'),
	limit: __(
		'Import exceeds the limit: 100 rows, 50 columns, 1,000,000 input characters or 200,000 text characters. Nothing was imported.',
		'modular-table-blocks'
	),
	quotes: __(
		'The quoted fields are incomplete or invalid. Check the delimiter and quotation marks.',
		'modular-table-blocks'
	),
	html: __(
		'Paste exactly one HTML table. Nested tables are not supported.',
		'modular-table-blocks'
	),
	'html-merge': __(
		'The HTML table has invalid or overlapping merged cells. Check the source table or paste as tab-separated text.',
		'modular-table-blocks'
	),
	merge: __(
		'Merged cells do not match the import range. Split the affected cells or import as a new table.',
		'modular-table-blocks'
	),
	grid: __(
		'The table grid is inconsistent. Import as a new table or repair the table first.',
		'modular-table-blocks'
	),
	anchor: __(
		'Choose an existing cell as the starting position.',
		'modular-table-blocks'
	),
	locked: __(
		'The table or affected contents are locked. Unlock them before importing.',
		'modular-table-blocks'
	),
	stale: __(
		'The table changed. Close and reopen this dialog before importing.',
		'modular-table-blocks'
	),
};
function errorMessage(error: unknown): string {
	if (!(error instanceof ImportError)) {
		return messages.grid;
	}
	const message = messages[error.code];
	return Number.isInteger(error.row) && Number.isInteger(error.column)
		? sprintf(
				/* translators: 1: error message, 2: row number, 3: column number. */
				__('%1$s (Row %2$d, column %3$d)', 'modular-table-blocks'),
				message,
				Number(error.row) + 1,
				Number(error.column) + 1
			)
		: message;
}

export default function ImportModal({
	source,
	initialRow,
	initialColumn,
	onClose,
}: {
	source: BlockTree;
	initialRow: number;
	initialColumn: number;
	onClose: () => void;
}) {
	const registry = useRegistry();
	const latest = useSelect(
		(select) => select(blockEditorStore).getBlock(source.clientId),
		[source.clientId]
	);
	const [text, setText] = useState('');
	const [html, setHtml] = useState('');
	const [format, setFormat] = useState<ImportFormat>('auto');
	const [options, setOptions] = useState<ImportOptions>({
		mode: source.innerBlocks.length ? 'overwrite' : 'new',
		row: initialRow,
		column: initialColumn,
		firstRowHeader: false,
	});
	const [approved, setApproved] = useState(false);
	const [failure, setFailure] = useState('');
	const revise = () => {
		setApproved(false);
		setFailure('');
	};
	const parsed = useMemo(() => {
		try {
			return { data: parseImport(text, html, format), error: '' };
		} catch (error) {
			return { data: null, error: errorMessage(error) };
		}
	}, [text, html, format]);
	const checked = useMemo(() => {
		if (!parsed.data) {
			return { plan: null, error: '' };
		}
		try {
			if (latest !== source) {
				throw new ImportError('stale');
			}
			return {
				plan: validateImport(
					registry.select(
						blockEditorStore
					) as unknown as ImportEditor,
					source,
					parsed.data,
					options
				),
				error: '',
			};
		} catch (error) {
			return { plan: null, error: errorMessage(error) };
		}
	}, [registry, source, parsed.data, options, latest]);
	const { data } = parsed;
	const { plan } = checked;
	const existing = useMemo(
		() => (source.innerBlocks.length ? placements(source) : []),
		[source]
	);
	const apply = () => {
		if (!data) {
			return;
		}
		try {
			const editor = registry.select(
				blockEditorStore
			) as unknown as ImportEditor;
			const validated = validateImport(editor, source, data, options);
			if (validated.overwriteCount && !approved) {
				return;
			}
			const actions = registry.dispatch(blockEditorStore);
			const block = materializeBlock({
				...validated.table,
				clientId: '',
			});
			if (options.mode === 'new' && source.innerBlocks.length) {
				const root =
					editor.getBlockRootClientId(source.clientId) ?? undefined;
				actions.insertBlocks(
					[block],
					editor.getBlockIndex(source.clientId, root) + 1,
					root
				);
			} else {
				actions.replaceBlocks(source.clientId, [block]);
			}
			onClose();
		} catch (error) {
			setFailure(errorMessage(error));
		}
	};
	return (
		<Modal
			title={__('Import data', 'modular-table-blocks')}
			onRequestClose={onClose}
			className="modular-table-blocks-import"
		>
			<div className="modular-table-blocks-import__layout">
				<div className="modular-table-blocks-import__settings">
					<TextareaControl
						label={__('Table data', 'modular-table-blocks')}
						placeholder={__(
							'Paste table data or enter CSV.',
							'modular-table-blocks'
						)}
						value={text}
						rows={7}
						onChange={(value) => {
							revise();
							setText(value);
							setHtml('');
						}}
						onPaste={(event) => {
							const plain =
								event.clipboardData.getData('text/plain');
							const table =
								event.clipboardData.getData('text/html');
							if (!plain && !table) {
								return;
							}
							event.preventDefault();
							revise();
							setText(plain);
							setHtml(
								table && /<table[\s>]/i.test(table) ? table : ''
							);
						}}
					/>
					<SelectControl
						label={__('Input format', 'modular-table-blocks')}
						value={format}
						options={[
							{
								label: __('Automatic', 'modular-table-blocks'),
								value: 'auto',
							},
							{
								label: __(
									'CSV (comma)',
									'modular-table-blocks'
								),
								value: 'csv',
							},
							{
								label: __(
									'Tab-separated',
									'modular-table-blocks'
								),
								value: 'tsv',
							},
							{
								label: __(
									'CSV (semicolon)',
									'modular-table-blocks'
								),
								value: 'semicolon',
							},
							{
								label: __('HTML table', 'modular-table-blocks'),
								value: 'html',
							},
						]}
						onChange={(value) => {
							revise();
							setFormat(value as ImportFormat);
						}}
					/>
					{source.innerBlocks.length > 0 && (
						<ToggleGroupControl
							label={__('Destination', 'modular-table-blocks')}
							value={options.mode}
							isBlock
							onChange={(value) => {
								if (value === 'new' || value === 'overwrite') {
									revise();
									setOptions({ ...options, mode: value });
								}
							}}
						>
							<ToggleGroupControlOption
								value="overwrite"
								label={__(
									'Current table',
									'modular-table-blocks'
								)}
							/>
							<ToggleGroupControlOption
								value="new"
								label={__('New table', 'modular-table-blocks')}
							/>
						</ToggleGroupControl>
					)}
					{options.mode === 'new' && data?.format !== 'html' && (
						<CheckboxControl
							label={__(
								'Use first row as headers (TH)',
								'modular-table-blocks'
							)}
							checked={options.firstRowHeader}
							onChange={(value) => {
								revise();
								setOptions({
									...options,
									firstRowHeader: value,
								});
							}}
						/>
					)}
					{data && (
						<p>
							{sprintf(
								/* translators: 1: row count, 2: column count. */ __(
									'%1$d rows × %2$d columns',
									'modular-table-blocks'
								),
								data.rows,
								data.columns
							)}
						</p>
					)}
					{data?.missing ? (
						<Notice status="warning" isDismissible={false}>
							{__(
								'Some rows have missing fields. Existing contents at those positions will be kept; explicit empty fields clear contents.',
								'modular-table-blocks'
							)}
						</Notice>
					) : null}
					{(text || html) &&
						(failure || checked.error || parsed.error) && (
							<Notice
								status={text || html ? 'warning' : 'info'}
								isDismissible={false}
							>
								{failure || checked.error || parsed.error}
							</Notice>
						)}
					{plan && options.mode === 'overwrite' && (
						<p>
							{sprintf(
								/* translators: 1: row number, 2: column number. */ __(
									'Starting at row %1$d, column %2$d',
									'modular-table-blocks'
								),
								options.row + 1,
								options.column + 1
							)}
						</p>
					)}
					{plan?.overwriteCount ? (
						<CheckboxControl
							label={sprintf(
								/* translators: %d: number of cells with existing contents. */ __(
									'Replace contents in %d cells. This also removes images and other inner blocks.',
									'modular-table-blocks'
								),
								plan.overwriteCount
							)}
							checked={approved}
							onChange={setApproved}
						/>
					) : null}
					<div className="modular-table-blocks-import__actions">
						<Button variant="secondary" onClick={onClose}>
							{__('Cancel', 'modular-table-blocks')}
						</Button>
						<Button
							variant="primary"
							disabled={
								!plan || (!!plan.overwriteCount && !approved)
							}
							onClick={apply}
						>
							{plan &&
							options.mode === 'overwrite' &&
							(plan.addedRows || plan.addedColumns)
								? sprintf(
										/* translators: 1: resulting rows, 2: resulting columns. */ __(
											'Expand to %1$d rows × %2$d columns and import',
											'modular-table-blocks'
										),
										Number(plan.table.attributes.rowCount),
										(
											plan.table.attributes
												.columns as unknown[]
										).length
									)
								: __('Import', 'modular-table-blocks')}
						</Button>
					</div>
				</div>
				<div className="modular-table-blocks-import__preview">
					{options.mode === 'overwrite' && existing.length > 0 && (
						<ImportPreview
							title={__('Starting cell', 'modular-table-blocks')}
							table={source}
							anchor={options}
							onAnchor={(row, column) => {
								revise();
								setOptions({ ...options, row, column });
							}}
						/>
					)}
					{plan && data && (
						<ImportPreview
							title={__('Import preview', 'modular-table-blocks')}
							table={plan.table}
							data={data}
							anchor={
								options.mode === 'new'
									? { row: 0, column: 0 }
									: options
							}
							original={
								options.mode === 'overwrite'
									? source
									: undefined
							}
						/>
					)}
				</div>
			</div>
		</Modal>
	);
}
