<?php
namespace ModularTableBlocks\Render;

function table_limits(): array {
    static $limits = null;
    if ($limits === null) {
        $limits = \json_decode(\file_get_contents(__DIR__ . '/table-limits.json'), true);
    }
    return $limits;
}

function render_cell_text(array $attributes, string $content = ''): string {
    return render_inline_content($content);
}

function render_inline_content(string $content): string {
    // Keep only inline tags permitted by WordPress, without decoding escaped text.
    $post_tags = \wp_kses_allowed_html('post');
    $inline_tags = array('a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'del', 'dfn', 'em', 'i', 'img', 'ins', 'kbd', 'mark', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr');
    return \wp_kses(\str_replace('&amp;#', '&amp;&#35;', $content), \array_intersect_key($post_tags, \array_flip($inline_tags)));
}

function positive_span($value): int {
    return \is_numeric($value) && (float) $value === (float) (int) $value && (int) $value >= 1 && (int) $value <= table_limits()['rows']
        ? (int) $value : 1;
}

function render_cell(\WP_Block $cell, ?int $remaining_rows = null, array $table = array()): string {
    $remaining_rows = $remaining_rows ?? table_limits()['rows'];
    $attributes = $cell->attributes;
    $semantics = cell_semantics($table, $attributes);
    $tag = $semantics['tag'];
    $extra = \ModularTableBlocks\Styles\child_attributes($cell, 'cell');
    $rule = background_rule($table, $attributes);
    if ($rule !== '') {
        $extra .= ' data-mtb-bg="' . $rule . '"';
    }
    if (\ModularTableBlocks\Styles\valid_token('cellBackgroundColor', $attributes['styleTokens']['cellBackgroundColor'] ?? null)) {
        $extra .= ' data-mtb-bg-local=""';
    }
    foreach (array('colSpan' => 'colspan', 'rowSpan' => 'rowspan') as $key => $html_attribute) {
        $span = positive_span($attributes[$key] ?? 1);
        if ($key === 'rowSpan') {
            $span = \min($span, $remaining_rows);
        }
        if ($span > 1) {
            $extra .= ' ' . $html_attribute . '="' . \esc_attr((string) $span) . '"';
        }
    }
    $scope = $semantics['is_managed_header'] ? 'col' : ($attributes['scope'] ?? '');
    if ($tag === 'th' && \in_array($scope, array('col', 'row', 'colgroup', 'rowgroup'), true)) {
        $extra .= ' scope="' . \esc_attr($scope) . '"';
    }
    $content = '';
    foreach ($cell->inner_blocks as $child) {
        // Render core content through WordPress, never editor wrappers.
        if ($child->name !== 'modular-table-blocks/table' && $child->name !== 'modular-table-blocks/cell') {
            $content .= $child->render();
        }
    }
    return '<' . $tag . $extra . '>' . $content . '</' . $tag . '>';
}

/** Validate the canonical coordinates before producing semantic table markup. */
function grid_integer($value, int $minimum, int $maximum): ?int {
    return (\is_int($value) || \is_float($value)) && (float) $value === (float) (int) $value && $value >= $minimum && $value <= $maximum ? (int) $value : null;
}

function column_width_mode(array $attributes): string {
    $mode = $attributes['columnWidthMode'] ?? null;
    if (\in_array($mode, array('equal', 'auto', 'custom'), true)) {
        return $mode;
    }
    $columns = $attributes['columns'] ?? array();
    foreach (\is_array($columns) ? $columns : array() as $column) {
        if (\is_array($column) && \ModularTableBlocks\Styles\valid_token('tableWidth', $column['width'] ?? null)) {
            return 'custom';
        }
    }
    return 'equal';
}

/** Resolve both the visible tag and whether the table owns its type. */
function cell_semantics(array $table, array $cell): array {
    $row = grid_integer($cell['row'] ?? null, 0, table_limits()['rows'] - 1);
    $headers = grid_integer($table['headerRows'] ?? 0, 0, table_limits()['rows']) ?? 0;
    $managed = $row !== null && $row < $headers;
    return array('tag' => $managed || ($cell['tag'] ?? '') === 'th' ? 'th' : 'td', 'is_managed_header' => $managed);
}

/** Use validated logical origins, not DOM sibling indices shifted by spans. */
function background_rule(array $table, array $cell): string {
    $row = grid_integer($cell['row'] ?? null, 0, table_limits()['rows'] - 1);
    $column = grid_integer($cell['column'] ?? null, 0, table_limits()['columns'] - 1);
    if ($row === null || $column === null) {
        return '';
    }
    $headers = grid_integer($table['headerRows'] ?? 0, 0, table_limits()['rows']) ?? 0;
    if (cell_semantics($table, $cell)['tag'] === 'th') {
        return 'header';
    }
    $mode = $table['stripeMode'] ?? '';
    $index = $mode === 'rows' ? $row - $headers : ($mode === 'columns' ? $column : null);
    return $index !== null && $index % 2 === 1 ? 'stripe' : '';
}

function render_table(array $attributes, string $content, \WP_Block $block): string {
    $count = grid_integer($attributes['rowCount'] ?? null, 1, table_limits()['rows']);
    $columns = $attributes['columns'] ?? null;
    if ($count === null || !\is_array($columns) || \count($columns) < 1 || \count($columns) > table_limits()['columns']) {
        return '';
    }
    $width = \count($columns);
    $headers = grid_integer($attributes['headerRows'] ?? 0, 0, $count);
    if ($headers === null || \count($block->inner_blocks) > $count * $width) {
        return '';
    }
    $slots = \array_fill(0, $count, \array_fill(0, $width, false));
    $rows = \array_fill(0, $count, array());
    foreach ($block->inner_blocks as $cell) {
        if ($cell->name !== 'modular-table-blocks/cell') {
            return '';
        }
        $a = $cell->attributes;
        $r = grid_integer($a['row'] ?? null, 0, $count - 1);
        $c = grid_integer($a['column'] ?? null, 0, $width - 1);
        $h = grid_integer($a['rowSpan'] ?? 1, 1, $count);
        $w = grid_integer($a['colSpan'] ?? 1, 1, $width);
        if ($r === null || $c === null || $h === null || $w === null || $r + $h > $count || $c + $w > $width || ($r < $headers && $r + $h > $headers)) {
            return '';
        }
        for ($i = $r; $i < $r + $h; $i++) {
            for ($j = $c; $j < $c + $w; $j++) {
                if ($slots[$i][$j]) {
                    return '';
                }
                $slots[$i][$j] = true;
            }
        }
        $rows[$r][$c] = $cell;
    }
    foreach ($slots as $row) {
        if (\in_array(false, $row, true)) {
            return '';
        }
    }
    $style = \ModularTableBlocks\Styles\block_style($attributes, true);
    $wrapper = $style !== '' ? array('style' => $style) : array();
    $column_mode = column_width_mode($attributes);
    $wrapper['data-mtb-column-width-mode'] = $column_mode;
    $native_styles = \ModularTableBlocks\Styles\native_styles($attributes);
    if (isset($native_styles['typography']['fontWeight'])) {
        // Let headers inherit an explicit parent weight without duplicating its value.
        $wrapper['data-mtb-font-weight'] = 'inherit';
    }
    if (isset($attributes['borderCollapse']) && \in_array($attributes['borderCollapse'], array('collapse', 'separate'), true)) {
        $wrapper['data-mtb-border-collapse'] = $attributes['borderCollapse'];
    }
    // Use WordPress's generated attributes, moving only width/margins to figure.
    $table_tag = new \WP_HTML_Tag_Processor('<table ' . \get_block_wrapper_attributes($wrapper) . '>');
    $table_tag->next_tag();
    $split_styles = \ModularTableBlocks\Styles\table_layout_styles((string) $table_tag->get_attribute('style'));
    if ($split_styles['table'] === '') {
        $table_tag->remove_attribute('style');
    } else {
        $table_tag->set_attribute('style', $split_styles['table']);
    }
    $figure_classes = 'modular-table-blocks-figure';
    $alignment = $attributes['align'] ?? '';
    if (\in_array($alignment, array('wide', 'full'), true)) {
        $figure_classes .= ' align' . $alignment;
        $table_tag->remove_class('align' . $alignment);
    }
    $html = $table_tag->get_updated_html();
    $caption = $attributes['caption'] ?? '';
    $caption = \is_string($caption) ? $caption : '';
    $caption_enabled = \is_bool($attributes['captionEnabled'] ?? null) ? $attributes['captionEnabled'] : $caption !== '';
    $caption = $caption_enabled ? render_inline_content($caption) : '';
    if ($caption !== '') {
        $caption_attributes = '';
        if (($attributes['captionSide'] ?? '') === 'bottom') {
            $caption_attributes .= ' data-mtb-caption-side="bottom"';
        }
        if (\in_array($attributes['captionAlign'] ?? '', array('left', 'center', 'right'), true)) {
            $caption_attributes .= ' style="text-align:' . \esc_attr($attributes['captionAlign']) . '"';
        }
        $html .= '<caption' . $caption_attributes . '>' . $caption . '</caption>';
    }
    $html .= '<colgroup' . ($column_mode === 'equal' ? ' style="--mtb-column-count:' . $width . '"' : '') . '>';
    foreach ($columns as $column) {
        $column_width = \is_array($column) ? ($column['width'] ?? '') : '';
        $html .= '<col' . ($column_mode === 'custom' && \ModularTableBlocks\Styles\valid_token('tableWidth', $column_width) ? ' style="--mtb-column-width:' . \esc_attr($column_width) . '"' : '') . '>';
    }
    $html .= '</colgroup>';
    $section = '';
    foreach ($rows as $index => $cells) {
        $next_section = $index < $headers ? 'thead' : 'tbody';
        if ($section !== $next_section) {
            $html .= ($section !== '' ? '</' . $section . '>' : '') . '<' . $next_section . '>';
            $section = $next_section;
        }
        $html .= '<tr>';
        \ksort($cells);
        foreach ($cells as $cell) {
            $html .= render_cell($cell, ($index < $headers ? $headers : $count) - $index, $attributes);
        }
        $html .= '</tr>';
    }
    $html .= '</' . $section . '></table>';
    if (($attributes['responsiveMode'] ?? '') === 'scroll') {
        // A hidden caption must not leak through the scroll region's label.
        $label = \trim(\html_entity_decode(\wp_strip_all_tags($caption, true), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        $label = $label !== '' ? $label : \__('Scrollable table', 'modular-table-blocks');
        $html = '<div class="modular-table-blocks-scroll" role="region" tabindex="0" aria-label="' . \esc_attr($label) . '">' . $html . '</div>';
    }
    $figure_style = $split_styles['figure'] !== '' ? ' style="' . \esc_attr($split_styles['figure']) . '"' : '';
    return '<figure class="' . \esc_attr($figure_classes) . '"' . $figure_style . '>' . $html . '</figure>';
}
