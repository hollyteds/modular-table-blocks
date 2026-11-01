const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function packageRelease(root) {
	const readJSON = (file) =>
		JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
	const pkg = readJSON('package.json');
	const template = readJSON('docs/update-manifest.example.json');
	assert.equal(pkg.name, 'modular-table-blocks', 'Unexpected plugin name');
	assert.match(
		pkg.version,
		/^[0-9]+(?:\.[0-9]+){1,3}$/,
		'Invalid release version'
	);
	const entry = fs.readFileSync(path.join(root, `${pkg.name}.php`), 'utf8');
	const pluginVersion = entry.match(/^\s*\* Version:\s*(\S+)\s*$/m)?.[1];
	assert.equal(
		pkg.version,
		pluginVersion,
		'Plugin and package versions differ'
	);
	assert.equal(template.slug, pkg.name, 'Update template slug differs');
	const endpoint = entry.match(/^\s*\* Update URI:\s*(\S+)\s*$/m)?.[1];
	const zipName = `${pkg.name}-${pkg.version}.zip`;
	const download = new URL(zipName, template.package);
	assert.ok(
		download.protocol === 'https:' &&
			download.origin === new URL(endpoint).origin,
		'Update ZIP must use the Update URI HTTPS origin'
	);
	const manifest = {
		...template,
		version: pkg.version,
		package: download.href,
	};
	const output = path.join(root, 'dist');
	// Serialize before changing either output, so invalid input leaves existing artifacts intact.
	const json = JSON.stringify(manifest, null, 2) + '\n';
	fs.mkdirSync(output, { recursive: true });
	fs.renameSync(
		path.join(root, `${pkg.name}.zip`),
		path.join(output, zipName)
	);
	fs.writeFileSync(path.join(output, `${pkg.name}.json`), json);
	return { zip: `dist/${zipName}`, json: `dist/${pkg.name}.json` };
}

if (require.main === module) {
	const files = packageRelease(path.resolve(__dirname, '..'));
	console.log(`Release files ready: ${files.zip}, ${files.json}`);
}

module.exports = { packageRelease };
