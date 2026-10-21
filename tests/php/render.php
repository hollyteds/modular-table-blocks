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

$m1_cell = '<!-- wp:modular-table-blocks/cell {"horizontalAlign":"right","verticalAlign":"bottom"} --><!-- wp:heading --><h2 class="wp-block-heading">Heading</h2><!-- /wp:heading --><!-- wp:list --><ul class="wp-block-list"><!-- wp:list-item --><li>Item</li><!-- /wp:list-item --></ul><!-- /wp:list --><!-- wp:buttons --><div class="wp-block-buttons"><!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="https://example.com/">Button</a></div><!-- /wp:button --></div><!-- /wp:buttons --><!-- /wp:modular-table-blocks/cell -->';
$m1_row = '<!-- wp:modular-table-blocks/row -->' . $m1_cell . '<!-- /wp:modular-table-blocks/row -->';
$m1 = '<!-- wp:modular-table-blocks/table {"columns":[{"width":"900px"}],"headerRows":1,"responsiveMode":"scroll","caption":"Wide table"} -->' . $m1_row . $m1_row . '<!-- /wp:modular-table-blocks/table -->';
$m1_html = \do_blocks($m1);
$dom->loadHTML('<!doctype html><html><body>' . $m1_html . '</body></html>');
$xpath = new \DOMXPath($dom);
check($xpath->query('//div[@role="region"][@tabindex="0"]/table/thead/tr/th[@scope="col"]/h2')->length === 1, 'Header section or rich content lost');
check($xpath->query('//table/tbody/tr/td/ul/li')->length === 1, 'Nested list invalid');
check($xpath->query('//table/tbody/tr/td/div[contains(@class,"wp-block-buttons")]')->length === 1, 'Buttons content lost');
check($xpath->query('//table/colgroup/col')->length === 1, 'Column group missing');
check(\strpos($m1_html, '--mtb-column-width:900px') !== false, 'Column width missing');
check(\strpos($m1_html, 'text-align:right;vertical-align:bottom;') !== false, 'Cell alignment lost');
check($xpath->query('//table/div | //tbody/div | //thead/div | //tr/div')->length === 0, 'Invalid structural wrappers');
$unsafe = \str_replace('900px', '1px;position:fixed', $m1);
check(\strpos(\do_blocks($unsafe), 'position:fixed') === false, 'Unsafe column style emitted');
$sectioned = '<!-- wp:modular-table-blocks/table {"columns":[{}]} -->' . \str_replace('wp:modular-table-blocks/row -->', 'wp:modular-table-blocks/row {"section":"head"} -->', $m1_row) . $m1_row . \str_replace('wp:modular-table-blocks/row -->', 'wp:modular-table-blocks/row {"section":"foot"} -->', $m1_row) . '<!-- /wp:modular-table-blocks/table -->';
$sectioned_html = \do_blocks($sectioned);
check(\substr_count($sectioned_html, '<thead>') === 1 && \substr_count($sectioned_html, '<tfoot>') === 1, 'Section normalization failed');
echo "M1 sections, widths, alignment, scroll region and rich content checks passed.\n";

$merged_cell = '<!-- wp:modular-table-blocks/cell {"colSpan":2,"rowSpan":2} -->';
foreach (array('A', 'B', 'D', 'E') as $label) {
    $merged_cell .= '<!-- wp:paragraph --><p>' . $label . '</p><!-- /wp:paragraph -->';
}
$merged_cell .= '<!-- /wp:modular-table-blocks/cell -->';
$plain_cell = function ($label) {
    return '<!-- wp:modular-table-blocks/cell --><!-- wp:paragraph --><p>' . $label . '</p><!-- /wp:paragraph --><!-- /wp:modular-table-blocks/cell -->';
};
$merged_source = '<!-- wp:modular-table-blocks/table {"columns":[{},{},{}]} --><!-- wp:modular-table-blocks/row -->' . $merged_cell . $plain_cell('C') . '<!-- /wp:modular-table-blocks/row --><!-- wp:modular-table-blocks/row -->' . $plain_cell('F') . '<!-- /wp:modular-table-blocks/row --><!-- wp:modular-table-blocks/row -->' . $plain_cell('G') . $plain_cell('H') . $plain_cell('I') . '<!-- /wp:modular-table-blocks/row --><!-- /wp:modular-table-blocks/table -->';
$merged_html = \do_blocks($merged_source);
$dom->loadHTML('<!doctype html><html><body>' . $merged_html . '</body></html>');
$xpath = new \DOMXPath($dom);
check($xpath->query('//table/tbody/tr')->length === 3, 'Merged rows lost');
check($xpath->query('//table/tbody/tr/td[@colspan="2"][@rowspan="2"]/p')->length === 4, 'Merged content or spans lost');
foreach (range('A', 'I') as $label) {
    check($xpath->query('//table/tbody/tr/td/p[text()="' . $label . '"]')->length === 1, 'Merged content lost or duplicated: ' . $label);
}
$covered = '<!-- wp:modular-table-blocks/table {"columns":[{},{}]} --><!-- wp:modular-table-blocks/row -->' . $merged_cell . '<!-- /wp:modular-table-blocks/row --><!-- wp:modular-table-blocks/row /--><!-- /wp:modular-table-blocks/table -->';
check(\substr_count(\do_blocks($covered), '<tr') === 2, 'Fully covered row lost');
echo "M2 merged HTML, content preservation and covered rows checks passed.\n";
