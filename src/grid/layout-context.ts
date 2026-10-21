import { createContext } from '@wordpress/element';
import type { Placement } from './layout';

export const TableLayout = createContext<{
	valid: boolean;
	cells: Placement[];
}>({ valid: false, cells: [] });
