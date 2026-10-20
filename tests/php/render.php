<?php
namespace ModularTableBlocks\Tests;

require '/var/www/html/wp-load.php';
global $wp_version;
echo 'WordPress ' . $wp_version . ' / PHP ' . PHP_VERSION . "\n";

function check(bool $condition, string $message): void {
    if (!$condition) {
        throw new \RuntimeException($message);
    }
}

foreach (array('table', 'row', 'cell') as $name) {
    check(\WP_Block_Type_Registry::get_instance()->is_registered('modular-table-blocks/' . $name), 'Missing block: ' . $name);
}

$cell = '<!-- wp:modular-table-blocks/cell {"tag":"th","scope":"col"} --><!-- wp:paragraph --><p>Cell content</p><!-- /wp:paragraph --><!-- /wp:modular-table-blocks/cell -->';
$row = '<!-- wp:modular-table-blocks/row -->' . $cell . $cell . '<!-- /wp:modular-table-blocks/row -->';
$source = '<!-- wp:modular-table-blocks/table {"columns":[{},{}],"caption":"A < B"} -->' . $row . $row . '<!-- /wp:modular-table-blocks/table -->';
$calls = 0;
\add_filter('render_block_core/paragraph', function ($html) use (&$calls) {
    $calls++;
    return $html;
});
$html = \do_blocks($source);
check($calls === 4, 'Child contents must render exactly once');
check(\substr_count($html, 'Cell content') === 4, 'Nested content lost or duplicated');
check(\strpos($html, '<caption>A &lt; B</caption>') !== false, 'Caption not escaped');
check(\strpos($html, 'scope="col"') !== false, 'Header association lost');
check(\strpos($html, '<div') === false, 'Editor wrapper in table HTML');
$dom = new \DOMDocument();
$dom->loadHTML('<!doctype html><html><body>' . $html . '</body></html>');
$xpath = new \DOMXPath($dom);
check($xpath->query('//table/tbody/tr/th/p')->length === 4, 'Invalid table hierarchy');
$parsed = \parse_blocks($source);
check(\parse_blocks(\serialize_blocks($parsed)) === $parsed, 'Block tree did not round-trip');
check(\ModularTableBlocks\Render\positive_span(-1) === 1, 'Invalid negative span');
check(\ModularTableBlocks\Render\positive_span('2" onclick="bad') === 1, 'Unsafe span accepted');
check(\ModularTableBlocks\Render\positive_span(1.5) === 1, 'Fractional span accepted');
check(\ModularTableBlocks\Render\positive_span(2) === 2, 'Valid span lost');
echo "PHP registration, serialization and HTML checks passed.\n";

$fixtures = \json_decode(\file_get_contents(__DIR__ . '/../fixtures/tokens.json'), true);
foreach ($fixtures as $fixture) {
    check(\ModularTableBlocks\Styles\valid_token($fixture['key'], $fixture['value']) === $fixture['valid'], 'Token validation mismatch: ' . $fixture['key'] . ' ' . \json_encode($fixture['value']));
}
check(\ModularTableBlocks\Styles\token_style(array()) === '', 'Unset tokens must inherit');
check(\ModularTableBlocks\Styles\token_style(array('unknown' => 'bad', 'textColor' => '#123456', 'borderWidth' => '-1px')) === '--mtb-text-color:#123456;', 'Unsafe or unknown style emitted');
echo "Shared CSS token validation checks passed.\n";
