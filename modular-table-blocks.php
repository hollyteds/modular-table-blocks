<?php
/**
 * Plugin Name: Modular Table Blocks
 * Description: Independently editable table, row and cell blocks.
 * Version: 0.1.0
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
