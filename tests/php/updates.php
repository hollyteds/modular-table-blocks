<?php
namespace ModularTableBlocks\Tests\Updates;

use function ModularTableBlocks\Tests\check;
use function ModularTableBlocks\Updates\cache_key;
use function ModularTableBlocks\Updates\check_update;
use function ModularTableBlocks\Updates\clear_cache;
use function ModularTableBlocks\Updates\get_manifest;
use function ModularTableBlocks\Updates\plugin_data;
use function ModularTableBlocks\Updates\plugin_file;
use function ModularTableBlocks\Updates\plugin_information;
use function ModularTableBlocks\Updates\validate_manifest;

require_once ABSPATH . 'wp-admin/includes/plugin.php';
require_once ABSPATH . 'wp-admin/includes/plugin-install.php';

$endpoint = plugin_data()['UpdateURI'];
$host = \wp_parse_url($endpoint, PHP_URL_HOST);
$valid = array(
    'slug' => 'modular-table-blocks',
    'version' => '99.0.0',
    'author' => '<b>ht-CODE & contributors</b>',
    'requires' => '6.6',
    'requires_php' => '7.4',
    'tested' => '6.6',
    'url' => 'https://' . $host . '/',
    'package' => 'https://' . $host . '/updates/modular-table-blocks-99.0.0.zip',
    'sections' => array('changelog' => '<p>Release<script>alert(1)</script><a href="javascript:alert(1)">link</a></p>'),
    'autoupdate' => true,
    'unexpected' => 'ignore',
);
$normalized = validate_manifest($valid, $endpoint);
check($normalized !== null && !isset($normalized['unexpected']) && !isset($normalized['autoupdate']), 'Remote metadata must not override auto-update preferences');
check($normalized['author'] === 'ht-CODE & contributors', 'Author must be plain text');
check(\strpos($normalized['sections']['changelog'], '<script') === false && \strpos($normalized['sections']['changelog'], 'javascript:') === false, 'Unsafe release notes must be sanitized');
foreach (array(
    array('slug' => 'other-plugin'),
    array('version' => 99),
    array('version' => "99.0\n"),
    array('version' => '99.0-beta'),
    array('requires' => 'anything'),
    array('requires_php' => array('7.4')),
    array('tested' => false),
    array('author' => array('ht-CODE')),
    array('author' => ''),
    array('author' => '  '),
    array('package' => 'http://' . $host . '/release.zip'),
    array('package' => 'https://other.example/release.zip'),
    array('package' => 'https://' . $host . '.other.example/release.zip'),
    array('package' => 'https://user:pass@' . $host . '/release.zip'),
    array('package' => 'https://' . $host . ':444/release.zip'),
    array('package' => 'https://' . $host . '/release.zip#fragment'),
    array('package' => 'https://' . $host . '/release.php'),
    array('url' => 'javascript:alert(1)'),
    array('sections' => false),
    array('sections' => array('description' => array('wrong type'))),
) as $invalid) {
    check(validate_manifest(\array_replace($valid, $invalid), $endpoint) === null, 'Invalid manifest accepted: ' . \wp_json_encode($invalid));
}
foreach (array(null, false, 'text', array()) as $invalid) {
    check(validate_manifest($invalid, $endpoint) === null, 'Invalid manifest root accepted');
}
foreach (array('slug', 'version', 'requires', 'requires_php', 'url', 'package') as $required) {
    $incomplete = $valid;
    unset($incomplete[$required]);
    check(validate_manifest($incomplete, $endpoint) === null, 'Missing required manifest field accepted');
}
$template = \json_decode(\file_get_contents(__DIR__ . '/../../docs/update-manifest.example.json'), true);
check(validate_manifest($template, $endpoint) !== null, 'Documented manifest does not match the updater');

$previous_updates = \get_site_transient('update_plugins');
$previous_cache = \get_site_transient(cache_key());
$previous_cache_timeout = \get_site_option('_site_transient_timeout_' . cache_key());
$requests = 0;
$response = array('response' => array('code' => 200), 'body' => \wp_json_encode($valid), 'headers' => array());
$http = function ($preempt, $args, $url) use ($endpoint, &$requests, &$response) {
    if ($url === $endpoint) {
        $requests++;
        check($args['reject_unsafe_urls'] === true && $args['redirection'] === 0 && $args['sslverify'] === true, 'Unsafe update HTTP options');
        check($args['timeout'] === 5 && $args['limit_response_size'] === 65536, 'Unbounded update request');
        return $response;
    }
    if (\wp_parse_url($url, PHP_URL_HOST) === 'api.wordpress.org') {
        return array('response' => array('code' => 200), 'body' => '{"plugins":{},"translations":[],"no_update":{}}', 'headers' => array());
    }
    // This suite must never make a real external request.
    return new \WP_Error('mtb_test_network', 'Unexpected test network request');
};
\add_filter('pre_http_request', $http, 10, 3);
try {
    clear_cache();
    $installed = array('UpdateURI' => $endpoint, 'Version' => plugin_data()['Version']);
    check(check_update('existing', $installed, 'other/other.php') === 'existing', 'Updater interfered with another plugin on the same host');
    check(check_update('existing', array('UpdateURI' => 'https://other.example/'), plugin_file()) === 'existing', 'Updater interfered with another endpoint');
    check($requests === 0, 'Unrelated plugins caused an update request');
    $update = \apply_filters('update_plugins_' . $host, false, $installed, plugin_file(), array('ja'));
    check($update['version'] === '99.0.0' && $update['package'] === $valid['package'] && !isset($update['sections']), 'Registered update hook lost metadata');
    check(get_manifest() !== null && $requests === 1, 'Successful manifest was not cached');
    $info = \plugins_api('plugin_information', (object) array('slug' => 'modular-table-blocks'));
    check($info->version === '99.0.0' && $info->download_link === $valid['package'] && $info->external, 'Standard plugin information API failed');
    check($info->author === 'ht-CODE &amp; contributors', 'Details author must be escaped');
    check(!isset($update['author']), 'Details-only author leaked into the update response');
    $without_author = $normalized;
    unset($without_author['author']);
    \set_site_transient(cache_key(), $without_author, HOUR_IN_SECONDS);
    check(plugin_information(false, 'plugin_information', (object) array('slug' => 'modular-table-blocks'))->author === \esc_html(plugin_data()['Author']), 'Missing remote author must fall back to the plugin header');
    \set_site_transient(cache_key(), $normalized, HOUR_IN_SECONDS);
    check(isset($info->sections['description']) && \strpos($info->sections['changelog'], '<script') === false, 'Details modal lost sanitized sections');
    $args = (object) array('slug' => 'modular-table-blocks');
    $existing = (object) array('preserve' => true);
    check(plugin_information($existing, 'plugin_information', $args) === $existing, 'Existing API result overwritten');
    check(plugin_information(false, 'query_plugins', $args) === false && plugin_information(false, 'plugin_information', (object) array('slug' => 'other')) === false, 'Unrelated plugin API request intercepted');

    // Exercise core's version comparison and response/no_update storage, without network access.
    \wp_clean_plugins_cache(true);
    check(\get_site_transient(cache_key()) === false, 'WordPress explicit refresh did not clear manifest cache');
    \wp_update_plugins();
    $core_updates = \get_site_transient('update_plugins');
    check(isset($core_updates->response[plugin_file()]), 'Core did not advertise a newer release');
    check($core_updates->response[plugin_file()]->new_version === '99.0.0', 'Core failed to normalize new_version');
    check($core_updates->response[plugin_file()]->requires === '6.6' && $core_updates->response[plugin_file()]->requires_php === '7.4', 'Compatibility requirements were lost');
    foreach (array(plugin_data()['Version'], '0.0.1') as $version) {
        $release = $valid;
        $release['version'] = $version;
        $response['body'] = \wp_json_encode($release);
        \wp_clean_plugins_cache(true);
        \wp_update_plugins();
        $core_updates = \get_site_transient('update_plugins');
        check(!isset($core_updates->response[plugin_file()]) && isset($core_updates->no_update[plugin_file()]), 'Core advertised an equal or older release');
    }
    foreach (array(
        new \WP_Error('http_request_failed', 'Connection failed'),
        array('response' => array('code' => 404), 'body' => '{}'),
        array('response' => array('code' => 302), 'body' => '{}'),
        array('response' => array('code' => 200), 'body' => '{broken'),
        array('response' => array('code' => 200), 'body' => \str_repeat(' ', 65537)),
        array('response' => array('code' => 200), 'body' => '{"slug":"wrong"}'),
    ) as $failure) {
        clear_cache();
        $response = $failure;
        $before = $requests;
        check(check_update(false, $installed, plugin_file()) === false, 'Failed request advertised an update');
        check(get_manifest() === null && $requests === $before + 1, 'Failed request was not cached');
        check(\is_wp_error(plugin_information(false, 'plugin_information', $args)), 'Unavailable details must return an error');
    }
    // A failed refresh must also remove an earlier core update offer.
    \set_site_transient('update_plugins', (object) array('last_checked' => 0, 'response' => array(plugin_file() => (object) $valid)));
    \wp_clean_plugins_cache(true);
    \wp_update_plugins();
    check(!isset(\get_site_transient('update_plugins')->response[plugin_file()]), 'Failed refresh retained a stale update');
} finally {
    \remove_filter('pre_http_request', $http, 10);
    \delete_site_transient('update_plugins');
    if ($previous_updates !== false) {
        \set_site_transient('update_plugins', $previous_updates);
    }
    if ($previous_cache !== false) {
        $remaining = $previous_cache_timeout ? \max(1, $previous_cache_timeout - \time()) : 0;
        \set_site_transient(cache_key(), $previous_cache, $remaining);
    }
}
echo "Self-hosted updates: validation, HTTPS, cache/refresh, core version comparison, details and failure handling passed.\n";
