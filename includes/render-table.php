<?php
namespace ModularTableBlocks\Render;

function positive_span($value): int {
    return \is_numeric($value) && (float) $value === (float) (int) $value && (int) $value >= 1 && (int) $value <= 100
        ? (int) $value : 1;
}

function render_cell(\WP_Block $cell): string {
    $attributes = $cell->attributes;
    $tag = ($attributes['tag'] ?? '') === 'th' ? 'th' : 'td';
    $extra = \ModularTableBlocks\Styles\child_attributes($cell, 'cell');
    foreach (array('colSpan' => 'colspan', 'rowSpan' => 'rowspan') as $key => $html_attribute) {
        $span = positive_span($attributes[$key] ?? 1);
        if ($span > 1) {
            $extra .= ' ' . $html_attribute . '="' . \esc_attr((string) $span) . '"';
        }
    }
    $scope = $attributes['scope'] ?? '';
    if ($tag === 'th' && \in_array($scope, array('col', 'row', 'colgroup', 'rowgroup'), true)) {
        $extra .= ' scope="' . \esc_attr($scope) . '"';
    }
    $content = '';
    foreach ($cell->inner_blocks as $child) {
        // Only paragraph content has been verified in M0. Do not silently discard
        // existing other content: render it through WordPress, but never nest tables.
        if ($child->name !== 'modular-table-blocks/table' && $child->name !== 'modular-table-blocks/row' && $child->name !== 'modular-table-blocks/cell') {
            $content .= $child->render();
        }
    }
    return '<' . $tag . $extra . '>' . $content . '</' . $tag . '>';
}

function render_table(array $attributes, string $content, \WP_Block $block): string {
    $style = \ModularTableBlocks\Styles\token_style($attributes['styleTokens'] ?? array());
    $html = '<table ' . \get_block_wrapper_attributes($style !== '' ? array('style' => $style) : array()) . '>';
    $caption = $attributes['caption'] ?? '';
    if (\is_string($caption) && $caption !== '') {
        $html .= '<caption>' . \esc_html($caption) . '</caption>';
    }
    // Preserve source row order.
    $open_section = '';
    foreach ($block->inner_blocks as $row) {
        if ($row->name !== 'modular-table-blocks/row') {
            continue;
        }
        // M0 only emits tbody. head/foot normalization belongs to M1; do not
        // reorder content or emit multiple thead/tfoot elements from malformed data.
        if ($open_section === '') {
            $html .= '<tbody>';
            $open_section = 'tbody';
        }
        $html .= '<tr' . \ModularTableBlocks\Styles\child_attributes($row, 'row') . '>';
        foreach ($row->inner_blocks as $cell) {
            if ($cell->name === 'modular-table-blocks/cell') {
                $html .= render_cell($cell);
            }
        }
        $html .= '</tr>';
    }
    if ($open_section !== '') {
        $html .= '</tbody>';
    }
    return $html . '</table>';
}
