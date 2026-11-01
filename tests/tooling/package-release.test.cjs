const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { packageRelease } = require('../../scripts/package-release.cjs');

function fixture(t, version) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mtb-release-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	fs.mkdirSync(path.join(root, 'docs'));
	fs.mkdirSync(path.join(root, 'dist'));
	fs.writeFileSync(
		path.join(root, 'package.json'),
		JSON.stringify({ name: 'modular-table-blocks', version })
	);
	fs.writeFileSync(
		path.join(root, 'modular-table-blocks.php'),
		'<?php\n/**\n * Version: 1.2.3\n * Update URI: https://example.com/updates/plugin.json\n */'
	);
	fs.writeFileSync(
		path.join(root, 'docs/update-manifest.example.json'),
		JSON.stringify({
			slug: 'modular-table-blocks',
			package: 'https://example.com/updates/old.zip',
		})
	);
	fs.writeFileSync(path.join(root, 'modular-table-blocks.zip'), 'source ZIP');
	fs.writeFileSync(
		path.join(root, 'dist/modular-table-blocks.json'),
		'previous manifest'
	);
	return root;
}

test('mismatched versions leave the ZIP and previous update manifest intact', (t) => {
	const root = fixture(t, '1.2.4');
	assert.throws(() => packageRelease(root), /versions differ/);
	assert.equal(
		fs.readFileSync(path.join(root, 'modular-table-blocks.zip'), 'utf8'),
		'source ZIP'
	);
	assert.equal(
		fs.readFileSync(
			path.join(root, 'dist/modular-table-blocks.json'),
			'utf8'
		),
		'previous manifest'
	);
});

test('release versions cannot select output paths outside dist', (t) => {
	const root = fixture(t, '../1.2.3');
	assert.throws(() => packageRelease(root), /Invalid release version/);
	assert.deepEqual(fs.readdirSync(path.join(root, 'dist')), [
		'modular-table-blocks.json',
	]);
});

test('release metadata names the produced ZIP while preserving the edited template and release notes', (t) => {
	const root = fixture(t, '1.2.3');
	const templatePath = path.join(root, 'docs/update-manifest.example.json');
	const template = {
		slug: 'modular-table-blocks',
		version: '9.9.9',
		author: 'Release author',
		package: 'https://example.com/updates/old.zip',
		sections: { changelog: '<h4>1.2.3</h4><ul><li>Short notes</li></ul>' },
	};
	const original = JSON.stringify(template);
	fs.writeFileSync(templatePath, original);
	const files = packageRelease(root);
	const generated = JSON.parse(
		fs.readFileSync(path.join(root, files.json), 'utf8')
	);
	assert.equal(generated.version, '1.2.3');
	assert.equal(
		generated.package,
		`https://example.com/updates/${path.basename(files.zip)}`
	);
	assert.equal(generated.author, template.author);
	assert.deepEqual(generated.sections, template.sections);
	assert.equal(fs.readFileSync(templatePath, 'utf8'), original);
	assert.equal(
		fs.readFileSync(path.join(root, files.zip), 'utf8'),
		'source ZIP'
	);
});
