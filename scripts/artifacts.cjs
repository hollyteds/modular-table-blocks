const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function translationMap(manifest) {
	return Object.fromEntries(
		Object.keys(manifest.files)
			.filter(
				(file) =>
					file.endsWith('.js') ||
					/^blocks\/[^/]+\/block\.json$/.test(file)
			)
			.sort()
			.map((file) => [`build/${file}`, 'build/index.js'])
	);
}

function packageAllows(file, entries) {
	return (
		!file.split('/').some((part) => part === '..' || part === '.') &&
		!file.startsWith('/') &&
		(file === 'package.json' ||
			entries.some((entry) =>
				entry.endsWith('/') ? file.startsWith(entry) : file === entry
			))
	);
}

function checkArtifacts(root, writeMap = false) {
	const readJSON = (file) =>
		JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
	const pkg = readJSON('package.json');
	const manifest = readJSON('build/manifest.json');
	assert.ok(
		manifest.files && Object.keys(manifest.files).length,
		'Empty build manifest'
	);
	for (const [file, hash] of Object.entries(manifest.files)) {
		assert.ok(
			packageAllows(`build/${file}`, pkg.files),
			`Build asset excluded from package: ${file}`
		);
		assert.ok(
			!file.startsWith('/') && !file.split('/').includes('..'),
			`Unsafe manifest path: ${file}`
		);
		const bytes = fs.readFileSync(path.join(root, 'build', file));
		assert.equal(
			createHash('sha256').update(bytes).digest('hex'),
			hash,
			`Build asset differs from manifest: ${file}`
		);
	}
	for (const file of [
		'index.js',
		'index.asset.php',
		'index.css',
		'style-index.css',
		...['table', 'cell', 'cell-text'].map(
			(name) => `blocks/${name}/block.json`
		),
	]) {
		assert.ok(
			Object.hasOwn(manifest.files, file),
			`Required build asset missing: ${file}`
		);
	}
	for (const file of pkg.files.filter((entry) => !entry.endsWith('/'))) {
		assert.ok(
			fs.existsSync(path.join(root, file)),
			`Package file missing: ${file}`
		);
	}
	assert.ok(
		pkg.files.includes('THIRD_PARTY_NOTICES.md'),
		'Third-party notices must be packaged'
	);
	const expected = translationMap(manifest);
	if (writeMap) {
		fs.writeFileSync(
			path.join(root, 'languages/map.json'),
			JSON.stringify(expected, null, 2) + '\n'
		);
	}
	assert.deepEqual(
		readJSON('languages/map.json'),
		expected,
		'Translation map differs from emitted JS/metadata. Run npm run build.'
	);
	return Object.keys(manifest.files).length;
}

if (require.main === module) {
	console.log(
		`Checked ${checkArtifacts(path.resolve(__dirname, '..'), process.argv.includes('--write-map'))} build assets, package entries and translation mappings.`
	);
}
module.exports = { checkArtifacts, packageAllows, translationMap };
