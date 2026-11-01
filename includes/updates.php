<?php
namespace ModularTableBlocks\Updates;

/** The header is the single source for the update endpoint and installed version. */
function plugin_data(): array {
    static $data;
    if ($data === null) {
        $data = \get_file_data(\dirname(__DIR__) . '/modular-table-blocks.php', array(
            'Name' => 'Plugin Name',
            'Author' => 'Author',
            'Version' => 'Version',
            'Description' => 'Description',
            'UpdateURI' => 'Update URI',
            'RequiresWP' => 'Requires at least',
            'RequiresPHP' => 'Requires PHP',
        ), 'plugin');
    }
    return $data;
}

function plugin_file(): string {
    return \plugin_basename(\dirname(__DIR__) . '/modular-table-blocks.php');
}

function register_hooks(): void {
    $host = \wp_parse_url(plugin_data()['UpdateURI'], PHP_URL_HOST);
    if (!\is_string($host) || $host === '') {
        return;
    }
    \add_filter('update_plugins_' . $host, __NAMESPACE__ . '\\check_update', 10, 4);
    \add_filter('plugins_api', __NAMESPACE__ . '\\plugin_information', 10, 3);
    // WordPress clears this cache for its explicit "Check again" action and after updates.
    \add_action('delete_site_transient_update_plugins', __NAMESPACE__ . '\\clear_cache');
}

function cache_key(): string {
    return 'mtb_update_' . \md5(plugin_data()['UpdateURI']);
}

function clear_cache(): void {
    \delete_site_transient(cache_key());
}

/** Stable numeric release versions, also used for WordPress/PHP requirements. */
function valid_version($value): bool {
    return \is_string($value) && \strlen($value) <= 32
        && \preg_match('/^[0-9]+(?:\.[0-9]+){1,3}$/D', $value) === 1;
}

/** Only the endpoint's HTTPS host may provide plugin details and executable ZIPs. */
function trusted_url($value, string $endpoint): bool {
    if (!\is_string($value) || \filter_var($value, FILTER_VALIDATE_URL) === false) {
        return false;
    }
    $parts = \wp_parse_url($value);
    $host = \wp_parse_url($endpoint, PHP_URL_HOST);
    return \is_array($parts) && \is_string($host)
        && \strtolower($parts['scheme'] ?? '') === 'https'
        && \strtolower($parts['host'] ?? '') === \strtolower($host)
        && !isset($parts['user']) && !isset($parts['pass']) && !isset($parts['fragment'])
        && (!isset($parts['port']) || $parts['port'] === 443);
}

/** Validate the entire manifest before publishing any update information. */
function validate_manifest($data, string $endpoint): ?array {
    if (!\is_array($data) || ($data['slug'] ?? null) !== 'modular-table-blocks') {
        return null;
    }
    foreach (array('version', 'requires', 'requires_php') as $key) {
        if (!valid_version($data[$key] ?? null)) {
            return null;
        }
    }
    foreach (array('url', 'package') as $key) {
        if (!trusted_url($data[$key] ?? null, $endpoint)) {
            return null;
        }
    }
    if (\preg_match('/\.zip$/i', \wp_parse_url($data['package'], PHP_URL_PATH) ?? '') !== 1) {
        return null;
    }
    $manifest = \array_intersect_key($data, \array_flip(array('slug', 'version', 'requires', 'requires_php', 'url', 'package')));
    if (isset($data['author'])) {
        if (!\is_string($data['author'])) {
            return null;
        }
        $author = \sanitize_text_field($data['author']);
        if ($author === '') {
            return null;
        }
        $manifest['author'] = $author;
    }
    if (isset($data['tested'])) {
        if (!valid_version($data['tested'])) {
            return null;
        }
        $manifest['tested'] = $data['tested'];
    }
    $manifest['sections'] = array();
    if (isset($data['sections'])) {
        if (!\is_array($data['sections'])) {
            return null;
        }
        foreach (array('description', 'changelog') as $section) {
            if (isset($data['sections'][$section])) {
                if (!\is_string($data['sections'][$section])) {
                    return null;
                }
                $manifest['sections'][$section] = \wp_kses_post($data['sections'][$section]);
            }
        }
    }
    return $manifest;
}

function get_manifest(): ?array {
    $cached = \get_site_transient(cache_key());
    if (\is_array($cached)) {
        return $cached ?: null;
    }
    $endpoint = plugin_data()['UpdateURI'];
    $manifest = null;
    if (trusted_url($endpoint, $endpoint)) {
        $response = \wp_safe_remote_get($endpoint, array(
            'timeout' => 5,
            'redirection' => 0,
            'limit_response_size' => 65536,
            'headers' => array('Accept' => 'application/json'),
        ));
        if (!\is_wp_error($response) && \wp_remote_retrieve_response_code($response) === 200) {
            $body = \wp_remote_retrieve_body($response);
            if (\strlen($body) <= 65536) {
                $manifest = validate_manifest(\json_decode($body, true, 16), $endpoint);
            }
        }
    }
    // Cache failures briefly; never retain an obsolete download link after a failed check.
    \set_site_transient(cache_key(), $manifest ?? array(), $manifest === null ? 5 * MINUTE_IN_SECONDS : HOUR_IN_SECONDS);
    return $manifest;
}

/** WordPress compares versions and handles installation and the user's auto-update choice. */
function check_update($update, array $installed, string $file, array $locales = array()) {
    if ($file !== plugin_file() || ($installed['UpdateURI'] ?? '') !== plugin_data()['UpdateURI']) {
        return $update;
    }
    $manifest = get_manifest();
    if ($manifest === null) {
        return false;
    }
    unset($manifest['sections'], $manifest['author']);
    return $manifest;
}

/** Supply the standard details modal rather than querying WordPress.org for this slug. */
function plugin_information($result, string $action, $args) {
    if ($result !== false || $action !== 'plugin_information'
        || !\is_object($args) || ($args->slug ?? '') !== 'modular-table-blocks') {
        return $result;
    }
    $manifest = get_manifest();
    if ($manifest === null) {
        return new \WP_Error('mtb_update_unavailable', \__('Update information is currently unavailable.', 'modular-table-blocks'));
    }
    return (object) array(
        'name' => plugin_data()['Name'],
        'author' => \esc_html($manifest['author'] ?? plugin_data()['Author']),
        'slug' => $manifest['slug'],
        'version' => $manifest['version'],
        'requires' => $manifest['requires'],
        'requires_php' => $manifest['requires_php'],
        'tested' => $manifest['tested'] ?? '',
        'homepage' => $manifest['url'],
        'download_link' => $manifest['package'],
        'sections' => $manifest['sections'] + array('description' => \esc_html(plugin_data()['Description'])),
        'external' => true,
    );
}
