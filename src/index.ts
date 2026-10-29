import { icons } from './icons';
import { registerBlockType } from '@wordpress/blocks';
import type { BlockConfiguration } from '@wordpress/blocks';
import { addFilter } from '@wordpress/hooks';
import { migrateStyleAttributes } from './styles/native';
import type { NativeStyleAttributes } from './styles/native';
import type { TableAttributes } from './blocks/table/edit';
import type { CellAttributes } from './blocks/cell/edit';
import table from './blocks/table/block.json';
import cell from './blocks/cell/block.json';
import cellText from './blocks/cell-text/block.json';
import TableEdit from './blocks/table/edit';
import CellEdit from './blocks/cell/edit';
import CellTextEdit from './blocks/cell-text/edit';
import CellTextSave from './blocks/cell-text/save';
import cellTextTransforms from './blocks/cell-text/transforms';
import type { CellTextAttributes } from './blocks/cell-text/edit';
import Save from './blocks/save';
import './blocks/table/style.scss';
import './blocks/table/editor.scss';
import './components/cell-content-compat';
import './components/import.scss';

addFilter(
	'blocks.getBlockAttributes',
	'modular-table-blocks/native-styles',
	(attributes: NativeStyleAttributes, type: { name: string }) =>
		['table', 'cell'].some(
			(name) => type.name === `modular-table-blocks/${name}`
		)
			? migrateStyleAttributes(attributes)
			: attributes
);

registerBlockType<TableAttributes>(
	table as BlockConfiguration<TableAttributes>,
	{ icon: icons.blockTable, edit: TableEdit, save: Save }
);
registerBlockType<CellAttributes>(cell as BlockConfiguration<CellAttributes>, {
	icon: icons.blockCell,
	edit: CellEdit,
	save: Save,
});
registerBlockType<CellTextAttributes>(
	cellText as BlockConfiguration<CellTextAttributes>,
	{
		icon: icons.blockCellText,
		edit: CellTextEdit,
		save: CellTextSave,
		transforms: cellTextTransforms,
	}
);
