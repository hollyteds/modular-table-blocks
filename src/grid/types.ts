export interface GridCell {
	clientId: string;
	colSpan: number;
	rowSpan: number;
}

export interface CellRef {
	rowIndex: number;
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
