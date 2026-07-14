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

test('scanEntries does not match a non-constant entry whose key is undefined (guarded by `entry.key ?? []`)', () => {
    const entries = [{ content: 'No key at all', disable: false, constant: false }];
    const history = [{ role: 'user', content: 'some text mentioning anything' }];
    assert.equal(scanEntries(entries, history), '');
});

test('scanEntries skips non-string key elements without throwing (guarded by `typeof key === "string"`)', () => {
    const entries = [{ key: [123, null, undefined, { nested: true }], content: 'Should not match', disable: false, constant: false }];
    const history = [{ role: 'user', content: 'text containing 123 and other things' }];
    // No throw, and none of the non-string keys spuriously match.
    assert.equal(scanEntries(entries, history), '');
});

test('scanEntries treats an empty-string key as a non-match, not a match-everything (guarded by `key.length > 0`)', () => {
    // text.includes('') is always true; the length guard is exactly what prevents an empty key
    // from matching every possible history.
    const entries = [{ key: [''], content: 'Should not match on empty key', disable: false, constant: false }];
    const history = [{ role: 'user', content: 'any non-empty history text' }];
    assert.equal(scanEntries(entries, history), '');
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

// Regression test for the real, live-verified bug: getWorldInfoPrompt is called with isDryRun
// hardcoded to false (deliberately, so the tethered view doesn't miss already-active sticky/
// cooldown entries — see the comment on resolveWorldInfoTethered). SillyTavern's real engine
// writes sticky/cooldown bookkeeping directly onto the shared chatMetadata.timedWorldInfo object
// as a side effect of that non-dry-run scan, regardless of what synthetic history was scanned.
// Simulates that real side effect via a fake getWorldInfoPrompt that mutates chatMetadata, and
// asserts resolveWorldInfoTethered restores it afterward so a phone-app tethered scan never
// leaves a trace on the real main chat's WI timed-effect state.
test('resolveWorldInfoTethered restores chatMetadata.timedWorldInfo after a scan that mutates it', async () => {
    const chatMetadata = { timedWorldInfo: { cooldown: { someKey: 5 }, sticky: {} } };
    const fakeGetWorldInfoPrompt = async (chat, maxContext, isDryRun) => {
        assert.equal(isDryRun, false);
        // Simulate the real engine's checkTimedEffects/setTimedEffectOfType side effect: it
        // mutates the live chatMetadata.timedWorldInfo object in place.
        chatMetadata.timedWorldInfo.cooldown.someKey = 0;
        chatMetadata.timedWorldInfo.cooldown.newlyActivatedKey = 3;
        return { worldInfoBefore: 'BEFORE', worldInfoAfter: 'AFTER' };
    };

    await resolveWorldInfoTethered({
        getWorldInfoPrompt: fakeGetWorldInfoPrompt,
        history: [{ role: 'user', content: 'hello' }],
        maxContext: 4096,
        chatMetadata,
    });

    assert.deepEqual(chatMetadata.timedWorldInfo, { cooldown: { someKey: 5 }, sticky: {} });
});

test('resolveWorldInfoTethered restores chatMetadata.timedWorldInfo even if getWorldInfoPrompt throws', async () => {
    const chatMetadata = { timedWorldInfo: { cooldown: { someKey: 5 } } };
    const fakeGetWorldInfoPrompt = async () => {
        chatMetadata.timedWorldInfo.cooldown.someKey = 0;
        throw new Error('scan failed');
    };

    await assert.rejects(() => resolveWorldInfoTethered({
        getWorldInfoPrompt: fakeGetWorldInfoPrompt,
        history: [],
        maxContext: 4096,
        chatMetadata,
    }));

    assert.deepEqual(chatMetadata.timedWorldInfo, { cooldown: { someKey: 5 } });
});

test('resolveWorldInfoTethered deletes chatMetadata.timedWorldInfo if a scan creates it where none existed before', async () => {
    const chatMetadata = {};
    const fakeGetWorldInfoPrompt = async () => {
        chatMetadata.timedWorldInfo = { cooldown: { freshlyCreated: 1 } };
        return { worldInfoBefore: '', worldInfoAfter: '' };
    };

    await resolveWorldInfoTethered({
        getWorldInfoPrompt: fakeGetWorldInfoPrompt,
        history: [],
        maxContext: 4096,
        chatMetadata,
    });

    assert.equal(Object.prototype.hasOwnProperty.call(chatMetadata, 'timedWorldInfo'), false);
});

test('resolveWorldInfoTethered works unchanged when no chatMetadata is supplied', async () => {
    const fakeGetWorldInfoPrompt = async () => ({ worldInfoBefore: 'BEFORE', worldInfoAfter: 'AFTER' });
    const result = await resolveWorldInfoTethered({
        getWorldInfoPrompt: fakeGetWorldInfoPrompt,
        history: [],
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

// Documents CURRENT behavior (not an endorsement of it — see report). resolveWorldInfoUntethered
// has no try/catch around loadWorldInfo, so a throw propagates to the caller and aborts the reply.
// This is asymmetric with resolveMainActiveLtmEntries (tetheredContext.js), which catches and
// degrades to []. Flagged for a human decision; behavior deliberately left unchanged here.
test('resolveWorldInfoUntethered propagates the error when loadWorldInfo throws (currently unguarded)', async () => {
    const fakeLoadWorldInfo = async () => { throw new Error('book load failed'); };
    await assert.rejects(
        () => resolveWorldInfoUntethered({ loadWorldInfo: fakeLoadWorldInfo, history: [], personaLorebookName: '' }),
        /book load failed/,
    );
});

test('resolveWorldInfoUntethered treats a null book as empty (skips it, yielding no WI text)', async () => {
    const fakeLoadWorldInfo = async () => null;
    const result = await resolveWorldInfoUntethered({ loadWorldInfo: fakeLoadWorldInfo, history: [], personaLorebookName: '' });
    assert.deepEqual(result, { worldInfoBefore: '', worldInfoAfter: '' });
});

test('resolveWorldInfoUntethered skips a null persona book but still returns the Weyland scan', async () => {
    const books = {
        Weyland: { entries: { 0: { key: ['always'], content: 'Weyland lore', disable: false, constant: true } } },
    };
    const fakeLoadWorldInfo = async (name) => books[name] ?? null;
    const result = await resolveWorldInfoUntethered({
        loadWorldInfo: fakeLoadWorldInfo,
        history: [],
        personaLorebookName: 'Missing Persona Book',
    });
    assert.equal(result.worldInfoBefore, 'Weyland lore');
});
