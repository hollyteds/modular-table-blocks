const path = require('path');
const config = require('@wordpress/scripts/config/webpack.config');
const BuildManifestPlugin = require('./scripts/build-manifest.cjs');

module.exports = {
	...config,
	entry: { index: path.resolve(__dirname, 'src/index.ts') },
	plugins: [...config.plugins, new BuildManifestPlugin()],
};
