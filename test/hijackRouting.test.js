import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHijackSpeaker, resolveUserReference, evaluateScope, shouldProcessHijackMessage, planHijackCapture } from '../lib/hijackRouting.js';

const ROSTER = [
    { entryName: 'Rosa', fullName: 'Rosa Vermillion', hasFullBot: true, hasSubbot: true },
    { entryName: 'Belle', fullName: 'Belle Cadence', hasFullBot: true, hasSubbot: true },
    { entryName: 'Blake', fullName: 'Blake Wolfe', hasFullBot: true, hasSubbot: true },
];

test('resolveHijackSpeaker matches a bare entryName case-insensitively (canonical casing returned)', () => {
    assert.equal(resolveHijackSpeaker('rosa', ROSTER), 'Rosa');
    assert.equal(resolveHijackSpeaker('ROSA', ROSTER), 'Rosa');
    assert.equal(resolveHijackSpeaker('  Belle  ', ROSTER), 'Belle');
});

test('resolveHijackSpeaker matches when the known name is a SUBSTRING of a decorated sender', () => {
    assert.equal(resolveHijackSpeaker('Blake 🐺', ROSTER), 'Blake');
    assert.equal(resolveHijackSpeaker('~Rosa~', ROSTER), 'Rosa');
});

test('resolveHijackSpeaker matches a fullName token (first or last name)', () => {
    assert.equal(resolveHijackSpeaker('Vermillion', ROSTER), 'Rosa'); // Rosa Vermillion
    assert.equal(resolveHijackSpeaker('Cadence', ROSTER), 'Belle');   // Belle Cadence
});

test('resolveHijackSpeaker matches a per-character custom nickname when supplied', () => {
    assert.equal(resolveHijackSpeaker('wolfy', ROSTER, { Blake: 'wolfy' }), 'Blake');
    assert.equal(resolveHijackSpeaker('lil wolfy here', ROSTER, { Blake: 'wolfy' }), 'Blake');
});

test('resolveHijackSpeaker returns null for an unrecognized or empty name', () => {
    assert.equal(resolveHijackSpeaker('Nobody', ROSTER), null);
    assert.equal(resolveHijackSpeaker('', ROSTER), null);
    assert.equal(resolveHijackSpeaker(null, ROSTER), null);
});

test('resolveUserReference matches the user name and any user nickname (substring, case-insensitive)', () => {
    assert.equal(resolveUserReference('Tim', 'Tim', ['juicebox']), true);
    assert.equal(resolveUserReference('hey it is juicebox', 'Tim', ['juicebox']), true);
    assert.equal(resolveUserReference('POOKIE', 'Tim', ['pookie']), true);
    assert.equal(resolveUserReference('Rosa', 'Tim', ['juicebox']), false);
    assert.equal(resolveUserReference('', 'Tim', ['juicebox']), false);
    assert.equal(resolveUserReference('Tim', '', []), false); // no user name, no nicknames
});

test('shouldProcessHijackMessage accepts a normal assistant message', () => {
    assert.equal(shouldProcessHijackMessage({ is_user: false, is_system: false, mes: 'hi' }), true);
});

test('shouldProcessHijackMessage rejects user, system, missing, and no-text messages', () => {
    assert.equal(shouldProcessHijackMessage({ is_user: true, mes: 'hi' }), false);
    assert.equal(shouldProcessHijackMessage({ is_system: true, mes: 'hi' }), false);
    assert.equal(shouldProcessHijackMessage(undefined), false);
    assert.equal(shouldProcessHijackMessage({ mes: 42 }), false);
});

test('planHijackCapture: solo block with an existing thread appends there (no speaker on solo)', () => {
    const settings = { conversations: {
        c1: { id: 'c1', participants: ['Rosa'], messages: [], lastActive: 5 },
    } };
    const block = { lines: [
        { role: 'assistant', speaker: 'Rosa', text: 'hey' },
        { role: 'user', text: 'on my way' },
    ] };
    const plan = planHijackCapture(block, ROSTER, settings);
    assert.equal(plan.captured, true);
    assert.deepEqual(plan.participants, ['Rosa']);
    assert.equal(plan.existingConversationId, 'c1');
    assert.deepEqual(plan.messages, [
        { role: 'assistant', content: 'hey' },
        { role: 'user', content: 'on my way' },
    ]);
    assert.equal(plan.unreadIncrement, 1);
});

test('planHijackCapture: solo block with no existing thread signals new-thread-needed', () => {
    const settings = { conversations: {} };
    const block = { lines: [{ role: 'assistant', speaker: 'Rosa', text: 'hey' }] };
    const plan = planHijackCapture(block, ROSTER, settings);
    assert.equal(plan.captured, true);
    assert.deepEqual(plan.participants, ['Rosa']);
    assert.equal(plan.existingConversationId, null);
    assert.equal(plan.unreadIncrement, 1);
});

test('planHijackCapture: group block stores canonical entryName as each assistant speaker', () => {
    const settings = { conversations: {} };
    const block = { lines: [
        { role: 'assistant', speaker: 'rosa', text: 'hey' },
        { role: 'assistant', speaker: 'BELLE', text: 'hi' },
        { role: 'user', text: 'coming' },
    ] };
    const plan = planHijackCapture(block, ROSTER, settings);
    assert.equal(plan.captured, true);
    assert.deepEqual(plan.participants, ['Rosa', 'Belle']);
    assert.deepEqual(plan.messages, [
        { role: 'assistant', content: 'hey', speaker: 'Rosa' },
        { role: 'assistant', content: 'hi', speaker: 'Belle' },
        { role: 'user', content: 'coming' },
    ]);
    assert.equal(plan.unreadIncrement, 2);
});

test('planHijackCapture: all-or-nothing — any unresolved incoming speaker aborts the whole block', () => {
    const settings = { conversations: {} };
    const block = { lines: [
        { role: 'assistant', speaker: 'Rosa', text: 'hey' },
        { role: 'assistant', speaker: 'Stranger', text: 'who am I' },
    ] };
    assert.deepEqual(planHijackCapture(block, ROSTER, settings), { captured: false });
});

test('planHijackCapture: a block with no incoming (assistant) lines is not captured', () => {
    const settings = { conversations: {} };
    const block = { lines: [{ role: 'user', text: 'anyone there?' }] };
    assert.deepEqual(planHijackCapture(block, ROSTER, settings), { captured: false });
});

test('planHijackCapture: empty-text lines are dropped from the appended messages', () => {
    const settings = { conversations: {} };
    const block = { lines: [
        { role: 'assistant', speaker: 'Rosa', text: 'hey' },
        { role: 'assistant', speaker: 'Rosa', text: '' },
    ] };
    const plan = planHijackCapture(block, ROSTER, settings);
    assert.deepEqual(plan.messages, [{ role: 'assistant', content: 'hey' }]);
    assert.equal(plan.unreadIncrement, 1);
});

const CTX = { userName: 'Tim', userNicknames: ['juicebox'], castRoster: ROSTER, characterNicknames: {} };
const scope = (owner, title, lines) => ({ owner, title, lines, lineIndices: [] });
const inc = (sender, text) => ({ direction: 'Incoming', sender, text });
const out = (sender, text) => ({ direction: 'Outgoing', sender, text });

test('evaluateScope: owner set, matches {{user}} -> PERSPECTIVE USER', () => {
    const s = scope('Tim', null, [inc('Rosa', 'hey'), out('Tim', 'hi')]);
    assert.deepEqual(evaluateScope(s, CTX), { captured: true, perspective: 'USER', ownerEntryName: null });
});

test('evaluateScope: owner set, matches a user NICKNAME -> PERSPECTIVE USER', () => {
    const s = scope('juicebox', null, [inc('Rosa', 'hey')]);
    assert.deepEqual(evaluateScope(s, CTX), { captured: true, perspective: 'USER', ownerEntryName: null });
});

test('evaluateScope: owner set, matches the roster -> PERSPECTIVE CHAR with ownerEntryName', () => {
    // Blake's phone; Tim (user) texts in -> participation TRUE via Incoming sender.
    const s = scope('Blake', null, [inc('Tim', 'you up?'), out('Blake', 'yeah')]);
    assert.deepEqual(evaluateScope(s, CTX), { captured: true, perspective: 'CHAR', ownerEntryName: 'Blake' });
});

test('evaluateScope: owner set, matches neither {{user}} nor roster -> dropped', () => {
    const s = scope('Stranger', null, [inc('Rosa', 'hey')]);
    assert.deepEqual(evaluateScope(s, CTX), { captured: false });
});

test('evaluateScope: owner unset, no Outgoing, {{user}} NOT an Incoming sender -> USER (today default)', () => {
    const s = scope(null, null, [inc('Rosa', 'hey'), inc('Rosa', 'you there?')]);
    assert.deepEqual(evaluateScope(s, CTX), { captured: true, perspective: 'USER', ownerEntryName: null });
});

test('evaluateScope: FLAGGED EDGE — owner unset, no Outgoing, {{user}} IS an Incoming sender -> dropped', () => {
    const s = scope(null, null, [inc('Tim', 'weird self-text')]);
    assert.deepEqual(evaluateScope(s, CTX), { captured: false });
});

test('evaluateScope: owner unset, Outgoing first-sender is {{user}} -> USER', () => {
    const s = scope(null, null, [out('Tim', 'yo'), inc('Rosa', 'hey')]);
    assert.deepEqual(evaluateScope(s, CTX), { captured: true, perspective: 'USER', ownerEntryName: null });
});

test('evaluateScope: owner unset, Outgoing first-sender is a roster char, {{user}} in Incoming -> CHAR', () => {
    const s = scope(null, null, [out('Blake', 'hey'), inc('Tim', 'sup')]);
    assert.deepEqual(evaluateScope(s, CTX), { captured: true, perspective: 'CHAR', ownerEntryName: 'Blake' });
});

test('evaluateScope: owner unset, Outgoing first-sender matches neither -> dropped', () => {
    const s = scope(null, null, [out('Stranger', 'hey')]);
    assert.deepEqual(evaluateScope(s, CTX), { captured: false });
});

test('evaluateScope: CHAR participation via TITLE partial-matching {{user}}', () => {
    // Blake's phone, title names the user; no {{user}} Incoming sender needed.
    const s = scope('Blake', 'Tim', [inc('Rosa', 'group msg'), out('Blake', 'reply')]);
    assert.deepEqual(evaluateScope(s, CTX), { captured: true, perspective: 'CHAR', ownerEntryName: 'Blake' });
});

test('evaluateScope: FLAGGED EDGE — fully-indeterminate CHAR, no title, {{user}} absent -> dropped (participation FALSE)', () => {
    const s = scope(null, null, [out('Blake', 'hey'), inc('Rosa', 'hi')]); // CHAR from Outgoing, no title, no user
    assert.deepEqual(evaluateScope(s, CTX), { captured: false });
});

test('evaluateScope: compatibility aborts the WHOLE scope on one unresolved non-user sender', () => {
    // USER perspective, participation always TRUE, but "Ghost" resolves to no roster entry.
    const s = scope('Tim', null, [inc('Rosa', 'hey'), inc('Ghost', 'boo')]);
    assert.deepEqual(evaluateScope(s, CTX), { captured: false });
});

test('evaluateScope: compatibility tolerates a decorated sender ("Blake 🐺") in a USER scope', () => {
    const s = scope('Tim', null, [inc('Blake 🐺', 'hey')]);
    assert.deepEqual(evaluateScope(s, CTX), { captured: true, perspective: 'USER', ownerEntryName: null });
});
