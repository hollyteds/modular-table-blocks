<?php
namespace ModularTableBlocks\Tests\Package;

$archive = \dirname(__DIR__, 2) . '/modular-table-blocks.zip';
if (!\is_file($archive)) {
    throw new \RuntimeException('Run npm run package before checking the ZIP.');
}
require_once __DIR__ . '/artifacts.php';
$package = \json_decode(\file_get_contents(\dirname(__DIR__, 2) . '/package.json'), true);
$zip = new \PharData($archive);
$prefix = 'phar://' . $archive . '/';
$files = array();
foreach (new \RecursiveIteratorIterator($zip) as $entry) {
    if ($entry->isDir()) {
        continue;
    }
    $relative = \substr($entry->getPathname(), \strlen($prefix));
    if (\strpos($relative, 'modular-table-blocks/') !== 0 || !\ModularTableBlocks\Tests\Artifacts\package_allows(\substr($relative, \strlen('modular-table-blocks/')), $package['files'])) {
        throw new \RuntimeException('Unexpected ZIP entry: ' . $relative);
    }
    $files[] = $relative;
}
foreach (array('build/manifest.json', 'THIRD_PARTY_NOTICES.md', 'includes/style-tokens.json', 'LICENSE', 'package.json', 'tsconfig.json', 'webpack.config.cjs', 'src/index.ts', 'src/styles/_tokens.scss', 'src/components/style-panel.tsx', 'modular-table-blocks.php', 'build/index.js', 'build/index.asset.php', 'build/index.css', 'build/style-index.css', 'build/blocks/table/block.json', 'build/blocks/cell/block.json', 'build/blocks/cell-text/block.json', 'languages/modular-table-blocks-ja.mo', 'languages/modular-table-blocks-ja-dfbff627e6c248bcb3b61d7d06da9ca9.json') as $required) {
    if (!\in_array('modular-table-blocks/' . $required, $files, true)) {
        throw new \RuntimeException('ZIP is missing ' . $required);
    }
}
$destination = \sys_get_temp_dir() . '/mtb-package-' . \substr(\hash_file('sha256', $archive), 0, 16);
$zip->extractTo($destination, null, true);
\ModularTableBlocks\Tests\Artifacts\check_build($destination . '/modular-table-blocks');
// Load the active plugin from the archive, independently of the mounted sources.
\define('WP_PLUGIN_DIR', $destination);
require __DIR__ . '/render.php';
$function = new \ReflectionFunction('ModularTableBlocks\\Blocks\\register_blocks');
\ModularTableBlocks\Tests\check(\strpos($function->getFileName(), $destination . '/') === 0, 'Source plugin loaded instead of packaged plugin');
$asset = require $destination . '/modular-table-blocks/build/index.asset.php';
\ModularTableBlocks\Tests\check(\wp_scripts()->registered['mtb-editor']->ver === $asset['version'], 'Packaged assets were not registered');
$plugin = \get_file_data($destination . '/modular-table-blocks/modular-table-blocks.php', array('Version' => 'Version', 'License' => 'License'), 'plugin');
$package = \json_decode(\file_get_contents($destination . '/modular-table-blocks/package.json'), true);
\ModularTableBlocks\Tests\check($plugin['Version'] === $package['version'] && $plugin['License'] === 'GPL-2.0-or-later', 'Packaged version or license mismatch');
foreach (array('table', 'cell', 'cell-text') as $name) {
    $metadata = \json_decode(\file_get_contents($destination . '/modular-table-blocks/build/blocks/' . $name . '/block.json'), true);
    \ModularTableBlocks\Tests\check($metadata['version'] === $package['version'], 'Packaged block version mismatch');
}
echo 'ZIP contains ' . \count($files) . " files. Packaged plugin registration and rendering passed.\n";
