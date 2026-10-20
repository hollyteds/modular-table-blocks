<?php
namespace ModularTableBlocks\Blocks;

function register_blocks(): void {
    \load_plugin_textdomain(
        'modular-table-blocks',
        false,
        \dirname(\plugin_basename(\dirname(__DIR__) . '/modular-table-blocks.php')) . '/languages'
    );
    $asset_file = \dirname(__DIR__) . '/build/index.asset.php';
    if (!\file_exists($asset_file)) {
        return;
    }
    $asset = require $asset_file;
    \wp_register_script(
        'mtb-editor',
        \plugins_url('build/index.js', \dirname(__DIR__) . '/modular-table-blocks.php'),
        $asset['dependencies'],
        $asset['version'],
        true
    );
    \wp_set_script_translations('mtb-editor', 'modular-table-blocks', \dirname(__DIR__) . '/languages');
    $base = \dirname(__DIR__) . '/build/blocks/';
    foreach (array('table', 'row', 'cell') as $name) {
        \register_block_type($base . $name, array(
            'render_callback' => $name === 'table'
                ? 'ModularTableBlocks\\Render\\render_table'
                : __NAMESPACE__ . '\\render_child',
            // The root traverses the tree and renders cell contents exactly once.
            'skip_inner_blocks' => true,
        ));
    }
}

function render_child(): string {
    // Rows/cells are rendered only by their owning table, never independently.
    return '';
}
