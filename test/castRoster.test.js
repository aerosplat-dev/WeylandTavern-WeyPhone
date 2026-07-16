import test from 'node:test';
import assert from 'node:assert/strict';
import { splitFullName, extractMacroKey, findEntryTitleMatch } from '../lib/castRoster.js';

test('splitFullName splits on spaces and drops a leading title token', () => {
    assert.deepEqual(splitFullName('Sayori Akiyama'), ['Sayori', 'Akiyama']);
    assert.deepEqual(splitFullName('Mr. Wolfy'), ['Wolfy']);
    assert.deepEqual(splitFullName('Dr Loren Montenegro'), ['Loren', 'Montenegro']);
});

test('splitFullName handles a single-word name with no last name', () => {
    assert.deepEqual(splitFullName('Kressa'), ['Kressa']);
    assert.deepEqual(splitFullName('Kyana'), ['Kyana']);
});

test('extractMacroKey returns the key only when content is PURELY a {{getvar::X}} macro', () => {
    assert.equal(extractMacroKey('{{getvar::BL}}'), 'BL');
    assert.equal(extractMacroKey('  {{getvar::EAd}}  '), 'EAd');
    assert.equal(extractMacroKey('some text {{getvar::BL}}'), null);
    assert.equal(extractMacroKey('{{getvar::BL}} some text'), null);
    assert.equal(extractMacroKey('plain description text'), null);
    assert.equal(extractMacroKey(''), null);
    assert.equal(extractMacroKey(undefined), null);
});

test('findEntryTitleMatch matches on the first name token via case-insensitive substring against entry titles only', () => {
    const entries = [
        { comment: 'Belle', content: '{{getvar::BE}}' },
        { comment: 'Red Lantern Ramen', content: '[RED LANTERN RAMEN]\nMr. Wolfy runs this place.' },
    ];
    assert.deepEqual(findEntryTitleMatch(['Belle'], entries), { entryName: 'Belle', macroKey: 'BE' });
});

test('findEntryTitleMatch never matches against entry CONTENT, only entry titles (Mr. Wolfy regression)', () => {
    const entries = [
        { comment: 'Red Lantern Ramen', content: '[RED LANTERN RAMEN]\nMr. Wolfy runs this place.' },
    ];
    assert.equal(findEntryTitleMatch(['Wolfy'], entries), null);
});

test('findEntryTitleMatch falls back to the second token (last name) when the first token matches no title', () => {
    const entries = [
        { comment: 'Professor Akiyama', content: '{{getvar::AK}}' },
    ];
    assert.deepEqual(findEntryTitleMatch(['Sayori', 'Akiyama'], entries), { entryName: 'Professor Akiyama', macroKey: 'AK' });
});

test('findEntryTitleMatch returns null when a token matches more than one entry title (ambiguous)', () => {
    const entries = [
        { comment: 'Adrian Sullivan', content: '{{getvar::AN}}' },
        { comment: 'Mason Sullivan', content: '{{getvar::MS}}' },
    ];
    assert.equal(findEntryTitleMatch(['Sullivan'], entries), null);
});

test('findEntryTitleMatch returns null when a title-matched entry\'s content is not a pure getvar macro', () => {
    const entries = [
        { comment: 'Belle', content: 'Belle is a real description, not a macro.' },
    ];
    assert.equal(findEntryTitleMatch(['Belle'], entries), null);
});

test('findEntryTitleMatch returns null when neither token matches anything', () => {
    const entries = [{ comment: 'Belle', content: '{{getvar::BE}}' }];
    assert.equal(findEntryTitleMatch(['Nobody', 'Special'], entries), null);
});

test('findEntryTitleMatch only tries the first two tokens, ignoring anything past a middle name', () => {
    const entries = [{ comment: 'Loren', content: '{{getvar::LN}}' }];
    // 'Loren Montenegro' -> tokens ['Loren', 'Montenegro'] after title-strip; only these two are tried.
    assert.deepEqual(findEntryTitleMatch(['Loren', 'Montenegro'], entries), { entryName: 'Loren', macroKey: 'LN' });
});
