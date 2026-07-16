// test/assetPaths.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import { EXTENSION_BASE_URL, ASSET_BASE_URL, MAPS_BASE_URL } from '../lib/assetPaths.js';

// Derives the expected folder name the same way lib/assetPaths.js derives it from its own
// import.meta.url — but computed independently from THIS test file's own location instead of a
// hardcoded literal. Proves EXTENSION_BASE_URL tracks whatever the extension's real on-disk folder
// is actually named, on whatever machine runs this suite, rather than assuming a fixed name like
// "Weyland-WeyPhone" (which broke on installs using the repo's current/differently-named clone).
function expectedFolderName() {
    const segments = new URL(import.meta.url).pathname.split('/').filter(Boolean);
    return segments[segments.length - 3]; // .../<folder>/test/assetPaths.test.js
}

test('EXTENSION_BASE_URL reflects the extension\'s real on-disk folder name, not a hardcoded literal', () => {
    assert.equal(EXTENSION_BASE_URL, `/scripts/extensions/third-party/${expectedFolderName()}`);
});

test('EXTENSION_BASE_URL always starts with the fixed SillyTavern third-party mount prefix', () => {
    assert.match(EXTENSION_BASE_URL, /^\/scripts\/extensions\/third-party\//);
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
