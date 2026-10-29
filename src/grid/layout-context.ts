import { createContext } from '@wordpress/element';
import type { BackgroundAttributes } from '../styles/background';
import type { Placement } from './layout';

export const TableLayout = createContext<{
	valid: boolean;
	background?: BackgroundAttributes;
	headerRows?: number;
	verticalAlign?: unknown;
	cells: Placement[];
	onImport?: (row: number, column: number, opener?: HTMLElement) => void;
}>({ valid: false, cells: [] });
