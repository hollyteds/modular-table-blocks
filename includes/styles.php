<?php
namespace ModularTableBlocks\Styles;

function token_names(): array {
    return array(
        'textColor' => '--mtb-text-color',
        'backgroundColor' => '--mtb-background-color',
        'cellBackgroundColor' => '--mtb-cell-background-color',
        'borderColor' => '--mtb-border-color',
        'borderWidth' => '--mtb-border-width',
        'borderStyle' => '--mtb-border-style',
        'cellPaddingBlock' => '--mtb-cell-padding-block',
        'cellPaddingInline' => '--mtb-cell-padding-inline',
        'fontSize' => '--mtb-font-size',
        'lineHeight' => '--mtb-line-height',
        'tableWidth' => '--mtb-table-width',
    );
}

function valid_token(string $key, $value): bool {
    if (!\is_string($value) || \strlen($value) > 100) {
        return false;
    }
    $color = \substr($key, -5) === 'Color';
    $preset = $color ? 'color' : ($key === 'fontSize' ? 'font-size' : (\strpos($key, 'cellPadding') === 0 ? 'spacing' : ''));
    if ($preset !== '' && \preg_match('/^var\(--wp--preset--' . $preset . '--[a-z0-9]+(?:-[a-z0-9]+)*\)$/D', $value)) {
        return true;
    }
    if ($color) {
        return (bool) \preg_match('/^(?:#[0-9a-f]{3}|#[0-9a-f]{4}|#[0-9a-f]{6}|#[0-9a-f]{8}|transparent|currentColor|inherit)$/iD', $value);
    }
    if ($key === 'borderStyle') {
        return \in_array($value, array('none', 'solid', 'dashed', 'dotted', 'double'), true);
    }
    if ($key === 'lineHeight') {
        return $value === 'normal' || (\preg_match('/^(?:\d+(?:\.\d+)?|\.\d+)$/D', $value) && (float) $value >= 0.5 && (float) $value <= 4);
    }
    if ($value === '0' && $key !== 'fontSize' && $key !== 'tableWidth') {
        return true;
    }
    if (!\preg_match('/^(\d+(?:\.\d+)?|\.\d+)(px|rem|em|%)$/D', $value, $matches)) {
        return false;
    }
    $amount = (float) $matches[1];
    $unit = $matches[2];
    if ($key === 'tableWidth') {
        return $amount > 0 && $amount <= ($unit === '%' ? 100 : ($unit === 'px' ? 4000 : 250));
    }
    if ($key === 'fontSize') {
        return $amount >= ($unit === 'px' ? 8 : ($unit === '%' ? 50 : 0.5)) && $amount <= ($unit === 'px' ? 160 : ($unit === '%' ? 500 : 10));
    }
    return $unit !== '%' && $amount >= 0 && $amount <= ($key === 'borderWidth' ? ($unit === 'px' ? 20 : 1) : ($unit === 'px' ? 200 : 10));
}

function token_style($tokens): string {
    if (!\is_array($tokens)) {
        return '';
    }
    $style = '';
    foreach (token_names() as $key => $property) {
        if (isset($tokens[$key]) && valid_token($key, $tokens[$key])) {
            $style .= $property . ':' . $tokens[$key] . ';';
        }
    }
    return $style;
}

function child_attributes(\WP_Block $block, string $kind): string {
    $classes = 'wp-block-modular-table-blocks-' . $kind;
    if (isset($block->attributes['className']) && \is_string($block->attributes['className'])) {
        $classes .= ' ' . $block->attributes['className'];
    }
    $html = ' class="' . \esc_attr($classes) . '"';
    $style = token_style($block->attributes['styleTokens'] ?? array());
    return $html . ($style !== '' ? ' style="' . \esc_attr($style) . '"' : '');
}
