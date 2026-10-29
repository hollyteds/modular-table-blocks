<?php
namespace ModularTableBlocks\Tests\Artifacts;

/** Use the same package.json entries as WordPress Scripts, without a second allowlist. */
function package_allows(string $file, array $entries): bool {
    if ($file === '' || $file[0] === '/' || \preg_match('~(?:^|/)\.{1,2}(?:/|$)~', $file)) {
        return false;
    }
    if ($file === 'package.json') {
        return true;
    }
    foreach ($entries as $entry) {
        if (\substr($entry, -1) === '/' ? \strpos($file, $entry) === 0 : $file === $entry) {
            return true;
        }
    }
    return false;
}

function check_build(string $root): void {
    $manifest = \json_decode(\file_get_contents($root . '/build/manifest.json'), true);
    if (empty($manifest['files']) || !\is_array($manifest['files'])) {
        throw new \RuntimeException('Missing build manifest');
    }
    foreach ($manifest['files'] as $file => $hash) {
        if ($file === '' || $file[0] === '/' || \preg_match('~(?:^|/)\.{1,2}(?:/|$)~', $file)) {
            throw new \RuntimeException('Unsafe build asset path: ' . $file);
        }
        $asset = $root . '/build/' . $file;
        if (!\is_file($asset) || \hash_file('sha256', $asset) !== $hash) {
            throw new \RuntimeException('Build asset missing or modified: ' . $file);
        }
    }
}
