<?php
namespace ModularTableBlocks\Styles;

function token_names(): array {
    $names = array(
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
    foreach (array('Top', 'Right', 'Bottom', 'Left') as $side) {
        foreach (array('Color', 'Width', 'Style') as $property) {
            $names['border' . $side . $property] = '--mtb-border-' . \strtolower($side) . '-' . \strtolower($property);
        }
        $names['cellPadding' . $side] = '--mtb-cell-padding-' . \strtolower($side);
    }
    return $names;
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
    if (\preg_match('/^border.*Style$/D', $key)) {
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
    return $unit !== '%' && $amount >= 0 && $amount <= (\preg_match('/^border.*Width$/D', $key) ? ($unit === 'px' ? 20 : 1) : ($unit === 'px' ? 200 : 10));
}

function token_style($tokens): string {
    if (!\is_array($tokens)) {
        return '';
    }
    $style = '';
    $names = token_names();
    foreach ($names as $key => $property) {
        if (isset($tokens[$key]) && valid_token($key, $tokens[$key])) {
            $style .= $property . ':' . $tokens[$key] . ';';
            foreach (array('Top', 'Right', 'Bottom', 'Left') as $side) {
                $side_key = '';
                if (\in_array($key, array('borderColor', 'borderWidth', 'borderStyle'), true)) {
                    $side_key = 'border' . $side . \substr($key, 6);
                } elseif (($key === 'cellPaddingBlock' && \in_array($side, array('Top', 'Bottom'), true)) || ($key === 'cellPaddingInline' && \in_array($side, array('Left', 'Right'), true))) {
                    $side_key = 'cellPadding' . $side;
                }
                if ($side_key !== '') {
                    $style .= $names[$side_key] . ':' . $tokens[$key] . ';';
                }
            }
        }
    }
    return $style;
}

function native_styles(array $attributes): array {
    $styles = array();
    $tokens = isset($attributes['styleTokens']) && \is_array($attributes['styleTokens']) ? $attributes['styleTokens'] : array();
    foreach (array('fontSize', 'lineHeight', 'textColor') as $key) {
        $group = $key === 'textColor' ? 'color' : 'typography';
        $property = $key === 'textColor' ? 'text' : $key;
        $value = $attributes['style'][$group][$property] ?? null;
        $preset = $key !== 'lineHeight' ? ($attributes[$key] ?? null) : null;
        if (\is_string($preset) && \preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $preset)) {
            $value = 'var:preset|' . ($key === 'fontSize' ? 'font-size' : 'color') . '|' . $preset;
        } elseif ($value === null && isset($tokens[$key]) && valid_token($key, $tokens[$key])) {
            $value = $tokens[$key];
        }
        // Native custom font sizes may exceed the old token slider bounds.
        if ($key === 'lineHeight' && \is_numeric($value)) {
            $value = (string) $value;
        }
        if ($key === 'fontSize' && (\is_int($value) || \is_float($value)) && \is_finite((float) $value) && $value >= 0) {
            $value = (string) $value . 'px';
        }
        $valid = valid_token($key, $value);
        if ($key === 'lineHeight' && \is_string($value) && \preg_match('/^(?:\d+(?:\.\d+)?|\.\d+)$/D', $value)) {
            $valid = \is_finite((float) $value);
        }
        if ($key === 'fontSize' && \is_string($value) && \preg_match('/^(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%|vw|vh)$/D', $value)) {
            $valid = (float) $value > 0;
        }
        if (\is_string($value) && \preg_match('/^var:preset\|(?:font-size|color)\|[a-z0-9]+(?:-[a-z0-9]+)*$/D', $value)) {
            $valid = true;
        }
        if ($valid) {
            if ($key === 'fontSize') {
                $value = \wp_get_typography_font_size_value(array('size' => $value));
            }
            $styles[$group][$property] = $value;
        }
    }
    $align = $attributes['style']['typography']['textAlign'] ?? ($attributes['horizontalAlign'] ?? '');
    if (\in_array($align, array('left', 'center', 'right'), true)) {
        $styles['typography']['textAlign'] = $align;
    }
    return $styles;
}

function block_style(array $attributes): string {
    $tokens = isset($attributes['styleTokens']) && \is_array($attributes['styleTokens']) ? $attributes['styleTokens'] : array();
    unset($tokens['fontSize'], $tokens['lineHeight'], $tokens['textColor']);
    $styles = native_styles($attributes);
    $native = \wp_style_engine_get_styles($styles);
    $align = isset($styles['typography']['textAlign']) ? 'text-align:' . $styles['typography']['textAlign'] . ';' : '';
    $reset = '';
    foreach (array('color' => array('text' => '--mtb-text-color'), 'typography' => array('fontSize' => '--mtb-font-size', 'lineHeight' => '--mtb-line-height')) as $group => $properties) {
        foreach ($properties as $key => $variable) {
            if (isset($styles[$group][$key])) {
                $reset .= $variable . ':initial;';
            }
        }
    }
    return token_style($tokens) . $reset . ($native['css'] ?? '') . (!empty($native['css']) ? ';' : '') . $align;
}

function child_attributes(\WP_Block $block, string $kind): string {
    $classes = 'wp-block-modular-table-blocks-' . $kind;
    if (isset($block->attributes['className']) && \is_string($block->attributes['className'])) {
        $classes .= ' ' . $block->attributes['className'];
    }
    $native = native_styles($block->attributes);
    $native_attributes = \wp_style_engine_get_styles($native, array('convert_vars_to_classnames' => true));
    if (!empty($native_attributes['classnames'])) {
        $classes .= ' ' . $native_attributes['classnames'];
    }
    if (isset($native['color']['text'])) {
        $classes .= ' has-text-color';
    }
    if (isset($native['typography']['textAlign'])) {
        $classes .= ' has-text-align-' . $native['typography']['textAlign'];
    }
    $html = ' class="' . \esc_attr($classes) . '"';
    $style = block_style($block->attributes);
    if ($kind === 'cell') {
        $vertical = $block->attributes['verticalAlign'] ?? 'top';
        if (\in_array($vertical, array('middle', 'bottom'), true)) {
            $style .= 'vertical-align:' . $vertical . ';';
        }
    }
    return $html . ($style !== '' ? ' style="' . \esc_attr($style) . '"' : '');
}
