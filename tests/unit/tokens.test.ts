import fixtures from '../fixtures/tokens.json';
import outputFixtures from '../fixtures/token-output.json';
import definitions from '../../includes/style-tokens.json';
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

describe('canonical custom properties shared with PHP', () => {
	it.each(outputFixtures)('$name', (fixture) => {
		const before = JSON.stringify(fixture.tokens);
		expect(tokenStyle(fixture.tokens)).toEqual(fixture.properties);
		expect(JSON.stringify(fixture.tokens)).toBe(before);
	});
	it('has unique names and expands shorthands only into known individual properties', () => {
		const names = Object.values(definitions.names);
		expect(new Set(names).size).toBe(names.length);
		for (const targets of Object.values(definitions.shorthands)) {
			for (const target of targets) {
				expect(definitions.names).toHaveProperty(target);
			}
		}
	});
});
