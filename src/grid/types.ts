export interface GridCell {
	row: number;
	column: number;
	clientId: string;
	colSpan: number;
	rowSpan: number;
}

export interface CellRef {
	rowIndex: number;
	/** Index in table.innerBlocks, including cells that start in other rows. */
	cellIndex: number;
	clientId: string;
}

export interface Slot {
	origin: CellRef;
	isOrigin: boolean;
}

export interface Grid {
	width: number;
	height: number;
	slots: (Slot | null)[][];
	errors: string[];
}
