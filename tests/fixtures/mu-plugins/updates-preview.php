<?php
/** Request-scoped update preview; mounted only in wp-env, never in the distribution. */
namespace ModularTableBlocks\Tests\UpdatesPreview;

\add_action('admin_init', function () {
    if (($_GET['mtb_test_update_preview'] ?? '') !== '1' || !\current_user_can('update_plugins')) {
        return;
    }
    $endpoint = \ModularTableBlocks\Updates\plugin_data()['UpdateURI'];
    $host = \wp_parse_url($endpoint, PHP_URL_HOST);
    $cache_key = \ModularTableBlocks\Updates\cache_key();
    $previous_updates = \get_site_transient('update_plugins');
    $previous_manifest = \get_site_transient($cache_key);
    $previous_timeout = \get_site_option('_site_transient_timeout_' . $cache_key);
    \add_filter('pre_http_request', function ($preempt, $args, $url) use ($endpoint, $host) {
        if ($url === $endpoint) {
            return array('response' => array('code' => 200), 'headers' => array(), 'body' => \wp_json_encode(array(
                'slug' => 'modular-table-blocks',
                'version' => '99.0.0',
                'author' => 'ht-CODE',
                'requires' => '6.6',
                'requires_php' => '7.4',
                'url' => 'https://' . $host . '/',
                'package' => 'https://' . $host . '/updates/test-preview.zip',
                'sections' => array('description' => '<p>Update preview description.</p>', 'changelog' => '<p>Preview release notes.</p>'),
            )));
        }
        if (\wp_parse_url($url, PHP_URL_HOST) === 'api.wordpress.org') {
            return array('response' => array('code' => 200), 'headers' => array(), 'body' => '{"plugins":{},"translations":[],"no_update":{}}');
        }
        return new \WP_Error('mtb_test_network', 'External requests blocked in update preview');
    }, 10, 3);
    \add_action('shutdown', function () use ($previous_updates, $previous_manifest, $previous_timeout, $cache_key) {
        \delete_site_transient('update_plugins');
        if ($previous_updates !== false) {
            \set_site_transient('update_plugins', $previous_updates);
        }
        if ($previous_manifest !== false) {
            \set_site_transient($cache_key, $previous_manifest, $previous_timeout ? \max(1, $previous_timeout - \time()) : 0);
        }
    });
    \wp_clean_plugins_cache(true);
    \wp_update_plugins();
});
