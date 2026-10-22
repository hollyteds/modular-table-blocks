import { registerBlockType } from '@wordpress/blocks';
import type { BlockConfiguration } from '@wordpress/blocks';
import { addFilter } from '@wordpress/hooks';
import { migrateStyleAttributes } from './styles/native';
import type { NativeStyleAttributes } from './styles/native';
import type { TableAttributes } from './blocks/table/edit';
import type { CellAttributes } from './blocks/cell/edit';
import type { RowAttributes } from './blocks/row/edit';
import table from './blocks/table/block.json';
import row from './blocks/row/block.json';
import cell from './blocks/cell/block.json';
import TableEdit from './blocks/table/edit';
import RowEdit from './blocks/row/edit';
import CellEdit from './blocks/cell/edit';
import Save from './blocks/save';
import './blocks/table/style.scss';
import './blocks/table/editor.scss';

addFilter(
	'blocks.getBlockAttributes',
	'modular-table-blocks/native-styles',
	(attributes: NativeStyleAttributes, type: { name: string }) =>
		['table', 'row', 'cell'].some(
			(name) => type.name === `modular-table-blocks/${name}`
		)
			? migrateStyleAttributes(attributes)
			: attributes
);

registerBlockType<TableAttributes>(
	table as BlockConfiguration<TableAttributes>,
	{ edit: TableEdit, save: Save }
);
registerBlockType<RowAttributes>(row as BlockConfiguration<RowAttributes>, {
	edit: RowEdit,
	save: Save,
});
registerBlockType<CellAttributes>(cell as BlockConfiguration<CellAttributes>, {
	edit: CellEdit,
	save: Save,
});
