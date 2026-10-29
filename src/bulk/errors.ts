export type BulkErrorCode =
	| 'stale-structure'
	| 'invalid-selection'
	| 'empty-selection'
	| 'invalid-field'
	| 'invalid-value';

export class BulkError extends Error {
	constructor(public readonly code: BulkErrorCode) {
		super(code);
	}
}

export function bulkFailure(cause: unknown): {
	code: BulkErrorCode | 'unexpected';
	cause: unknown;
} {
	return {
		code: cause instanceof BulkError ? cause.code : 'unexpected',
		cause,
	};
}
