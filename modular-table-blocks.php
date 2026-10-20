<?php
/**
 * Plugin Name: Modular Table Blocks
 * Description: Independently editable table, row and cell blocks. M0 technical preview.
 * Version: 0.1.0
 * Requires at least: 6.6
 * Requires PHP: 7.4
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
