const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const {
	checkArtifacts,
	translationMap,
	packageAllows,
} = require('../../scripts/artifacts.cjs');

function fixture(t) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mtb-artifacts-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const write = (file, value) => {
		fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
		fs.writeFileSync(path.join(root, file), value);
	};
	const files = Object.fromEntries(
		[
			'index.js',
			'index.asset.php',
			'index.css',
			'style-index.css',
			'vendor-123.js',
			'table-import.js',
			...['table', 'cell', 'cell-text'].map(
				(name) => `blocks/${name}/block.json`
			),
		].map((file) => {
			write(`build/${file}`, 'fixture');
			return [file, createHash('sha256').update('fixture').digest('hex')];
		})
	);
	const manifest = { files };
	write('build/manifest.json', JSON.stringify(manifest));
	write(
		'package.json',
		JSON.stringify({
			files: ['build/', 'LICENSE', 'THIRD_PARTY_NOTICES.md'],
		})
	);
	write('LICENSE', 'license');
	write('THIRD_PARTY_NOTICES.md', 'notices');
	write('languages/map.json', JSON.stringify(translationMap(manifest)));
	return { root, write, manifest };
}

test('emitted chunks, including renamed vendor files, map to the registered script', (t) => {
	const { root, manifest } = fixture(t);
	assert.equal(checkArtifacts(root), Object.keys(manifest.files).length);
	assert.equal(
		translationMap(manifest)['build/vendor-123.js'],
		'build/index.js'
	);
});
test('a missing lazy dependency refuses the complete build', (t) => {
	const { root } = fixture(t);
	fs.unlinkSync(path.join(root, 'build/vendor-123.js'));
	assert.throws(() => checkArtifacts(root), /ENOENT/);
});
test('modified output and missing translation mappings are detected', (t) => {
	const { root, write } = fixture(t);
	write('build/table-import.js', 'modified');
	assert.throws(() => checkArtifacts(root), /differs from manifest/);
	write('build/table-import.js', 'fixture');
	write('languages/map.json', '{}');
	assert.throws(() => checkArtifacts(root), /Translation map differs/);
	assert.doesNotThrow(() => checkArtifacts(root, true));
});
test('package omissions and undeclared licenses refuse', (t) => {
	const { root, write } = fixture(t);
	write(
		'package.json',
		JSON.stringify({ files: ['LICENSE', 'THIRD_PARTY_NOTICES.md'] })
	);
	assert.throws(() => checkArtifacts(root), /excluded from package/);
	write('package.json', JSON.stringify({ files: ['build/', 'LICENSE'] }));
	assert.throws(() => checkArtifacts(root), /notices must be packaged/);
});
test('package paths respect directory boundaries and reject traversal', () => {
	const entries = ['build/', 'THIRD_PARTY_NOTICES.md'];
	assert.ok(packageAllows('build/vendor.js', entries));
	assert.ok(packageAllows('THIRD_PARTY_NOTICES.md', entries));
	assert.ok(packageAllows('package.json', entries));
	for (const file of [
		'build-other/a.js',
		'../build/a.js',
		'build/../secret',
		'/build/a.js',
		'.env',
		'.git/config',
	]) {
		assert.equal(packageAllows(file, entries), false);
	}
});
