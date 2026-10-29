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
    // WordPress 7.1 moved the native background color from Color to Background.
    \wp_add_inline_script('mtb-editor', 'window.modularTableBlocksSettings = ' . \wp_json_encode(array(
        'backgroundInspectorGroup' => \version_compare(\get_bloginfo('version'), '7.1', '>=')
            ? 'background'
            : 'color',
    )) . ';', 'before');
    \wp_set_script_translations('mtb-editor', 'modular-table-blocks', \dirname(__DIR__) . '/languages');
    // Keep editor UI CSS in sync with JS even between releases (including CSS-only builds).
    \wp_register_style(
        'mtb-editor-styles',
        \plugins_url('build/index.css', \dirname(__DIR__) . '/modular-table-blocks.php'),
        array(),
        $asset['version']
    );
    \wp_style_add_data('mtb-editor-styles', 'rtl', 'replace');
    $base = \dirname(__DIR__) . '/build/blocks/';
    foreach (array('table', 'cell') as $name) {
        \register_block_type($base . $name, array(
            'render_callback' => $name === 'table'
                ? 'ModularTableBlocks\\Render\\render_table'
                : __NAMESPACE__ . '\\render_child',
            // The root traverses the tree and renders cell contents exactly once.
            'skip_inner_blocks' => true,
        ));
    }
    \register_block_type($base . 'cell-text', array(
        'render_callback' => 'ModularTableBlocks\\Render\\render_cell_text',
    ));
}

function enqueue_editor_styles(): void {
    // Modals live in the editor document, outside the iframe styled by editorStyle.
    \wp_enqueue_style('mtb-editor-styles');
}

function render_child(): string {
    // Cells are rendered only by their owning table, never independently.
    return '';
}
