import fixtures from '../fixtures/tokens.json';
import { isValidToken, tokenStyle } from '../../src/styles/tokens';
import type { TokenKey } from '../../src/styles/tokens';

describe('CSS token validation (shared with PHP)', () => {
	it.each(fixtures)('$key = $value', (fixture) => {
		expect(isValidToken(fixture.key as TokenKey, fixture.value)).toBe(
			fixture.valid
		);
	});
	it('outputs only explicitly set, valid, recognized values', () => {
		const tokens = Object.freeze({
			textColor: '#123456',
			borderWidth: '-1px',
			unknown: 'bad',
		});
		expect(tokenStyle(tokens)).toEqual({ '--mtb-text-color': '#123456' });
		expect(tokenStyle({})).toEqual({});
		expect(tokenStyle(null)).toEqual({});
		expect(tokenStyle([])).toEqual({});
		expect(tokens.borderWidth).toBe('-1px');
	});
});
