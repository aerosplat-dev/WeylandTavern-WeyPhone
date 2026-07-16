import test from 'node:test';
import assert from 'node:assert/strict';
import { splitFullName, extractMacroKey, findEntryTitleMatch, buildCastRoster } from '../lib/castRoster.js';

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

const WEYLAND_ENTRIES_FIXTURE = [
    { comment: 'Belle', content: '{{getvar::BE}}' },
    { comment: 'Professor Akiyama', content: '{{getvar::AK}}' },
    { comment: 'Nathan', content: '{{getvar::NA}}' },
    { comment: 'Red Lantern Ramen', content: '[RED LANTERN RAMEN]\nMr. Wolfy runs this place.' },
    { comment: 'Loona', content: '{{getvar::VORTEX}}' }, // real entry, but no real content behind it (see Task 5 note)
];

test('buildCastRoster skips any character whose bot field contains "No Subbot"', () => {
    const roster = buildCastRoster({
        weybooruCharacters: {
            'Loona': { bot: 'Loona, No Subbot' },
            'Belle Calloway': { bot: 'Belle' },
        },
        weylandEntries: WEYLAND_ENTRIES_FIXTURE,
        charPerKeys: ['Belle'],
    });
    assert.equal(roster.some(c => c.entryName === 'Loona'), false);
    assert.equal(roster.length, 1);
    assert.equal(roster[0].entryName, 'Belle');
});

test('buildCastRoster does NOT skip a "Coming Soon" (without "No Subbot") character', () => {
    const roster = buildCastRoster({
        weybooruCharacters: { 'Nathan Ashford': { bot: 'Coming Soon' } },
        weylandEntries: WEYLAND_ENTRIES_FIXTURE,
        charPerKeys: [],
    });
    assert.equal(roster.length, 1);
    assert.equal(roster[0].entryName, 'Nathan');
    assert.equal(roster[0].macroKey, 'NA');
});

test('buildCastRoster marks hasFullBot true only when the matched entryName is a charPer key', () => {
    const roster = buildCastRoster({
        weybooruCharacters: {
            'Belle Calloway': { bot: 'Belle' },
            'Nathan Ashford': { bot: 'Side Character' },
        },
        weylandEntries: WEYLAND_ENTRIES_FIXTURE,
        charPerKeys: ['Belle'],
    });
    const belle = roster.find(c => c.entryName === 'Belle');
    const nathan = roster.find(c => c.entryName === 'Nathan');
    assert.equal(belle.hasFullBot, true);
    assert.equal(nathan.hasFullBot, false);
});

test('buildCastRoster records fullName (for matching) separately from entryName (for display/resolution)', () => {
    const roster = buildCastRoster({
        weybooruCharacters: { 'Sayori Akiyama': { bot: 'Side Character' } },
        weylandEntries: WEYLAND_ENTRIES_FIXTURE,
        charPerKeys: ['Professor Akiyama'],
    });
    assert.deepEqual(roster[0], {
        fullName: 'Sayori Akiyama',
        entryName: 'Professor Akiyama',
        macroKey: 'AK',
        hasFullBot: true,
        hasSubbot: true,
        portraitFirstName: 'sayori',
    });
});

test('buildCastRoster marks every normally-discovered entry hasSubbot: true', () => {
    const roster = buildCastRoster({
        weybooruCharacters: { 'Belle Calloway': { bot: 'Belle' } },
        weylandEntries: WEYLAND_ENTRIES_FIXTURE,
        charPerKeys: ['Belle'],
    });
    assert.equal(roster[0].hasSubbot, true);
});

test('buildCastRoster appends manualFullBotOnlyNames as hasSubbot: false, macroKey: null entries', () => {
    const roster = buildCastRoster({
        weybooruCharacters: {},
        weylandEntries: WEYLAND_ENTRIES_FIXTURE,
        charPerKeys: ['Loona'],
        manualFullBotOnlyNames: ['Loona', 'Kressa'],
    });
    const loona = roster.find(c => c.entryName === 'Loona');
    const kressa = roster.find(c => c.entryName === 'Kressa');
    assert.deepEqual(loona, {
        fullName: 'Loona',
        entryName: 'Loona',
        macroKey: null,
        hasFullBot: true,
        hasSubbot: false,
        portraitFirstName: 'loona',
    });
    assert.equal(kressa.hasFullBot, false);
    assert.equal(kressa.hasSubbot, false);
});

test('buildCastRoster excludes a manualFullBotOnlyNames entry that is also explicitly excluded', () => {
    const roster = buildCastRoster({
        weybooruCharacters: {},
        weylandEntries: WEYLAND_ENTRIES_FIXTURE,
        charPerKeys: [],
        manualFullBotOnlyNames: ['Loona'],
        excludedEntryNames: ['Loona'],
    });
    assert.equal(roster.length, 0);
});

test('buildCastRoster excludes an explicitly-named entry regardless of everything else (Muse case)', () => {
    const roster = buildCastRoster({
        weybooruCharacters: { 'Muse': { bot: 'Muse' } },
        weylandEntries: [{ comment: 'Muse', content: '{{getvar::MU}}' }],
        charPerKeys: ['Muse'],
        excludedEntryNames: ['Muse'],
    });
    assert.equal(roster.length, 0);
});

test('buildCastRoster omits a character with no lorebook title match at all (Mr. Wolfy regression)', () => {
    const roster = buildCastRoster({
        weybooruCharacters: { 'Mr. Wolfy': { bot: 'Side Character' } },
        weylandEntries: WEYLAND_ENTRIES_FIXTURE,
        charPerKeys: [],
    });
    assert.equal(roster.length, 0);
});

test('buildCastRoster returns an empty array for an empty weybooru character set', () => {
    assert.deepEqual(buildCastRoster({ weybooruCharacters: {}, weylandEntries: WEYLAND_ENTRIES_FIXTURE, charPerKeys: [] }), []);
});

test('findEntryTitleMatch prefers an exact title match over an ambiguous substring match (real Belle/"Belle & Dash Room" case)', () => {
    const entries = [
        { comment: 'Belle', content: '{{getvar::BE}}' },
        { comment: 'Belle & Dash Room', content: '[BELLE & DASH ROOM]\nSome room description text, not a getvar macro.' },
    ];
    assert.deepEqual(findEntryTitleMatch(['Belle', 'Calloway'], entries), { entryName: 'Belle', macroKey: 'BE' });
});

test('findEntryTitleMatch still treats genuinely ambiguous matches (no exact match among them) as ambiguous', () => {
    const entries = [
        { comment: 'Adrian Sullivan', content: '{{getvar::AN}}' },
        { comment: 'Mason Sullivan', content: '{{getvar::MS}}' },
    ];
    // Neither entry is titled exactly "Sullivan" -- this must remain unresolved, same as before the fix.
    assert.equal(findEntryTitleMatch(['Sullivan'], entries), null);
});

test('findEntryTitleMatch handles multiple real-world companion entries (4-way ambiguity, Ava case)', () => {
    const entries = [
        { comment: 'Ava', content: '{{getvar::AV}}' },
        { comment: 'Ava Room', content: 'Some room text, not a macro.' },
        { comment: 'Kemetic Caravan', content: 'Unrelated caravan text mentioning ava in passing.' },
        { comment: 'Caravan Roster', content: 'Also unrelated.' },
    ];
    assert.deepEqual(findEntryTitleMatch(['Ava'], entries), { entryName: 'Ava', macroKey: 'AV' });
});
