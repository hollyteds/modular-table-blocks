<?php
/**
 * Plugin Name: Modular Table Blocks
 * Description: Independently editable table and cell blocks.
 * Version: 0.2.0
 * Author: ht-CODE
 * Author URI: https://ht-code.jp
 * Requires at least: 6.6
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: modular-table-blocks
 * Domain Path: /languages
 */
namespace ModularTableBlocks;

if (!defined('ABSPATH')) {
    exit;
}

require_once __DIR__ . '/includes/styles.php';
require_once __DIR__ . '/includes/render-table.php';
require_once __DIR__ . '/includes/register.php';

\add_action('init', __NAMESPACE__ . '\\Blocks\\register_blocks');
\add_action('enqueue_block_editor_assets', __NAMESPACE__ . '\\Blocks\\enqueue_editor_styles');
