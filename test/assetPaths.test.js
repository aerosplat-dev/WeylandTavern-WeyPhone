// test/assetPaths.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import { EXTENSION_BASE_URL, ASSET_BASE_URL, MAPS_BASE_URL } from '../lib/assetPaths.js';

// Derives the expected extension root the same way lib/assetPaths.js derives it from its own
// import.meta.url ("one directory up from wherever this script itself resolves") — computed
// independently from THIS test file's own location, not a hardcoded literal. Proves
// EXTENSION_BASE_URL tracks the extension's real on-disk folder AND its real served URL prefix,
// on whatever machine/install layout runs this suite, rather than assuming a fixed folder name
// (e.g. "Weyland-WeyPhone") or a fixed mount prefix (e.g. "/scripts/extensions/third-party/") —
// both vary depending on whether this extension is installed under a per-user
// data/<username>/extensions/ folder, the global public/scripts/extensions/third-party/ fallback,
// or a plain public/scripts/extensions/<folder>/ bundled-style install (see lib/assetPaths.js's own
// comment for how those three cases differ).
function expectedExtensionBaseUrl() {
    return new URL('..', import.meta.url).pathname.replace(/\/$/, '');
}

test('EXTENSION_BASE_URL reflects wherever this extension is actually installed, not a hardcoded literal', () => {
    assert.equal(EXTENSION_BASE_URL, expectedExtensionBaseUrl());
});

test('ASSET_BASE_URL and MAPS_BASE_URL are built directly on top of EXTENSION_BASE_URL', () => {
    assert.equal(ASSET_BASE_URL, `${EXTENSION_BASE_URL}/assets`);
    assert.equal(MAPS_BASE_URL, `${EXTENSION_BASE_URL}/maps`);
});

test('none of the exported base URLs have a trailing slash', () => {
    assert.equal(EXTENSION_BASE_URL.endsWith('/'), false);
    assert.equal(ASSET_BASE_URL.endsWith('/'), false);
    assert.equal(MAPS_BASE_URL.endsWith('/'), false);
});
