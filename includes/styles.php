<?php
namespace ModularTableBlocks\Styles;

/** The same names and expansion rules are bundled into the TypeScript renderer. */
function token_definitions(): array {
    static $definitions = null;
    if ($definitions === null) {
        $definitions = \json_decode(\file_get_contents(__DIR__ . '/style-tokens.json'), true);
    }
    return $definitions;
}

function token_names(): array {
    return token_definitions()['names'];
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
    $definitions = token_definitions();
    $names = $definitions['names'];
    $properties = array();
    foreach ($definitions['shorthands'] as $key => $targets) {
        if (isset($tokens[$key]) && valid_token($key, $tokens[$key])) {
            foreach ($targets as $target) {
                $properties[$names[$target]] = $tokens[$key];
            }
        }
    }
    foreach ($names as $key => $property) {
        if (isset($tokens[$key]) && valid_token($key, $tokens[$key])) {
            $properties[$property] = $tokens[$key];
        }
    }
    $style = '';
    foreach ($properties as $property => $value) {
        $style .= $property . ':' . $value . ';';
    }
    return $style;
}

/** Validate the additional native typography values before using the Style Engine. */
function valid_typography_value(string $key, $value): bool {
    if (!\is_string($value) || $value === '' || \strlen($value) > 1000) {
        return false;
    }
    if ($key === 'fontFamily') {
        return (bool) \preg_match('/^(?:var:preset\|font-family\|[a-z0-9]+(?:-[a-z0-9]+)*|var\(--wp--preset--font-family--[a-z0-9]+(?:-[a-z0-9]+)*\)|[\p{L}\p{N}\s,\'"_ -]+)$/uD', $value);
    }
    if ($key === 'fontWeight') {
        return \in_array($value, array('normal', 'bold', 'bolder', 'lighter'), true) || (\preg_match('/^\d+(?:\.\d+)?$/D', $value) && (float) $value >= 1 && (float) $value <= 1000);
    }
    if ($key === 'letterSpacing') {
        return $value === 'normal' || $value === '0' || (bool) \preg_match('/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|em|rem|%|vw|vh)$/D', $value);
    }
    $allowed = array(
        'fontStyle' => array('normal', 'italic', 'oblique'),
        'textDecoration' => array('none', 'underline', 'line-through', 'overline'),
        'textTransform' => array('none', 'capitalize', 'uppercase', 'lowercase', 'full-width', 'full-size-kana'),
        'writingMode' => array('horizontal-tb', 'vertical-rl', 'vertical-lr'),
    );
    return isset($allowed[$key]) && \in_array($value, $allowed[$key], true);
}

function native_styles(array $attributes): array {
    $styles = array();
    $tokens = isset($attributes['styleTokens']) && \is_array($attributes['styleTokens']) ? $attributes['styleTokens'] : array();
    foreach (array('fontSize', 'lineHeight', 'textColor', 'backgroundColor') as $key) {
        $group = \substr($key, -5) === 'Color' ? 'color' : 'typography';
        $property = $key === 'textColor' ? 'text' : ($key === 'backgroundColor' ? 'background' : $key);
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
    foreach (array('fontFamily', 'fontStyle', 'fontWeight', 'letterSpacing', 'textDecoration', 'textTransform', 'writingMode') as $key) {
        $value = $attributes['style']['typography'][$key] ?? null;
        if ($key === 'fontFamily' && isset($attributes['fontFamily']) && \is_string($attributes['fontFamily']) && \preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $attributes['fontFamily'])) {
            $value = 'var:preset|font-family|' . $attributes['fontFamily'];
        }
        if ((\is_int($value) || \is_float($value)) && \is_finite((float) $value)) {
            $value = (string) $value;
        }
        if (valid_typography_value($key, $value)) {
            $styles['typography'][$key] = $value;
        }
    }
    $align = $attributes['style']['typography']['textAlign'] ?? ($attributes['horizontalAlign'] ?? '');
    if (\in_array($align, array('left', 'center', 'right'), true)) {
        $styles['typography']['textAlign'] = $align;
    }
    return $styles;
}

/** Native root styles are already emitted by get_block_wrapper_attributes(). */
function block_style(array $attributes, bool $native_wrapper = false): string {
    $tokens = isset($attributes['styleTokens']) && \is_array($attributes['styleTokens']) ? $attributes['styleTokens'] : array();
    unset($tokens['fontSize'], $tokens['lineHeight'], $tokens['textColor'], $tokens['backgroundColor']);
    $styles = native_styles($attributes);
    $native = \wp_style_engine_get_styles($styles);
    $declarations = $native['declarations'] ?? array();
    $extra = '';
    // Supply only properties the installed Style Engine cannot serialize.
    foreach (array('textAlign' => 'text-align', 'writingMode' => 'writing-mode') as $key => $property) {
        if (isset($styles['typography'][$key]) && !isset($declarations[$property])) {
            $extra .= $property . ':' . $styles['typography'][$key] . ';';
        }
    }
    if ($native_wrapper) {
        // Keep legacy token fallbacks; delegate explicit native attributes to WP.
        // textAlign is excluded because its toolbar/support is intentionally off.
        $supported = array(
            'color' => array('text' => array('color', 'textColor'), 'background' => array('background-color', 'backgroundColor')),
            'typography' => array(
                'fontSize' => array('font-size', 'fontSize'), 'lineHeight' => array('line-height', ''),
                'fontFamily' => array('font-family', 'fontFamily'), 'fontStyle' => array('font-style', ''),
                'fontWeight' => array('font-weight', ''), 'letterSpacing' => array('letter-spacing', ''),
                'textDecoration' => array('text-decoration', ''), 'textTransform' => array('text-transform', ''),
                'writingMode' => array('writing-mode', ''),
            ),
        );
        foreach ($supported as $group => $properties) {
            foreach ($properties as $key => $definition) {
                list($property, $preset_key) = $definition;
                $preset = $preset_key !== '' ? ($attributes[$preset_key] ?? null) : null;
                $has_preset = \is_string($preset) && \preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $preset);
                if (isset($attributes['style'][$group][$key]) || $has_preset) {
                    unset($declarations[$property]);
                }
            }
        }
    }
    $reset = '';
    foreach (array('color' => array('text' => '--mtb-text-color', 'background' => '--mtb-background-color'), 'typography' => array('fontSize' => '--mtb-font-size', 'lineHeight' => '--mtb-line-height')) as $group => $properties) {
        foreach ($properties as $key => $variable) {
            if (isset($styles[$group][$key])) {
                $reset .= $variable . ':initial;';
            }
        }
    }
    $vertical = $attributes['verticalAlign'] ?? null;
    if (\in_array($vertical, array('top', 'middle', 'bottom'), true)) {
        $extra .= '--mtb-cell-vertical-align:' . $vertical . ';';
    }
    $css = '';
    foreach ($declarations as $property => $value) {
        $css .= $property . ':' . $value . ';';
    }
    return token_style($tokens) . $reset . $css . $extra;
}

/** Split generated layout declarations without splitting quoted strings or CSS functions. */
function table_layout_styles(string $style): array {
    $result = array('figure' => '', 'table' => '');
    $declaration = '';
    $quote = '';
    $escaped = false;
    $depth = 0;
    $length = \strlen($style);
    for ($index = 0; $index <= $length; $index++) {
        $character = $index < $length ? $style[$index] : ';';
        if ($character === ';' && $quote === '' && $depth === 0 && !$escaped) {
            $declaration = \trim($declaration);
            $property = \trim(\explode(':', $declaration, 2)[0]);
            if ($declaration !== '') {
                $target = \in_array($property, array('--mtb-w', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left'), true) ? 'figure' : 'table';
                $result[$target] .= $declaration . ';';
            }
            $declaration = '';
            continue;
        }
        $declaration .= $character;
        if ($escaped) {
            $escaped = false;
        } elseif ($character === '\\') {
            $escaped = true;
        } elseif ($quote !== '') {
            if ($character === $quote) {
                $quote = '';
            }
        } elseif ($character === '"' || $character === "'") {
            $quote = $character;
        } elseif ($character === '(') {
            $depth++;
        } elseif ($character === ')') {
            $depth = \max(0, $depth - 1);
        }
    }
    return $result;
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
    return $html . ($style !== '' ? ' style="' . \esc_attr($style) . '"' : '');
}
