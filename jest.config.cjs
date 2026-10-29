module.exports = {
	preset: '@wordpress/jest-preset-default',
	testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
	transform: {
		'\\.[jt]sx?$':
			require.resolve('@wordpress/scripts/config/babel-transform'),
	},
	transformIgnorePatterns: ['/node_modules/(?!(uuid|marked)/)'],
};
