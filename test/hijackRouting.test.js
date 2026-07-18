import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHijackSpeaker, resolveUserReference, evaluateScope, dedupeRecap, planScopeCapture, shouldProcessHijackMessage } from '../lib/hijackRouting.js';

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

const CTX = { userName: 'Tim', userNicknames: ['juicebox'], castRoster: ROSTER, characterNicknames: {}, roleplayChatId: 'chat-1' };
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

// Decisions produced by evaluateScope, hand-built here so planScopeCapture is tested in isolation.
const USER = { captured: true, perspective: 'USER', ownerEntryName: null };
const CHAR = owner => ({ captured: true, perspective: 'CHAR', ownerEntryName: owner });

test('dedupeRecap: drops a matching prefix that overlaps the stored tail', () => {
    const stored = [{ role: 'assistant', content: 'a' }, { role: 'user', content: 'b' }];
    const incoming = [{ role: 'user', content: 'b' }, { role: 'assistant', content: 'c' }];
    assert.deepEqual(dedupeRecap(incoming, stored), [{ role: 'assistant', content: 'c' }]);
});

test('dedupeRecap: full overlap leaves nothing', () => {
    const stored = [{ role: 'assistant', content: 'a' }, { role: 'user', content: 'b' }];
    const incoming = [{ role: 'assistant', content: 'a' }, { role: 'user', content: 'b' }];
    assert.deepEqual(dedupeRecap(incoming, stored), []);
});

test('dedupeRecap: no overlap keeps everything', () => {
    const stored = [{ role: 'assistant', content: 'a' }];
    const incoming = [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'y' }];
    assert.deepEqual(dedupeRecap(incoming, stored), incoming);
});

test('dedupeRecap: matches only a PREFIX (a later coincidental match is not dropped)', () => {
    const stored = [{ role: 'user', content: 'b' }];
    const incoming = [{ role: 'assistant', content: 'a' }, { role: 'user', content: 'b' }];
    assert.deepEqual(dedupeRecap(incoming, stored), incoming); // 'a' first breaks the prefix
});

test('planScopeCapture: USER solo scope, existing thread appends there, no speaker', () => {
    const settings = { conversations: { c1: { id: 'c1', participants: ['Rosa'], messages: [], lastActive: 5, tethered: true, roleplayChatId: 'chat-1' } } };
    const s = scope('Tim', null, [inc('Rosa', 'hey'), out('Tim', 'on my way')]);
    const plan = planScopeCapture(s, USER, CTX, settings);
    assert.equal(plan.captured, true);
    assert.deepEqual(plan.participants, ['Rosa']);
    assert.equal(plan.existingConversationId, 'c1');
    assert.deepEqual(plan.messages, [
        { role: 'assistant', content: 'hey' },
        { role: 'user', content: 'on my way' },
    ]);
    assert.equal(plan.unreadIncrement, 1);
});

test('planScopeCapture: USER solo scope, no existing thread signals new-thread-needed', () => {
    const settings = { conversations: {} };
    const s = scope(null, null, [inc('Rosa', 'hey')]);
    const plan = planScopeCapture(s, USER, CTX, settings);
    assert.equal(plan.captured, true);
    assert.deepEqual(plan.participants, ['Rosa']);
    assert.equal(plan.existingConversationId, null);
    assert.equal(plan.unreadIncrement, 1);
});

test('planScopeCapture: USER group scope stores canonical entryName as each assistant speaker', () => {
    const settings = { conversations: {} };
    const s = scope('Tim', null, [inc('rosa', 'hey'), inc('BELLE', 'hi'), out('Tim', 'coming')]);
    const plan = planScopeCapture(s, USER, CTX, settings);
    assert.deepEqual(plan.participants, ['Rosa', 'Belle']);
    assert.deepEqual(plan.messages, [
        { role: 'assistant', content: 'hey', speaker: 'Rosa' },
        { role: 'assistant', content: 'hi', speaker: 'Belle' },
        { role: 'user', content: 'coming' },
    ]);
    assert.equal(plan.unreadIncrement, 2);
});

test('planScopeCapture: CHAR solo scope TRANSPOSES — Outgoing->assistant(owner), Incoming(user)->user', () => {
    const settings = { conversations: {} };
    // Blake's phone: Tim texts in (Incoming), Blake replies (Outgoing).
    const s = scope('Blake', null, [inc('Tim', 'you up?'), out('Blake', 'yeah')]);
    const plan = planScopeCapture(s, CHAR('Blake'), CTX, settings);
    assert.deepEqual(plan.participants, ['Blake']);
    assert.deepEqual(plan.messages, [
        { role: 'user', content: 'you up?' },
        { role: 'assistant', content: 'yeah' }, // solo -> no speaker
    ]);
    assert.equal(plan.unreadIncrement, 1);
});

test('planScopeCapture: CHAR group scope folds a non-user Incoming sender in as an assistant speaker', () => {
    const settings = { conversations: {} };
    // Blake's phone: Rosa (another char) texts in, Tim (user) texts in, Blake replies.
    const s = scope('Blake', null, [inc('Rosa', 'party?'), inc('Tim', 'in'), out('Blake', 'yeah come')]);
    const plan = planScopeCapture(s, CHAR('Blake'), CTX, settings);
    assert.deepEqual(plan.participants, ['Rosa', 'Blake']);
    assert.deepEqual(plan.messages, [
        { role: 'assistant', content: 'party?', speaker: 'Rosa' }, // non-user incoming -> assistant
        { role: 'user', content: 'in' },                          // user incoming -> user
        { role: 'assistant', content: 'yeah come', speaker: 'Blake' },
    ]);
    assert.equal(plan.unreadIncrement, 2);
});

test('planScopeCapture: recap-dedup drops the overlapping prefix before appending', () => {
    const settings = { conversations: { c1: {
        id: 'c1', participants: ['Rosa'], lastActive: 5, tethered: true, roleplayChatId: 'chat-1',
        messages: [{ role: 'assistant', content: 'hey' }, { role: 'user', content: 'hi Rosa' }],
    } } };
    // Reconstructed messages: Outgoing 'hi Rosa' -> user 'hi Rosa' (matches the stored tail's last
    // user message by role+content and dedupes away); Incoming 'you free?' -> assistant (survives).
    const s = scope('Tim', null, [out('Tim', 'hi Rosa'), inc('Rosa', 'you free?')]);
    const plan = planScopeCapture(s, USER, CTX, settings);
    assert.deepEqual(plan.messages, [{ role: 'assistant', content: 'you free?' }]);
    assert.equal(plan.existingConversationId, 'c1');
    assert.equal(plan.unreadIncrement, 1);
});

test('planScopeCapture: a scope that dedupes to nothing is NOT captured', () => {
    const settings = { conversations: { c1: {
        id: 'c1', participants: ['Rosa'], lastActive: 5, tethered: true, roleplayChatId: 'chat-1',
        messages: [{ role: 'assistant', content: 'hey' }],
    } } };
    const s = scope('Tim', null, [inc('Rosa', 'hey')]); // reconstructs to [assistant 'hey'] == stored tail
    assert.deepEqual(planScopeCapture(s, USER, CTX, settings), { captured: false });
});

test('planScopeCapture: empty-text lines are dropped from the messages', () => {
    const settings = { conversations: {} };
    const s = scope('Tim', null, [inc('Rosa', 'hey'), inc('Rosa', '   ')]);
    const plan = planScopeCapture(s, USER, CTX, settings);
    assert.deepEqual(plan.messages, [{ role: 'assistant', content: 'hey' }]);
    assert.equal(plan.unreadIncrement, 1);
});

test('planScopeCapture routes into an existing thread ONLY when it is tethered to this roleplayChatId', () => {
    const settings = { conversations: {} };
    // A tethered Blake thread scoped to chat-1 with prior messages.
    const tethered = { id: 'c-teth', participants: ['Blake'], messages: [{ role: 'assistant', content: 'earlier' }], lastActive: 10, tethered: true, roleplayChatId: 'chat-1' };
    settings.conversations['c-teth'] = tethered;
    const scope1 = { owner: 'Tim', title: null, lines: [{ direction: 'Incoming', sender: 'Blake', text: 'new msg' }], lineIndices: [] };
    const decision = { captured: true, perspective: 'USER', ownerEntryName: null };
    const ctx = { userName: 'Tim', userNicknames: [], castRoster: [{ entryName: 'Blake', fullName: 'Blake Wolfe' }], characterNicknames: {}, roleplayChatId: 'chat-1' };
    const plan = planScopeCapture(scope1, decision, ctx, settings);
    assert.equal(plan.captured, true);
    assert.equal(plan.existingConversationId, 'c-teth');
});

test('planScopeCapture does NOT route into an untethered same-participants thread (creates fresh)', () => {
    const settings = { conversations: {} };
    settings.conversations['c-unteth'] = { id: 'c-unteth', participants: ['Blake'], messages: [{ role: 'assistant', content: 'earlier' }], lastActive: 10, tethered: false, roleplayChatId: null };
    const scope1 = { owner: 'Tim', title: null, lines: [{ direction: 'Incoming', sender: 'Blake', text: 'new msg' }], lineIndices: [] };
    const decision = { captured: true, perspective: 'USER', ownerEntryName: null };
    const ctx = { userName: 'Tim', userNicknames: [], castRoster: [{ entryName: 'Blake', fullName: 'Blake Wolfe' }], characterNicknames: {}, roleplayChatId: 'chat-1' };
    const plan = planScopeCapture(scope1, decision, ctx, settings);
    assert.equal(plan.captured, true);
    assert.equal(plan.existingConversationId, null); // fresh thread
});

test('planScopeCapture does NOT route into a thread tethered to a DIFFERENT roleplayChatId', () => {
    const settings = { conversations: {} };
    settings.conversations['c-other'] = { id: 'c-other', participants: ['Blake'], messages: [{ role: 'assistant', content: 'earlier' }], lastActive: 10, tethered: true, roleplayChatId: 'chat-OTHER' };
    const scope1 = { owner: 'Tim', title: null, lines: [{ direction: 'Incoming', sender: 'Blake', text: 'new msg' }], lineIndices: [] };
    const decision = { captured: true, perspective: 'USER', ownerEntryName: null };
    const ctx = { userName: 'Tim', userNicknames: [], castRoster: [{ entryName: 'Blake', fullName: 'Blake Wolfe' }], characterNicknames: {}, roleplayChatId: 'chat-1' };
    const plan = planScopeCapture(scope1, decision, ctx, settings);
    assert.equal(plan.captured, true);
    assert.equal(plan.existingConversationId, null); // fresh — the other roleplay's thread is never touched
});
