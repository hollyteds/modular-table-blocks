<?php
/** Test-only locale override, mounted as an MU plugin only by wp-env. */
namespace ModularTableBlocks\Tests;

\add_filter('determine_locale', function ($locale) {
    $requested = $_GET['mtb_test_locale'] ?? '';
    return \in_array($requested, array('ja', 'en_US'), true) ? $requested : $locale;
});
