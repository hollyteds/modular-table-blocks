import { captionIsEnabled } from './caption';
import type { CaptionAttributes } from './caption';
import type { BorderCollapse } from './styles/border-layout';
import type { ColumnWidthMode } from './styles/columns';
import type { StyleTokens } from './styles/tokens';

export type TableSettingsSection = 'columns' | 'spacing' | 'width' | 'caption';
export type TableSettingsAttributes = CaptionAttributes & {
	columns: Record<string, unknown>[];
	columnWidthMode?: ColumnWidthMode;
	borderCollapse?: BorderCollapse;
	styleTokens?: StyleTokens;
};

const tokenFields = {
	spacing: ['borderSpacingHorizontal', 'borderSpacingVertical'],
	width: ['tableWidth'],
} as const;

export function tableSectionHasValue(
	attributes: TableSettingsAttributes,
	section: TableSettingsSection
): boolean {
	if (section === 'columns') {
		return (
			attributes.columnWidthMode !== undefined ||
			attributes.columns.some((column) => column?.width !== undefined)
		);
	}
	if (section === 'caption') {
		return (
			captionIsEnabled(attributes) ||
			attributes.captionSide !== undefined ||
			attributes.captionAlign !== undefined
		);
	}
	return (
		(section === 'spacing' && attributes.borderCollapse !== undefined) ||
		tokenFields[section].some(
			(field) => attributes.styleTokens?.[field] !== undefined
		)
	);
}

// A reset removes only settings owned by its section; content stays intact.
export function resetTableSection(
	attributes: TableSettingsAttributes,
	section: TableSettingsSection
): Partial<TableSettingsAttributes> {
	if (section === 'columns') {
		return {
			columnWidthMode: undefined,
			columns: attributes.columns.map((column) => {
				if (
					!column ||
					!Object.prototype.hasOwnProperty.call(column, 'width')
				) {
					return column;
				}
				const next = { ...column };
				delete next.width;
				return next;
			}),
		};
	}
	if (section === 'caption') {
		return {
			captionEnabled: false,
			captionSide: undefined,
			captionAlign: undefined,
		};
	}
	const tokens = { ...attributes.styleTokens };
	for (const field of tokenFields[section]) {
		delete tokens[field];
	}
	return {
		...(section === 'spacing' ? { borderCollapse: undefined } : {}),
		styleTokens: Object.keys(tokens).length ? tokens : undefined,
	};
}
