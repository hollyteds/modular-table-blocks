const path = require( 'path' );
const config = require( '@wordpress/scripts/config/webpack.config' );

module.exports = {
  ...config,
  entry: { index: path.resolve( __dirname, 'src/index.ts' ) },
};
