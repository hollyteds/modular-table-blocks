import { __ } from '@wordpress/i18n';
import type { ReactNode } from 'react';
import { useRef, useState } from '@wordpress/element';
import { boxFields, boxKinds, commonValue } from '../../styles/bulk';
import type { BulkField } from '../../styles/bulk';
import { alignmentPatch, matrixAlignment } from '../../styles/alignment';
import {
	applyBorderValue,
	applyPaddingValue,
	borderControlValue,
	paddingControlValue,
} from '../../styles/native-box';
import type { Preset } from '../../styles/controls';
import {
	BorderBoxControl,
	SpacingSizesControl,
	ToggleGroupControl,
	ToggleGroupControlOption,
	ToolsPanel,
	ToolsPanelItem,
} from '../style-compat';
import TokenColorControl from '../token-color-control';
import BulkTypographyPanel from './typography-panel';
import AlignmentControl from '../alignment-control';
import useThemeColors from '../use-theme-colors';
import { bulkLabels } from './labels';
import type { BulkCellEditor } from './use-bulk-cell-editor';

type PanelProps = {
	editor: BulkCellEditor;
	selectionKey: string;
};

function hasResetTargets(editor: BulkCellEditor, fields: BulkField[]): boolean {
	return fields.some((field) => editor.targets(field).length > 0);
}

function SettingsCard({
	title,
	editor,
	fields,
	children,
}: {
	title: string;
	editor: BulkCellEditor;
	fields: BulkField[];
	children: ReactNode;
}) {
	const latest = useRef({ editor, fields });
	latest.current = { editor, fields };
	const [resetVersion, setResetVersion] = useState(0);
	const isType = fields[0] === 'tag';
	const canReset =
		!editor.stale &&
		(isType ? editor.pending('tag') : hasResetTargets(editor, fields));
	const id = `${editor.source.clientId}-bulk-${fields.join('-')}`;
	const reset = () => {
		const current = latest.current;
		if (
			current.editor.stale ||
			!hasResetTargets(current.editor, current.fields)
		) {
			return;
		}
		if (current.fields[0] === 'tag') {
			current.editor.leaveUnchanged(['tag']);
		} else {
			current.editor.update(
				Object.fromEntries(
					current.fields.map((field) => [field, undefined])
				)
			);
		}
		setResetVersion((version) => version + 1);
	};
	return (
		<section className="modular-table-blocks-bulk-card" aria-label={title}>
			<ToolsPanel
				className="modular-table-blocks-settings-tools"
				label={title}
				panelId={id}
				headingLevel={2}
				resetAll={reset}
			>
				<ToolsPanelItem
					key={resetVersion}
					className="modular-table-blocks-settings-tools-content"
					label={title}
					panelId={id}
					isShownByDefault
					hasValue={() => canReset}
					onDeselect={reset}
				>
					{children}
				</ToolsPanelItem>
			</ToolsPanel>
		</section>
	);
}

function TypePanel({ editor }: Pick<PanelProps, 'editor'>) {
	const fields = bulkLabels();
	const { typeValue, typeCells, stale, cells, update } = editor;
	return (
		<SettingsCard title={fields.tag} editor={editor} fields={['tag']}>
			<ToggleGroupControl
				label={fields.tag}
				value={typeValue.value ?? ''}
				isBlock
				disabled={!typeCells.length || stale}
				help={
					typeCells.length < cells.length
						? __(
								'Header-row cells are managed by the table and are excluded from this change.',
								'modular-table-blocks'
							)
						: undefined
				}
				onChange={(tag) => {
					if (tag === 'th' || tag === 'td') {
						update({ tag });
					}
				}}
			>
				<ToggleGroupControlOption
					value="td"
					label={__('Data cell (TD)', 'modular-table-blocks')}
					disabled={!typeCells.length || stale}
				/>
				<ToggleGroupControlOption
					value="th"
					label={__('Header cell (TH)', 'modular-table-blocks')}
					disabled={!typeCells.length || stale}
				/>
			</ToggleGroupControl>
		</SettingsCard>
	);
}

function AlignmentPanel({ editor }: PanelProps) {
	const { areaCells, stale, alignmentRead, update } = editor;
	return (
		<SettingsCard
			title={__('Alignment', 'modular-table-blocks')}
			editor={editor}
			fields={['verticalAlign', 'textAlign']}
		>
			<fieldset disabled={!areaCells.length}>
				<AlignmentControl
					disabled={!areaCells.length || stale}
					value={matrixAlignment(
						commonValue(
							areaCells.map((p) =>
								alignmentRead(
									p.cell.attributes,
									'verticalAlign'
								)
							)
						).value,
						commonValue(
							areaCells.map((p) =>
								alignmentRead(p.cell.attributes, 'textAlign')
							)
						).value
					)}
					onChange={(next) => update(alignmentPatch(next))}
				/>
			</fieldset>
		</SettingsCard>
	);
}

function BackgroundPanel({ editor }: PanelProps) {
	const fields = bulkLabels();
	const { areaCells, tokens, read, update } = editor;
	return (
		<SettingsCard
			title={__('Cell background', 'modular-table-blocks')}
			editor={editor}
			fields={['cellBackgroundColor']}
		>
			<fieldset disabled={!areaCells.length}>
				<TokenColorControl
					label={fields.cellBackgroundColor}
					token="cellBackgroundColor"
					value={tokens.cellBackgroundColor}
					isMixed={
						commonValue(
							areaCells.map((p) =>
								read(p.cell.attributes, 'cellBackgroundColor')
							)
						).mixed
					}
					onChange={(value) => update({ cellBackgroundColor: value })}
				/>
			</fieldset>
		</SettingsCard>
	);
}

function BorderPanel({
	editor,
	selectionKey,
	presets,
	colors,
	disableCustomColors,
}: PanelProps & {
	presets: Preset[];
	colors: ReturnType<typeof useThemeColors>['colors'];
	disableCustomColors?: boolean;
}) {
	const { targets, tokens, borderDefaults, boxChange } = editor;
	return (
		<SettingsCard
			title={__('Border', 'modular-table-blocks')}
			editor={editor}
			fields={boxKinds
				.filter((kind) => kind !== 'padding')
				.flatMap(boxFields)}
		>
			<fieldset
				disabled={
					!boxFields('borderWidth').some((key) => targets(key).length)
				}
			>
				<BorderBoxControl
					key={selectionKey}
					label={__('Border', 'modular-table-blocks')}
					value={borderControlValue(tokens, presets, borderDefaults)}
					colors={colors}
					disableCustomColors={disableCustomColors}
					enableAlpha
					enableStyle
					onChange={(value) =>
						boxChange(
							() =>
								applyBorderValue(
									tokens,
									value,
									presets,
									borderDefaults
								),
							boxKinds
								.filter((kind) => kind !== 'padding')
								.flatMap(boxFields)
						)
					}
				/>
			</fieldset>
		</SettingsCard>
	);
}

function PaddingPanel({ editor, selectionKey }: PanelProps) {
	const { targets, tokens, boxChange } = editor;
	return (
		<SettingsCard
			title={__('Padding', 'modular-table-blocks')}
			editor={editor}
			fields={boxFields('padding')}
		>
			<fieldset
				disabled={
					!boxFields('padding').some((key) => targets(key).length)
				}
			>
				<div className="modular-table-blocks-padding-control">
					<SpacingSizesControl
						key={selectionKey}
						label={__('Padding', 'modular-table-blocks')}
						values={paddingControlValue(tokens)}
						onChange={(value) =>
							boxChange(
								() => applyPaddingValue(tokens, value),
								boxFields('padding')
							)
						}
					/>
				</div>
			</fieldset>
		</SettingsCard>
	);
}

export default function BulkCellPanels({ editor }: { editor: BulkCellEditor }) {
	const { presets, colors, disableCustomColors } =
		useThemeColors('borderColor');
	// Native box controls initialize linked sides from their first value.
	// A new target needs its own layout; resizing and value edits keep it mounted.
	const selectionKey = `${editor.selection.mode}:${editor.selection.all}:${editor.selection.indices.join(',')}`;
	const shared = { editor, selectionKey };
	return (
		<fieldset
			className="modular-table-blocks-bulk-settings"
			disabled={!editor.cells.length || editor.stale}
		>
			<TypePanel editor={editor} />
			<AlignmentPanel {...shared} />
			<BackgroundPanel {...shared} />
			<BorderPanel
				{...shared}
				presets={presets}
				colors={colors}
				disableCustomColors={disableCustomColors}
			/>
			<PaddingPanel {...shared} />
			<BulkTypographyPanel editor={editor} />
		</fieldset>
	);
}
