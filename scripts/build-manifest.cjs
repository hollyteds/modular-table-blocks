const { createHash } = require('node:crypto');

// Use webpack's emitted assets, including lazy/vendor chunks and copied metadata.
class BuildManifestPlugin {
	apply(compiler) {
		compiler.hooks.thisCompilation.tap(
			'MtbBuildManifest',
			(compilation) => {
				compilation.hooks.processAssets.tap(
					{
						name: 'MtbBuildManifest',
						stage: compiler.webpack.Compilation
							.PROCESS_ASSETS_STAGE_REPORT,
					},
					() => {
						const files = Object.fromEntries(
							compilation
								.getAssets()
								.sort((a, b) =>
									a.name < b.name
										? -1
										: a.name > b.name
											? 1
											: 0
								)
								.map(({ name, source }) => [
									name.split('?')[0].replace(/^\.\//, ''),
									createHash('sha256')
										.update(source.buffer())
										.digest('hex'),
								])
						);
						compilation.emitAsset(
							'manifest.json',
							new compiler.webpack.sources.RawSource(
								JSON.stringify({ files }, null, 2) + '\n'
							)
						);
					}
				);
			}
		);
	}
}

module.exports = BuildManifestPlugin;
