<?php
namespace ModularTableBlocks\Render;

function positive_span($value): int {
    return \is_numeric($value) && (float) $value === (float) (int) $value && (int) $value >= 1 && (int) $value <= 100
        ? (int) $value : 1;
}

function render_cell(\WP_Block $cell, bool $header = false, int $remaining_rows = 100): string {
    $attributes = $cell->attributes;
    $tag = $header || ($attributes['tag'] ?? '') === 'th' ? 'th' : 'td';
    $extra = \ModularTableBlocks\Styles\child_attributes($cell, 'cell');
    foreach (array('colSpan' => 'colspan', 'rowSpan' => 'rowspan') as $key => $html_attribute) {
        $span = positive_span($attributes[$key] ?? 1);
        if ($key === 'rowSpan') {
            $span = \min($span, $remaining_rows);
        }
        if ($span > 1) {
            $extra .= ' ' . $html_attribute . '="' . \esc_attr((string) $span) . '"';
        }
    }
    $scope = $header ? 'col' : ($attributes['scope'] ?? '');
    if ($tag === 'th' && \in_array($scope, array('col', 'row', 'colgroup', 'rowgroup'), true)) {
        $extra .= ' scope="' . \esc_attr($scope) . '"';
    }
    $content = '';
    foreach ($cell->inner_blocks as $child) {
        // Render core content through WordPress, never editor wrappers.
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
    $columns = $attributes['columns'] ?? array();
    if (\is_array($columns) && \count($columns) > 0 && \count($columns) <= 50) {
        $html .= '<colgroup>';
        foreach ($columns as $column) {
            $width = \is_array($column) ? ($column['width'] ?? '') : '';
            $html .= '<col' . (\ModularTableBlocks\Styles\valid_token('tableWidth', $width) ? ' style="--mtb-column-width:' . \esc_attr($width) . '"' : '') . '>';
        }
        $html .= '</colgroup>';
    }
    $rows = array();
    foreach ($block->inner_blocks as $row) {
        if ($row->name === 'modular-table-blocks/row') {
            $rows[] = $row;
        }
    }
    $count = \count($rows);
    $requested_headers = $attributes['headerRows'] ?? 0;
    $headers = \is_numeric($requested_headers) && (float) $requested_headers === (float) (int) $requested_headers
        ? \max(0, \min($count, (int) $requested_headers)) : 0;
    // Keep row order; only a contiguous prefix/suffix may be head/foot.
    while ($headers < $count && ($rows[$headers]->attributes['section'] ?? '') === 'head') {
        $headers++;
    }
    $foot_start = $count;
    while ($foot_start > $headers && ($rows[$foot_start - 1]->attributes['section'] ?? '') === 'foot') {
        $foot_start--;
    }
    $open_section = '';
    foreach ($rows as $index => $row) {
        $section = $index < $headers ? 'thead' : ($index >= $foot_start ? 'tfoot' : 'tbody');
        if ($section !== $open_section) {
            if ($open_section !== '') {
                $html .= '</' . $open_section . '>';
            }
            $html .= '<' . $section . '>';
            $open_section = $section;
        }
        $html .= '<tr' . \ModularTableBlocks\Styles\child_attributes($row, 'row') . '>';
        foreach ($row->inner_blocks as $cell) {
            if ($cell->name === 'modular-table-blocks/cell') {
                $section_end = $section === 'thead' ? $headers : ($section === 'tbody' ? $foot_start : $count);
                $html .= render_cell($cell, $index < $headers, $section_end - $index);
            }
        }
        $html .= '</tr>';
    }
    if ($open_section !== '') {
        $html .= '</' . $open_section . '>';
    }
    $html .= '</table>';
    if (($attributes['responsiveMode'] ?? '') === 'scroll') {
        $label = \is_string($caption) && $caption !== '' ? $caption : \__('Scrollable table', 'modular-table-blocks');
        // An explicit user choice enables a keyboard-accessible scroll region.
        return '<div class="modular-table-blocks-scroll" role="region" tabindex="0" aria-label="' . \esc_attr($label) . '">' . $html . '</div>';
    }
    return $html;
}
