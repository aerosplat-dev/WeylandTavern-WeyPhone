import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHijackSpeaker, shouldProcessHijackMessage, planHijackCapture } from '../lib/hijackRouting.js';

const ROSTER = [
    { entryName: 'Rosa', fullName: 'Rosa Vermillion', hasFullBot: true, hasSubbot: true },
    { entryName: 'Belle', fullName: 'Belle Cadence', hasFullBot: true, hasSubbot: true },
];

test('resolveHijackSpeaker matches case-insensitively and returns the canonical entryName', () => {
    assert.equal(resolveHijackSpeaker('rosa', ROSTER), 'Rosa');
    assert.equal(resolveHijackSpeaker('ROSA', ROSTER), 'Rosa');
    assert.equal(resolveHijackSpeaker('  Belle  ', ROSTER), 'Belle');
});

test('resolveHijackSpeaker returns null for an unrecognized or empty name', () => {
    assert.equal(resolveHijackSpeaker('Nobody', ROSTER), null);
    assert.equal(resolveHijackSpeaker('', ROSTER), null);
    assert.equal(resolveHijackSpeaker(null, ROSTER), null);
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
