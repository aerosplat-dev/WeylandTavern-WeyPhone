// test/promptResolution.real.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveMasterPrompt, resolvePostHistoryInstructions, resolvePersonalityText } from '../lib/promptResolution.js';

/**
 * Locates the real SillyTavern checkout's public/scripts/extensions/quick-reply-ext/ directory by
 * walking upward from this test file's own location, rather than assuming a fixed number of parent
 * directories. The number of directory levels between this extension and the SillyTavern root
 * varies by install location: a per-user data/<username>/extensions/<folder>/ install and a bundled
 * public/scripts/extensions/<folder>/ install happen to land at the same depth, but the global
 * public/scripts/extensions/third-party/<folder>/ fallback is one level deeper — a fixed "go up N
 * directories" (the previous version of this test hardcoded 5) only matches whichever install
 * location it happened to be written against. Walking up and checking for the real anchor directory
 * at each level works regardless of how deep this extension is actually nested.
 * @param {string} startDir
 * @returns {string | null}
 */
function findQuickReplyExtDir(startDir) {
    let dir = startDir;
    for (let i = 0; i < 12; i++) {
        const candidate = path.join(dir, 'public', 'scripts', 'extensions', 'quick-reply-ext');
        if (fs.existsSync(candidate)) return candidate;
        const parent = path.dirname(dir);
        if (parent === dir) break; // reached the filesystem root without finding it
        dir = parent;
    }
    return null;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const quickReplyExtDir = findQuickReplyExtDir(here);

// Dynamic import (not a static `import` specifier) because the path is only known at runtime —
// static specifiers can't be computed. Only attempted when the directory was actually found, so a
// checkout that doesn't have it nearby (e.g. this extension copied out standalone for a quick test)
// skips gracefully instead of throwing an unhandled module-resolution error.
const ravs = quickReplyExtDir
    ? (await import(pathToFileURL(path.join(quickReplyExtDir, 'src', 'rav.js')).href)).ravs
    : null;
const charPer = quickReplyExtDir
    ? (await import(pathToFileURL(path.join(quickReplyExtDir, 'src', 'charper.js')).href)).charPer
    : null;

const skip = quickReplyExtDir
    ? false
    : 'public/scripts/extensions/quick-reply-ext was not found in any ancestor directory of this test file — this integration test validates against real platform content and only runs from within an actual SillyTavern checkout.';

test('ravs has a "Current Prompt" entry with non-empty decoded content', { skip }, () => {
    const entry = resolveMasterPrompt(ravs, 'Current Prompt');
    assert.equal(typeof entry.teg, 'string');
    assert.ok(entry.teg.length > 100, 'teg should be a substantial decoded prompt, not empty/short');
    assert.equal(typeof entry.post, 'string');
    assert.ok(entry.post.length > 10, 'post should be non-trivial decoded content');
});

test('resolvePostHistoryInstructions works against the real Current Prompt entry', { skip }, () => {
    const entry = resolveMasterPrompt(ravs, 'Current Prompt');
    const result = resolvePostHistoryInstructions(entry, { htmlEnabled: false, rpFocus: 'test-focus' });
    assert.equal(typeof result, 'string');
    assert.ok(result.includes('test-focus'), 'rpFocus should appear in the resolved text');
    assert.ok(!result.includes('{{pipe}}'), 'the {{pipe}} placeholder should be fully substituted');
});

test('charPer has a Rosa entry with non-empty decoded personality text', { skip }, () => {
    const config = charPer.get('Rosa');
    assert.ok(config, 'charPer should have a Rosa entry');
    const text = resolvePersonalityText(config);
    assert.equal(typeof text, 'string');
    assert.ok(text.length > 50, 'Rosa personality text should be substantial, not empty/short');
});

test('charPer has an Ava entry with non-empty decoded personality text', { skip }, () => {
    const config = charPer.get('Ava');
    assert.ok(config, 'charPer should have an Ava entry');
    const text = resolvePersonalityText(config);
    assert.equal(typeof text, 'string');
    assert.ok(text.length > 50, 'Ava personality text should be substantial, not empty/short');
});
