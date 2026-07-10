import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorldInfoTethered, resolveWorldInfoUntethered, scanEntries } from '../lib/worldInfo.js';

test('scanEntries matches an entry whose key appears in the history text', () => {
    const entries = [
        { key: ['dormitory'], content: 'Dormitory lore', disable: false, constant: false },
        { key: ['unrelated-keyword'], content: 'Should not match', disable: false, constant: false },
    ];
    const history = [{ role: 'user', content: 'Meet me at the dormitory tonight' }];
    assert.equal(scanEntries(entries, history), 'Dormitory lore');
});

test('scanEntries includes constant entries regardless of keyword match', () => {
    const entries = [{ key: ['nomatch'], content: 'Always included', disable: false, constant: true }];
    const history = [{ role: 'user', content: 'irrelevant text' }];
    assert.equal(scanEntries(entries, history), 'Always included');
});

test('scanEntries skips disabled entries even if their key matches', () => {
    const entries = [{ key: ['dormitory'], content: 'Should be skipped', disable: true, constant: false }];
    const history = [{ role: 'user', content: 'the dormitory' }];
    assert.equal(scanEntries(entries, history), '');
});

test('scanEntries is case-insensitive', () => {
    const entries = [{ key: ['Dormitory'], content: 'Matched', disable: false, constant: false }];
    const history = [{ role: 'user', content: 'the DORMITORY is here' }];
    assert.equal(scanEntries(entries, history), 'Matched');
});

test('resolveWorldInfoTethered converts history into a newest-first plain string[] before calling getWorldInfoPrompt', async () => {
    const fakeGetWorldInfoPrompt = async (chat, maxContext, isDryRun, globalScanData) => {
        assert.deepEqual(chat, ['third', 'second', 'first']);
        assert.equal(maxContext, 4096);
        return { worldInfoBefore: 'BEFORE', worldInfoAfter: 'AFTER' };
    };
    const result = await resolveWorldInfoTethered({
        getWorldInfoPrompt: fakeGetWorldInfoPrompt,
        history: [
            { role: 'user', content: 'first' },
            { role: 'assistant', content: 'second' },
            { role: 'user', content: 'third' },
        ],
        maxContext: 4096,
    });
    assert.deepEqual(result, { worldInfoBefore: 'BEFORE', worldInfoAfter: 'AFTER' });
});

test('resolveWorldInfoUntethered scans the Weyland book and merges a persona book if provided', async () => {
    const books = {
        Weyland: { entries: { 0: { key: ['always'], content: 'Weyland lore', disable: false, constant: true } } },
        'Persona Book': { entries: { 0: { key: ['always'], content: 'Persona lore', disable: false, constant: true } } },
    };
    const fakeLoadWorldInfo = async (name) => books[name] ?? null;
    const result = await resolveWorldInfoUntethered({
        loadWorldInfo: fakeLoadWorldInfo,
        history: [],
        personaLorebookName: 'Persona Book',
    });
    assert.equal(result.worldInfoBefore, 'Weyland lore\nPersona lore');
    assert.equal(result.worldInfoAfter, '');
});

test('resolveWorldInfoUntethered works with no persona lorebook set', async () => {
    const books = {
        Weyland: { entries: { 0: { key: ['always'], content: 'Weyland lore', disable: false, constant: true } } },
    };
    const fakeLoadWorldInfo = async (name) => books[name] ?? null;
    const result = await resolveWorldInfoUntethered({
        loadWorldInfo: fakeLoadWorldInfo,
        history: [],
        personaLorebookName: '',
    });
    assert.equal(result.worldInfoBefore, 'Weyland lore');
});
