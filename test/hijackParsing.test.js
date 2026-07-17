import test from 'node:test';
import assert from 'node:assert/strict';
import { locatePhoneScopes, stripPhoneScopes } from '../lib/hijackParsing.js';

test('locatePhoneScopes: one scope with a Phone header, owner parsed from "Weynet - <owner>"', () => {
    const raw = 'Phone¦Weynet - Blake¦82%\nIncoming¦3:47 PM¦Rosa¦hey\nIncoming¦3:48 PM¦Rosa¦you there?';
    const scopes = locatePhoneScopes(raw);
    assert.equal(scopes.length, 1);
    assert.equal(scopes[0].owner, 'Blake');
    assert.equal(scopes[0].title, null);
    assert.deepEqual(scopes[0].lines, [
        { direction: 'Incoming', sender: 'Rosa', text: 'hey' },
        { direction: 'Incoming', sender: 'Rosa', text: 'you there?' },
    ]);
    assert.deepEqual(scopes[0].lineIndices, [0, 1, 2]);
});

test('locatePhoneScopes: carrier-only Phone line ("Weynet", no owner) yields owner:null (spec-gap rule)', () => {
    // The spec's perspective tree keys owner-unset on "no Phone line"; it never addresses a
    // carrier-only Phone line. Existing fixtures use exactly this form and imply USER perspective,
    // so carrier-only MUST resolve to owner:null → the owner-unset/USER-default branch downstream.
    const raw = 'Phone¦Weynet¦82%\nIncoming¦3:47 PM¦Rosa¦hey';
    const scopes = locatePhoneScopes(raw);
    assert.equal(scopes.length, 1);
    assert.equal(scopes[0].owner, null);
});

test('locatePhoneScopes: Texting header captures title, Phone+Texting adjacent form ONE scope', () => {
    const raw = 'Phone¦Weynet - Blake¦82%\nTexting¦Rosa\nOutgoing¦3:46 PM¦Blake¦on my way\nIncoming¦3:47 PM¦Rosa¦ok';
    const scopes = locatePhoneScopes(raw);
    assert.equal(scopes.length, 1);
    assert.equal(scopes[0].owner, 'Blake');
    assert.equal(scopes[0].title, 'Rosa');
    assert.deepEqual(scopes[0].lines, [
        { direction: 'Outgoing', sender: 'Blake', text: 'on my way' },
        { direction: 'Incoming', sender: 'Rosa', text: 'ok' },
    ]);
    assert.deepEqual(scopes[0].lineIndices, [0, 1, 2, 3]);
});

test('locatePhoneScopes: ASCII pipe and box-drawing delimiters both parse', () => {
    assert.deepEqual(locatePhoneScopes('Incoming|3:47 PM|Rosa|hey there')[0].lines,
        [{ direction: 'Incoming', sender: 'Rosa', text: 'hey there' }]);
    assert.deepEqual(locatePhoneScopes('Incoming│3:47 PM│Rosa│hey there')[0].lines,
        [{ direction: 'Incoming', sender: 'Rosa', text: 'hey there' }]);
});

test('locatePhoneScopes: a run before any header is its own headerless scope (owner:null, title:null)', () => {
    const raw = 'She pulls out her phone.\n\nIncoming¦3:47 PM¦Rosa¦hey\nIncoming¦3:48 PM¦Rosa¦come over\n\nShe sets it down.';
    const scopes = locatePhoneScopes(raw);
    assert.equal(scopes.length, 1);
    assert.equal(scopes[0].owner, null);
    assert.equal(scopes[0].title, null);
    assert.deepEqual(scopes[0].lineIndices, [2, 3]);
});

test('locatePhoneScopes: narrative BETWEEN runs stays in the same scope (non-contiguous lineIndices)', () => {
    const raw = 'Incoming¦1¦Rosa¦a\n\nShe frowns and types back.\n\nIncoming¦2¦Rosa¦b\nIncoming¦3¦Rosa¦c';
    const scopes = locatePhoneScopes(raw);
    assert.equal(scopes.length, 1);
    assert.deepEqual(scopes[0].lines.map(l => l.text), ['a', 'b', 'c']);
    // indices 1..3 are narrative/blank — NOT part of the scope.
    assert.deepEqual(scopes[0].lineIndices, [0, 4, 5]);
});

test('locatePhoneScopes: a header that is NOT immediately adjacent still BINDS (inverts old behavior)', () => {
    const raw = 'Phone¦Weynet - Blake¦82%\n\nIncoming¦3:47 PM¦Rosa¦hey';
    const scopes = locatePhoneScopes(raw);
    assert.equal(scopes.length, 1);
    assert.equal(scopes[0].owner, 'Blake'); // header started the scope; blank line is narrative
    assert.deepEqual(scopes[0].lineIndices, [0, 2]);
});

test('locatePhoneScopes: a new header starts a new scope (two independent scopes in one message)', () => {
    const raw = 'Phone¦Weynet - Blake¦82%\nIncoming¦1¦Rosa¦a\nPhone¦Weynet - Ava¦40%\nIncoming¦2¦Kris¦b';
    const scopes = locatePhoneScopes(raw);
    assert.equal(scopes.length, 2);
    assert.equal(scopes[0].owner, 'Blake');
    assert.deepEqual(scopes[0].lines.map(l => l.sender), ['Rosa']);
    assert.equal(scopes[1].owner, 'Ava');
    assert.deepEqual(scopes[1].lines.map(l => l.sender), ['Kris']);
});

test('locatePhoneScopes: an Outgoing sender contradicting the established owner starts a new implicit scope', () => {
    const raw = 'Phone¦Weynet - Blake¦82%\nOutgoing¦1¦Blake¦mine\nOutgoing¦2¦Ava¦not mine';
    const scopes = locatePhoneScopes(raw);
    assert.equal(scopes.length, 2);
    assert.equal(scopes[0].owner, 'Blake');
    assert.deepEqual(scopes[0].lines.map(l => l.text), ['mine']);
    assert.equal(scopes[1].owner, null); // implicit, headerless
    assert.deepEqual(scopes[1].lines.map(l => l.text), ['not mine']);
});

test('locatePhoneScopes: a decorated Outgoing owner ("Blake 🐺") does NOT contradict owner "Blake"', () => {
    const raw = 'Phone¦Weynet - Blake¦82%\nOutgoing¦1¦Blake 🐺¦still me';
    const scopes = locatePhoneScopes(raw);
    assert.equal(scopes.length, 1);
    assert.deepEqual(scopes[0].lines.map(l => l.text), ['still me']);
});

test('locatePhoneScopes: an Outgoing line before any header (owner null) never triggers a scope split', () => {
    const raw = 'Outgoing¦1¦Tim¦hi\nOutgoing¦2¦Ava¦also me?';
    const scopes = locatePhoneScopes(raw);
    assert.equal(scopes.length, 1); // no established owner to contradict
    assert.deepEqual(scopes[0].lines.map(l => l.text), ['hi', 'also me?']);
});

test('locatePhoneScopes: a malformed/partial line is a boundary but leaves both runs as separate lines of one headerless scope', () => {
    // "Incoming¦3:47 PM¦Rosa" has only 2 delimiters (missing final ¦text) -> not a phone line ->
    // narrative. It does NOT start a new scope (only a header or owner-mismatch does).
    const raw = 'Incoming¦3:47 PM¦Rosa¦hey\nIncoming¦3:47 PM¦Rosa\nIncoming¦3:49 PM¦Rosa¦later';
    const scopes = locatePhoneScopes(raw);
    assert.equal(scopes.length, 1);
    assert.deepEqual(scopes[0].lines.map(l => l.text), ['hey', 'later']);
    assert.deepEqual(scopes[0].lineIndices, [0, 2]);
});

test('locatePhoneScopes: returns [] for no phone lines and for null/non-string input', () => {
    assert.deepEqual(locatePhoneScopes('Just ordinary narration.'), []);
    assert.deepEqual(locatePhoneScopes(null), []);
    assert.deepEqual(locatePhoneScopes(undefined), []);
    assert.deepEqual(locatePhoneScopes(42), []);
});

test('stripPhoneScopes: removes exactly one captured scope, collapses blanks, leaves prose intact', () => {
    const raw = 'She pulls out her phone.\n\nIncoming¦3:47 PM¦Rosa¦hey\nIncoming¦3:48 PM¦Rosa¦come over\n\nShe sets it down.';
    const scopes = locatePhoneScopes(raw);
    assert.equal(stripPhoneScopes(raw, scopes), 'She pulls out her phone.\n\nShe sets it down.');
});

test('stripPhoneScopes: removes the header line too, no orphan', () => {
    const raw = 'Before.\nPhone¦Weynet - Blake¦82%\nIncoming¦3:47 PM¦Rosa¦hey\nAfter.';
    const scopes = locatePhoneScopes(raw);
    assert.equal(stripPhoneScopes(raw, scopes), 'Before.\nAfter.');
});

test('stripPhoneScopes: removes ONLY captured scopes, leaving an uncaptured scope untouched', () => {
    const raw = 'Phone¦Weynet - Blake¦82%\nIncoming¦1¦Rosa¦a\nPhone¦Weynet - Ava¦40%\nIncoming¦2¦Kris¦b';
    const scopes = locatePhoneScopes(raw);
    // Pretend only the FIRST scope was captured.
    const result = stripPhoneScopes(raw, [scopes[0]]);
    assert.equal(result, 'Phone¦Weynet - Ava¦40%\nIncoming¦2¦Kris¦b');
});

test('stripPhoneScopes: removes multiple non-contiguous ranges of one scope, keeps interspersed narrative', () => {
    const raw = 'Incoming¦1¦Rosa¦a\n\nShe frowns.\n\nIncoming¦2¦Rosa¦b';
    const scopes = locatePhoneScopes(raw);
    assert.equal(stripPhoneScopes(raw, scopes), 'She frowns.');
});

test('stripPhoneScopes: trims a leading blank when the block was at the very top', () => {
    const raw = 'Incoming¦3:47 PM¦Rosa¦hey\n\nShe smiles.';
    const scopes = locatePhoneScopes(raw);
    assert.equal(stripPhoneScopes(raw, scopes), 'She smiles.');
});

test('stripPhoneScopes: returns empty string when the whole message was captured', () => {
    const raw = 'Incoming¦3:47 PM¦Rosa¦hey\nIncoming¦3:48 PM¦Rosa¦there';
    const scopes = locatePhoneScopes(raw);
    assert.equal(stripPhoneScopes(raw, scopes), '');
});

test('stripPhoneScopes: with an empty captured list returns the input (blank-collapsed) unchanged', () => {
    const raw = 'Nothing to strip here.';
    assert.equal(stripPhoneScopes(raw, []), 'Nothing to strip here.');
});
