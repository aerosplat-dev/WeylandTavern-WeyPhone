import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMasterPrompt, resolvePostHistoryInstructions } from '../lib/promptResolution.js';

function fakeRavs() {
    const ravs = new Map();
    ravs.set('Current Prompt', { teg: 'SYSTEM TEXT', post: 'POST {{pipe}} END', whtml: 'HTML BLOCK' });
    ravs.set('Beta Prompt', { teg: 'BETA SYSTEM TEXT', post: 'BETA POST {{pipe}} END', whtml: 'BETA HTML' });
    return ravs;
}

test('resolveMasterPrompt returns the entry for a known prompt choice', () => {
    const entry = resolveMasterPrompt(fakeRavs(), 'Beta Prompt');
    assert.equal(entry.teg, 'BETA SYSTEM TEXT');
});

test('resolveMasterPrompt falls back to Current Prompt for an unknown choice', () => {
    const entry = resolveMasterPrompt(fakeRavs(), 'Nonexistent Prompt');
    assert.equal(entry.teg, 'SYSTEM TEXT');
});

test('resolveMasterPrompt throws if even Current Prompt is missing', () => {
    assert.throws(() => resolveMasterPrompt(new Map(), 'Nonexistent Prompt'), /No rav.js entry found/);
});

test('resolvePostHistoryInstructions substitutes rpFocus and the HTML default when htmlEnabled is false', () => {
    const entry = fakeRavs().get('Current Prompt');
    const result = resolvePostHistoryInstructions(entry, { htmlEnabled: false, rpFocus: 'FOCUS TEXT' });
    assert.equal(result, 'POST FOCUS TEXT\n===== END');
});

test('resolvePostHistoryInstructions uses rav.whtml when htmlEnabled is true', () => {
    const entry = fakeRavs().get('Current Prompt');
    const result = resolvePostHistoryInstructions(entry, { htmlEnabled: true, rpFocus: 'FOCUS TEXT' });
    assert.equal(result, 'POST FOCUS TEXT\nHTML BLOCK END');
});

test('resolvePostHistoryInstructions treats a missing rpFocus as an empty string', () => {
    const entry = fakeRavs().get('Current Prompt');
    const result = resolvePostHistoryInstructions(entry, { htmlEnabled: false, rpFocus: undefined });
    assert.equal(result, 'POST \n===== END');
});
