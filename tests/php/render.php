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


/** libxml uses HTML4; accept warnings for HTML5 tags used here, but no other errors. */
function load_dom(\DOMDocument $dom, string $html): void {
    $previous = \libxml_use_internal_errors(true);
    \libxml_clear_errors();
    $loaded = $dom->loadHTML($html);
    $errors = \libxml_get_errors();
    \libxml_clear_errors();
    \libxml_use_internal_errors($previous);
    check($loaded, 'Public HTML could not be parsed');
    foreach ($errors as $error) {
        check($error->code === 801 && \in_array(\trim($error->message), array('Tag figure invalid', 'Tag mark invalid'), true), 'Unexpected HTML parse error: ' . $error->message);
    }
}


foreach (array('table', 'cell', 'cell-text') as $name) {
    check(\WP_Block_Type_Registry::get_instance()->is_registered('modular-table-blocks/' . $name), 'Missing block: ' . $name);
}
check(!\WP_Block_Type_Registry::get_instance()->is_registered('modular-table-blocks/row'), 'Row block must not be registered');
$type = \WP_Block_Type_Registry::get_instance()->get_registered('modular-table-blocks/cell');
check($type->parent === array('modular-table-blocks/table'), 'Cells must be direct children');
require_once __DIR__ . '/artifacts.php';
\ModularTableBlocks\Tests\Artifacts\check_build(WP_PLUGIN_DIR . '/modular-table-blocks');
$package_entries = \json_decode(\file_get_contents(WP_PLUGIN_DIR . '/modular-table-blocks/package.json'), true)['files'];
check(\ModularTableBlocks\Tests\Artifacts\package_allows('THIRD_PARTY_NOTICES.md', $package_entries), 'Third-party notices must be allowed in the package');
foreach (array('../build/index.js', 'build/../private', '/build/index.js', '.git/config', 'build-other/index.js') as $invalid_path) {
    check(!\ModularTableBlocks\Tests\Artifacts\package_allows($invalid_path, $package_entries), 'Invalid package path allowed');
}
$editor_asset = require \dirname(__DIR__, 2) . '/build/index.asset.php';
check(\wp_styles()->registered['mtb-editor-styles']->ver === $editor_asset['version'], 'Editor CSS cache is stale');
$theme_json = new \WP_Theme_JSON(array('version' => 2, 'styles' => array('blocks' => array('modular-table-blocks/table' => array('spacing' => array('margin' => array('top' => '37px', 'bottom' => '31px')))))));
$theme_styles = $theme_json->get_stylesheet(array('styles'));
check(\strpos($theme_styles, '.modular-table-blocks-figure') !== false && \strpos($theme_styles, '.modular-table-blocks-editor') !== false && \preg_match('/margin-top:\s*37px/', $theme_styles), 'Theme JSON spacing must target figure and the editor wrapper');

function cell(int $row, int $column, string $content = '', array $attributes = array()): string {
    return '<!-- wp:modular-table-blocks/cell ' . \wp_json_encode(\array_merge(array('row' => $row, 'column' => $column), $attributes)) . ' -->' . $content . '<!-- /wp:modular-table-blocks/cell -->';
}
function source(int $rows, int $columns, array $cells, array $attributes = array()): string {
    return '<!-- wp:modular-table-blocks/table ' . \wp_json_encode(\array_merge(array('rowCount' => $rows, 'columns' => \array_fill(0, $columns, new \stdClass())), $attributes)) . ' -->' . \implode('', $cells) . '<!-- /wp:modular-table-blocks/table -->';
}
function paragraph(string $text): string {
    return '<!-- wp:paragraph --><p>' . \esc_html($text) . '</p><!-- /wp:paragraph -->';
}
foreach (\json_decode(\file_get_contents(__DIR__ . '/../fixtures/grid-validation.json'), true) as $case) {
    $cells = array();
    foreach ($case['cells'] as $a) {
        $cells[] = cell($a['row'], $a['column'], '', array('rowSpan' => $a['rowSpan'], 'colSpan' => $a['colSpan']));
    }
    check((\do_blocks(source($case['rows'], $case['columns'], $cells)) !== '') === $case['valid'], 'Shared grid validation differs: ' . $case['name']);
}
$calls = 0;
\add_filter('render_block_core/paragraph', function ($html) use (&$calls) { $calls++; return $html; });
$source = source(2, 2, array(cell(1, 1, paragraph('D')), cell(0, 1, paragraph('B')), cell(1, 0, paragraph('C')), cell(0, 0, paragraph('A'))), array('caption' => 'A < B', 'headerRows' => 1));
$html = \do_blocks($source);
check($calls === 4, 'Contents must render once');
check(\strpos($html, '<caption>A &lt; B</caption>') !== false, 'Unsafe caption');
$dom = new \DOMDocument();
load_dom($dom, '<!doctype html><html><body>' . $html . '</body></html>');
$xpath = new \DOMXPath($dom);
check($xpath->query('//body/figure[@class="modular-table-blocks-figure"]/table')->length === 1, 'Public tables must have one semantic figure wrapper');
check($xpath->query('//figure/figcaption')->length === 0, 'Table caption must not be duplicated as a figure caption');
check($xpath->query('//table/thead/tr/th[@scope="col"]/p')->length === 2, 'Header semantics lost');
check($xpath->query('//table/tbody/tr/td/p')->length === 2, 'Body hierarchy invalid');
check($xpath->query('//table/thead/tr/th[1]/p[text()="A"]')->length === 1, 'Coordinates must determine order');
check($xpath->query('//table/div | //thead/div | //tbody/div | //tr/div')->length === 0, 'Editor wrapper leaked');
check($xpath->query('//tr[@style] | //tr[@class]')->length === 0, 'Rows must have no block attributes');
check($xpath->query('//table[@data-mtb-column-width-mode="equal"]/colgroup[@style="--mtb-column-count:2"]')->length === 1, 'Unspecified column mode must use equal logical columns');
check($xpath->query('//col[@style]')->length === 0, 'Equal columns must not duplicate default widths onto each col');
foreach (array(null, 'equal', 'auto', 'custom', 'bad" onclick="alert(1)') as $mode) {
    $settings = array('columns' => array(array('width' => '20%'), array('width' => '80%')));
    if ($mode !== null) $settings['columnWidthMode'] = $mode;
    $mode_html = \do_blocks(source(1, 2, array(cell(0, 0, paragraph('A')), cell(0, 1, paragraph('B'))), $settings));
    load_dom($dom, '<!doctype html><html><body>' . $mode_html . '</body></html>');
    $mode_xpath = new \DOMXPath($dom);
    $resolved_mode = \in_array($mode, array('equal', 'auto', 'custom'), true) ? $mode : 'custom';
    check($mode_xpath->query('//table')->item(0)->getAttribute('data-mtb-column-width-mode') === $resolved_mode, 'Wrong column mode');
    check($mode_xpath->query('//col[@style]')->length === ($resolved_mode === 'custom' ? 2 : 0), 'Inactive column widths must not be rendered');
    check(\strpos($mode_html, 'onclick') === false, 'Unsafe column mode leaked');
}
// Captions keep semantic placement while allowing only sanitized inline content.
$caption_source = source(1, 1, array(cell(0, 0, paragraph('Cell'))), array(
    'caption' => '<strong>Report &amp; summary</strong>',
    'captionEnabled' => true,
    'captionSide' => 'bottom',
    'captionAlign' => 'right',
    'responsiveMode' => 'scroll',
));
$caption_html = \do_blocks($caption_source);
$caption_dom = new \DOMDocument();
load_dom($caption_dom, '<!doctype html><html><body>' . $caption_html . '</body></html>');
$caption_xpath = new \DOMXPath($caption_dom);
check($caption_xpath->query('//table/*[1][self::caption][@data-mtb-caption-side="bottom"][@style="text-align:right"]/strong')->length === 1, 'Rich caption or semantic placement was lost');
check($caption_xpath->query('//figcaption')->length === 0, 'Caption must stay inside table');
check($caption_xpath->query('//div[@role="region"]')->item(0)->getAttribute('aria-label') === 'Report & summary', 'Scroll label must contain decoded plain text, never HTML');
$hidden_caption = \do_blocks(source(1, 1, array(cell(0, 0)), array('caption' => '<strong>Hidden caption</strong>', 'captionEnabled' => false, 'responsiveMode' => 'scroll')));
check(\strpos($hidden_caption, '<caption') === false && \strpos($hidden_caption, 'Hidden caption') === false, 'Hidden caption leaked into public HTML or its scroll label');
check(\strpos($hidden_caption, 'aria-label="Scrollable table"') !== false, 'Hidden caption must use the fallback region name');
check(\strpos(\do_blocks(source(1, 1, array(cell(0, 0)), array('caption' => '', 'captionEnabled' => true))), '<caption') === false, 'Empty captions must not be published');
$unsafe_caption = \do_blocks(source(1, 1, array(cell(0, 0)), array(
    'caption' => '<strong onclick="alert(1)">Safe</strong><a href="javascript:alert(1)">link</a><img src="https://example.test/image.png" onerror="alert(1)"></caption><tr><td>inline only</td></tr>',
    'captionEnabled' => true,
    'captionSide' => 'bottom;position:fixed',
    'captionAlign' => 'center" onclick="alert(1)',
)));
load_dom($caption_dom, '<!doctype html><html><body>' . $unsafe_caption . '</body></html>');
$caption_xpath = new \DOMXPath($caption_dom);
check($caption_xpath->query('//table')->length === 1 && $caption_xpath->query('//table/caption')->length === 1 && $caption_xpath->query('//table/tbody/tr')->length === 1, 'Caption content must not inject table structure');
check($caption_xpath->query('//caption//*[@onclick or @onerror]')->length === 0 && \strpos($unsafe_caption, 'javascript:') === false, 'Unsafe caption attribute or URL was rendered');
check($caption_xpath->query('//caption[@data-mtb-caption-side or @style]')->length === 0, 'Invalid caption settings must not render attributes');
echo "Inline caption visibility, placement, alignment, sanitization and plain scroll labels passed.\n";

$parsed = \parse_blocks($source);
check(\parse_blocks(\serialize_blocks($parsed)) === $parsed, 'Flat tree failed round trip');
check(\count($parsed[0]['innerBlocks']) === 4, 'Cells are not direct children');

$spaced_html = \do_blocks(source(1, 1, array(cell(0, 0, paragraph('Spaced'))), array('borderCollapse' => 'separate', 'styleTokens' => array('borderSpacingHorizontal' => '12px', 'borderSpacingVertical' => '0.5em'))));
check(\strpos($spaced_html, 'data-mtb-border-collapse="separate"') !== false, 'Separate border layout lost');
check(\strpos($spaced_html, '--mtb-border-spacing-x:12px;') !== false, 'Horizontal spacing lost');
check(\strpos($spaced_html, '--mtb-border-spacing-y:0.5em') !== false, 'Vertical spacing lost');
check(\strpos($spaced_html, '<td class="wp-block-modular-table-blocks-cell">') !== false, 'Table spacing must not be copied to cells');
check(\strpos($html, 'data-mtb-border-collapse') === false, 'Default border layout must not add attributes');
$unsafe_spacing = \do_blocks(source(1, 1, array(cell(0, 0)), array('borderCollapse' => 'separate" onclick="alert(1)', 'styleTokens' => array('borderSpacingHorizontal' => '10%;color:red', 'borderSpacingVertical' => '-1px'))));
check(\strpos($unsafe_spacing, 'data-mtb-border-collapse') === false && \strpos($unsafe_spacing, '--mtb-border-spacing') === false && \strpos($unsafe_spacing, 'onclick') === false, 'Unsafe border layout or spacing emitted');

$covered = source(3, 2, array(cell(0, 0, paragraph('Merged'), array('colSpan' => 2, 'rowSpan' => 3))));
$covered_html = \do_blocks($covered);
check(\substr_count($covered_html, '<tr>') === 3, 'Fully covered rows were lost');
check(\strpos($covered_html, '<tr></tr><tr></tr>') !== false, 'Covered row placeholders missing');
check(\substr_count($covered_html, 'Merged') === 1, 'Merged content duplicated');
foreach (array(
    source(1, 1, array(cell(0, 0), cell(0, 0))),
    source(2, 2, array(cell(0, 0))),
    source(1, 1, array(cell(2, 0))),
    source(1, 1, array(cell(0, 0, '', array('rowSpan' => -1)))),
    source(2, 1, array(cell(0, 0, '', array('rowSpan' => 2))), array('headerRows' => 1)),
    source(101, 1, array()),
    '<!-- wp:modular-table-blocks/table {"columns":[{}]} --><!-- wp:modular-table-blocks/row /--><!-- /wp:modular-table-blocks/table -->',
) as $invalid) {
    check(\do_blocks($invalid) === '', 'Invalid or old grid must not render as a table');
}

$native_source = source(1, 1, array(cell(0, 0, paragraph('Native styles'), array('textColor' => 'contrast', 'verticalAlign' => 'bottom', 'style' => array('typography' => array('fontSize' => '32px', 'lineHeight' => 2, 'textAlign' => 'right')), 'styleTokens' => array('cellPaddingBlock' => '12px', 'cellPaddingTop' => '3px', 'borderLeftWidth' => '0', 'borderTopStyle' => 'dashed')))), array('responsiveMode' => 'scroll', 'columns' => array(array('width' => '900px'))));
$native_html = \do_blocks($native_source);
load_dom($dom, '<!doctype html><html><body>' . $native_html . '</body></html>');
$xpath = new \DOMXPath($dom);
check($xpath->query('//figure/div[@class="modular-table-blocks-scroll"][@role="region"][@tabindex="0"]/table')->length === 1, 'Scrollable tables must keep their focusable region inside figure');
check(!$xpath->query('//figure')->item(0)->hasAttribute('role'), 'Scroll region must not replace figure semantics');
foreach (array('font-size:', 'line-height:2', 'text-align:right', '--mtb-cell-vertical-align:bottom', 'var(--wp--preset--color--contrast)', '--mtb-cell-pt:3px', '--mtb-cell-pb:12px', '--mtb-cell-border-l-width:0', '--mtb-cell-border-t-style:dashed', '--mtb-column-width:900px', 'role="region" tabindex="0"') as $declaration) {
    check(\strpos($native_html, $declaration) !== false, 'Style lost: ' . $declaration);
}
$table_styles = source(1, 1, array(cell(0, 0, paragraph('Table box'))), array(
    'backgroundColor' => 'contrast',
    'style' => array('typography' => array('fontFamily' => 'monospace', 'fontWeight' => '600', 'fontStyle' => 'italic', 'letterSpacing' => '2px', 'textTransform' => 'uppercase', 'textDecoration' => 'underline'), 'spacing' => array('margin' => array('top' => '23px', 'left' => '11px')), 'dimensions' => array('minHeight' => '360px')),
    'styleTokens' => array('backgroundColor' => '#ff0000', 'cellPaddingTop' => '15px', 'borderWidth' => '2px'),
));
$table_styles_html = \do_blocks($table_styles);
load_dom($dom, '<!doctype html><html><body>' . $table_styles_html . '</body></html>');
$xpath = new \DOMXPath($dom);
check(\strpos($xpath->query('//figure')->item(0)->getAttribute('style'), 'margin-top:23px') !== false, 'Outer margins must apply to figure');
check(\strpos($xpath->query('//figure/table')->item(0)->getAttribute('style'), 'margin-top') === false, 'Outer margins must not apply twice');
check(\strpos($xpath->query('//figure/table')->item(0)->getAttribute('style'), 'min-height:360px') !== false, 'Native sizes must still apply to table');
foreach (array('wide', 'full') as $alignment) {
    $aligned = \do_blocks(source(1, 1, array(cell(0, 0)), array('align' => $alignment, 'className' => 'custom-table')));
    load_dom($dom, '<!doctype html><html><body>' . $aligned . '</body></html>');
    $xpath = new \DOMXPath($dom);
    check($xpath->query('//figure[contains(@class,"align' . $alignment . '")]/table')->length === 1, 'Wide/full placement must apply to figure');
    $table_classes = $xpath->query('//table')->item(0)->getAttribute('class');
    check(\strpos($table_classes, 'align' . $alignment) === false, 'Wide/full placement must not apply twice');
    check(\strpos($table_classes, 'custom-table') !== false, 'Custom table classes must remain on table');
}
foreach (array('font-family:monospace', 'font-weight:600', 'font-style:italic', 'letter-spacing:2px', 'text-transform:uppercase', 'text-decoration:underline', 'margin-top:23px', 'margin-left:11px', 'min-height:360px', 'has-contrast-background-color', '--mtb-cell-pt:15px') as $declaration) {
    check(\strpos($table_styles_html, $declaration) !== false, 'Table native style lost: ' . $declaration);
}
check(\strpos($table_styles_html, '#ff0000') === false, 'Old table background masks native setting');

// Root block supports own native CSS; the plugin supplies only its extra styles.
foreach (array(
    array('style' => array('color' => array('background' => '#abcdef', 'text' => '#123456'), 'typography' => array('fontSize' => '24px', 'lineHeight' => '1.5', 'fontFamily' => 'monospace', 'fontWeight' => '600', 'fontStyle' => 'italic', 'letterSpacing' => '2px', 'textDecoration' => 'underline', 'textTransform' => 'uppercase', 'writingMode' => 'vertical-rl', 'textAlign' => 'center'))),
    array('styleTokens' => array('fontSize' => '24px', 'lineHeight' => '1.5', 'textColor' => '#123456', 'backgroundColor' => '#abcdef')),
    array('style' => array('color' => array('background' => '#abcdef'), 'typography' => array('fontSize' => '24px')), 'styleTokens' => array('fontSize' => '16px', 'backgroundColor' => '#ff0000')),
) as $case_index => $settings) {
    $styled = \do_blocks(source(1, 1, array(cell(0, 0)), $settings));
    load_dom($dom, '<!doctype html><html><body>' . $styled . '</body></html>');
    $styled_xpath = new \DOMXPath($dom);
    $inline = $styled_xpath->query('//table')->item(0)->getAttribute('style');
    foreach (array('font-size', 'background-color') as $property) {
        check(\preg_match_all('/(?:^|;)\s*' . \preg_quote($property, '/') . '\s*:/', $inline) === 1, 'Root property missing or duplicated: ' . $property . ' in ' . $inline);
    }
    foreach (array('color', 'line-height', 'font-family', 'font-weight', 'font-style', 'letter-spacing', 'text-decoration', 'text-transform', 'writing-mode', 'text-align') as $property) {
        $occurrences = \preg_match_all('/(?:^|;)\s*' . \preg_quote($property, '/') . '\s*:/', $inline);
        check($case_index === 0 ? $occurrences === 1 : $occurrences <= 1, 'Root property missing or duplicated: ' . $property);
    }
    check(\strpos($styled, '#ff0000') === false, 'Legacy background must not duplicate a native override');
}
$preset_html = \do_blocks(source(1, 1, array(cell(0, 0)), array('fontSize' => 'medium', 'backgroundColor' => 'contrast', 'fontFamily' => 'body')));
load_dom($dom, '<!doctype html><html><body>' . $preset_html . '</body></html>');
$preset_xpath = new \DOMXPath($dom);
$preset_table = $preset_xpath->query('//table')->item(0);
foreach (array('font-size', 'background-color', 'font-family') as $property) {
    check(\preg_match('/(?:^|;)\s*' . \preg_quote($property, '/') . '\s*:/', $preset_table->getAttribute('style')) === 0, 'Preset class duplicated by inline ' . $property);
}
foreach (array('has-medium-font-size', 'has-contrast-background-color', 'has-body-font-family') as $class) {
    check(\strpos($preset_table->getAttribute('class'), $class) !== false, 'Native preset class lost: ' . $class);
}
echo "Root native styles serialize once and presets use native classes.\n";
check(\strpos($table_styles_html, 'data-mtb-font-weight="inherit"') !== false, 'Explicit table weight must be inherited by default headers');
check(\ModularTableBlocks\Styles\table_layout_styles('font-family:"A; margin-top:99px";margin-top:23px;--mtb-w:80%;color:var(--color, rgb(1;2;3));') === array('figure' => 'margin-top:23px;--mtb-w:80%;', 'table' => 'font-family:"A; margin-top:99px";color:var(--color, rgb(1;2;3));'), 'Layout splitting must preserve quoted strings and CSS functions');
check(\ModularTableBlocks\Styles\table_layout_styles('margin:var(--wp--preset--spacing--40);font-family:"A\";B";min-height:360px') === array('figure' => 'margin:var(--wp--preset--spacing--40);', 'table' => 'font-family:"A\";B";min-height:360px;'), 'Layout splitting must preserve escaped quotes and a final declaration');
check(\strpos($native_html, 'data-mtb-font-weight') === false, 'Unset table weight must not add a derived marker');
check(\strpos(\do_blocks(source(1, 1, array(cell(0, 0, paragraph('Invalid weight'))), array('style' => array('typography' => array('fontWeight' => 'bold;color:red'))))), 'data-mtb-font-weight') === false, 'Invalid weight must not enable inheritance');
check(\strpos($table_styles_html, '<td class="wp-block-modular-table-blocks-cell">') !== false, 'Table box settings must not be copied to cell');
$cell_typography = array('fontFamily' => 'body', 'style' => array('typography' => array('fontWeight' => 600, 'fontStyle' => 'italic', 'letterSpacing' => '-0.5px', 'textDecoration' => 'underline', 'textTransform' => 'uppercase', 'writingMode' => 'vertical-rl')));
$cell_typography_html = \do_blocks(source(1, 2, array(cell(0, 0, paragraph('Styled cell'), $cell_typography), cell(0, 1, paragraph('Untouched')))));
load_dom($dom, '<!doctype html><html><body>' . $cell_typography_html . '</body></html>');
$xpath = new \DOMXPath($dom);
$styled_cell = $xpath->query('//td')->item(0);
foreach (array('font-family:var(--wp--preset--font-family--body)', 'font-weight:600', 'font-style:italic', 'letter-spacing:-0.5px', 'text-decoration:underline', 'text-transform:uppercase', 'writing-mode:vertical-rl') as $declaration) {
    check(\strpos($styled_cell->getAttribute('style'), $declaration) !== false, 'Cell typography lost: ' . $declaration);
}
check(\strpos($styled_cell->getAttribute('class'), 'has-body-font-family') !== false, 'Font preset class lost');
check(!$xpath->query('//td')->item(1)->hasAttribute('style'), 'Typography leaked to an unset sibling');
check(\ModularTableBlocks\Styles\block_style(array('style' => array('typography' => array('fontFamily' => '"Noto Sans JP", sans-serif')))) !== '', 'Valid custom font family rejected');
foreach (array('fontFamily' => 'serif;color:red', 'fontStyle' => array('italic'), 'fontWeight' => '1001', 'letterSpacing' => '2px;color:red', 'textDecoration' => 'url(https://example.test)', 'textTransform' => 'uppercase;position:fixed', 'writingMode' => 'vertical-rl;color:red') as $key => $value) {
    check(\ModularTableBlocks\Styles\block_style(array('style' => array('typography' => array($key => $value)))) === '', 'Invalid cell typography emitted: ' . $key);
}
$vertical_html = \do_blocks(source(1, 2, array(cell(0, 0), cell(0, 1, '', array('verticalAlign' => 'top'))), array('verticalAlign' => 'middle')));
load_dom($dom, '<!doctype html><html><body>' . $vertical_html . '</body></html>');
$xpath = new \DOMXPath($dom);
check(\strpos($xpath->query('//table')->item(0)->getAttribute('style'), '--mtb-cell-vertical-align:middle') !== false, 'Shared vertical alignment lost');
check(!$xpath->query('//td')->item(0)->hasAttribute('style'), 'An inheriting cell must not have a default style');
check(\strpos($xpath->query('//td')->item(1)->getAttribute('style'), '--mtb-cell-vertical-align:top') !== false, 'Explicit top alignment must override table alignment');
$legacy_background = \do_blocks(source(1, 1, array(cell(0, 0)), array('styleTokens' => array('backgroundColor' => '#abcdef', 'cellBackgroundColor' => '#123456'))));
check(\strpos($legacy_background, 'background-color:#abcdef') !== false, 'Legacy background lost');
check(\strpos($legacy_background, '--mtb-cell-bg:#123456') !== false, 'Saved cell default lost');
$unsafe = \str_replace('900px', '1px;position:fixed', $native_source);
check(\strpos(\do_blocks($unsafe), 'position:fixed') === false, 'Unsafe width emitted');
$unsafe_native = \ModularTableBlocks\Styles\block_style(array('style' => array('color' => array('text' => 'red;position:fixed'), 'typography' => array('fontSize' => '12px;position:fixed', 'textAlign' => 'right;position:fixed', 'lineHeight' => array('invalid')))));
check($unsafe_native === '', 'Unsafe style emitted');
$fixtures = \json_decode(\file_get_contents(__DIR__ . '/../fixtures/tokens.json'), true);
foreach ($fixtures as $fixture) check(\ModularTableBlocks\Styles\valid_token($fixture['key'], $fixture['value']) === $fixture['valid'], 'Token validation mismatch');
check(\ModularTableBlocks\Styles\token_style(array()) === '', 'Unset tokens must inherit');
$output_fixtures = \json_decode(\file_get_contents(__DIR__ . '/../fixtures/token-output.json'), true);
foreach ($output_fixtures as $fixture) {
    $css = \ModularTableBlocks\Styles\token_style($fixture['tokens']);
    $properties = array();
    $declarations = \array_filter(\explode(';', $css));
    foreach ($declarations as $declaration) {
        list($property, $value) = \explode(':', $declaration, 2);
        check(!isset($properties[$property]), 'Duplicate CSS variable: ' . $property);
        $properties[$property] = $value;
    }
    check($properties == $fixture['properties'], 'Token output mismatch: ' . $fixture['name']);
}

echo "Flat registration, coordinates, sections, invalid grids, covered rows, content and style checks passed.\n";

$text = "Literal <script>alert(1)</script> & \"quotes\"\nSecond line";
$saved_text = \nl2br(\esc_html($text), false);
$text_block = array('blockName' => 'modular-table-blocks/cell-text', 'attrs' => array(), 'innerBlocks' => array(), 'innerHTML' => $saved_text, 'innerContent' => array($saved_text));
$text_source = \serialize_block($text_block);
$text_html = \do_blocks($text_source);
check($text_html === \nl2br(\esc_html($text), false), 'Cell text must be escaped and preserve line breaks without a wrapper');
check(\strpos($text_html, '<script>') === false && \strpos($text_html, '<p') === false && \strpos($text_html, '<span') === false, 'Cell text emitted executable markup or a wrapper');
check(\ModularTableBlocks\Render\render_cell_text(array('content' => array('bad'))) === '', 'Invalid cell text was not rejected');
check(\ModularTableBlocks\Render\render_cell_text(array()) === '', 'Empty cell text must render nothing');
$text_cell = '<!-- wp:modular-table-blocks/cell -->' . $text_source . '<!-- /wp:modular-table-blocks/cell -->';
$text_table = source(1, 2, array(cell(0, 0, $text_source), cell(0, 1)));

$text_table_html = \do_blocks($text_table);
check(\strpos($text_table_html, $text_html) !== false, 'Nested plain text lost');
load_dom($dom, '<!doctype html><html><body>' . $text_table_html . '</body></html>');
$xpath = new \DOMXPath($dom);
check($xpath->query('//table/tbody/tr/td')->length === 2, 'Empty cell lost');
check($xpath->query('//table/tbody/tr/td[1]/*[not(self::br)]')->length === 0, 'Cell text must not add a wrapper');
check($xpath->query('//table/tbody/tr/td[2]/node()')->length === 0, 'New cells must remain empty');
$type = \WP_Block_Type_Registry::get_instance()->get_registered('modular-table-blocks/cell-text');
check($type->parent === array('modular-table-blocks/cell'), 'Cell text must be restricted to cells');
foreach (array('html', 'customClassName', 'customCSS', 'anchor', 'reusable', 'renaming', 'lock', 'visibility') as $support) {
    check(($type->supports[$support] ?? null) === false, 'Unexpected cell text setting: ' . $support);
}
foreach (array('&amp; &#65; &lt;em&gt;', "First\nSecond", '<img src=x onerror=alert(1)>') as $literal) {
    $encoded = \nl2br(\htmlspecialchars($literal, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8', true), false);
    check(\html_entity_decode(\wp_strip_all_tags(\ModularTableBlocks\Render\render_cell_text(array(), $encoded)), ENT_QUOTES | ENT_HTML5, 'UTF-8') === $literal, 'Literal entities or line breaks changed in cell text');
}
echo "Plain cell text escaping, empty cells and wrapper-free HTML checks passed.\n";

$inline = '<strong>Bold</strong> <em>Italic</em> <a href="https://example.com/" target="_blank" rel="noopener">Link</a><br><code>Code</code><s>Strike</s><u>Underline</u><sub>Sub</sub><sup>Sup</sup><mark style="background-color:#ffee00;color:#123456" class="has-inline-color">Highlight</mark>';
$inline_html = \ModularTableBlocks\Render\render_cell_text(array(), $inline);
$previous_errors = \libxml_use_internal_errors(true);
load_dom($dom, '<!doctype html><html><body><div id="content">' . $inline_html . '</div></body></html>');
\libxml_clear_errors();
\libxml_use_internal_errors($previous_errors);
$xpath = new \DOMXPath($dom);
foreach (array('strong', 'em', 'a', 'br', 'code', 's', 'u', 'sub', 'sup', 'mark') as $tag) check($xpath->query('//*[@id="content"]/' . $tag)->length === 1, 'Inline format lost: ' . $tag);
check($xpath->query('//mark[@style and @class]')->length === 1, 'Inline colors lost');
$unsafe_inline = \ModularTableBlocks\Render\render_cell_text(array(), '<p><strong onclick="alert(1)">Text</strong></p><script>alert(1)</script><a href="javascript:alert(1)">Link</a><img src="x" onerror="alert(1)">');
check(\strpos($unsafe_inline, '<p') === false && \strpos($unsafe_inline, '<script') === false && \strpos($unsafe_inline, 'onclick') === false && \strpos($unsafe_inline, 'onerror') === false && \strpos($unsafe_inline, 'javascript:') === false, 'Unsafe or block-level markup survived inline sanitization');
echo "Inline formats, links, colors and sanitization checks passed.\n";

// Background markers follow logical origins, never shifted DOM sibling positions.
foreach (array('rows', 'columns', 'none', 'bad" onclick="alert(1)') as $mode) {
    $background_html = \do_blocks(source(4, 3, array(
        cell(0, 0, '', array('colSpan' => 3)),
        cell(1, 0, '', array('rowSpan' => 2)), cell(1, 1, '', array('colSpan' => 2)),
        cell(2, 1, '', array('styleTokens' => array('cellBackgroundColor' => 'transparent'))), cell(2, 2),
        cell(3, 0, '', array('tag' => 'th')), cell(3, 1), cell(3, 2)
    ), array('headerRows' => 1, 'stripeMode' => $mode, 'styleTokens' => array('headerBackgroundColor' => '#123456', 'stripeBackgroundColor' => 'var(--wp--preset--color--accent)'))));
    load_dom($dom, '<!doctype html><html><body>' . $background_html . '</body></html>');
    $bg_xpath = new \DOMXPath($dom);
    check($bg_xpath->query('//th[@data-mtb-bg="header"]')->length === 2, 'Header backgrounds must include manual TH cells');
    check($bg_xpath->query('//td[@data-mtb-bg="stripe"]')->length === ($mode === 'columns' ? 3 : ($mode === 'rows' ? 2 : 0)), 'Stripes must use logical row/column origins');
    check($bg_xpath->query('//td[@data-mtb-bg-local]')->length === 1, 'Only a valid explicit cell background may override rules');
    check($bg_xpath->query('//td[@style]')->length === 1, 'Derived backgrounds must not duplicate inline colors per cell');
    check(\strpos($background_html, '--mtb-cell-header-bg:#123456') !== false && \strpos($background_html, '--mtb-cell-stripe-bg:var(--wp--preset--color--accent)') !== false, 'Parent background rule tokens lost');
    check(\strpos($background_html, 'onclick') === false, 'Unsafe stripe mode leaked');
}
foreach (array('url(evil)', 'red;position:fixed', "#fff\n") as $invalid) {
    check(!\ModularTableBlocks\Styles\valid_token('headerBackgroundColor', $invalid) && !\ModularTableBlocks\Styles\valid_token('stripeBackgroundColor', $invalid), 'Invalid rule color accepted');
}
echo "Header/stripe logical backgrounds, transparent overrides and safe tokens passed.\n";


foreach (\json_decode(\file_get_contents(__DIR__ . '/../fixtures/cell-semantics.json'), true) as $case) {
    $semantics = \ModularTableBlocks\Render\cell_semantics($case['table'], $case['cell']);
    check($semantics['tag'] === $case['tag'] && $semantics['is_managed_header'] === $case['managed'], 'Cell semantics differs from shared fixture');
}
echo "Shared managed/manual header semantics passed.\n";

$margin_html = \do_blocks(source(1, 1, array(cell(0, 0)), array('style' => array('spacing' => array('margin' => array('left' => '24px', 'right' => '2rem'))), 'styleTokens' => array('tableWidth' => '100%'))));
load_dom($dom, '<!doctype html><html><body>' . $margin_html . '</body></html>');
$margin_xpath = new \DOMXPath($dom);
$figure_margin_style = $margin_xpath->query('//figure')->item(0)->getAttribute('style');
check(\strpos($figure_margin_style, 'margin-left:24px') !== false && \strpos($figure_margin_style, 'margin-right:2rem') !== false, 'Native horizontal margins must remain on the figure');
check(\strpos($figure_margin_style, '--mtb-w:100%') !== false && \strpos($figure_margin_style, 'width:') === false, 'Explicit width token must remain without a calculated width declaration');
check(\strpos($margin_xpath->query('//table')->item(0)->getAttribute('style'), 'margin') === false, 'Horizontal margins must not be duplicated inside the figure');
echo "Native horizontal margins without calculated widths passed.\n";

require __DIR__ . '/updates.php';
