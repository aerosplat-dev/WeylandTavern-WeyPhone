import test from 'node:test';
import assert from 'node:assert/strict';
import { findMostRecentAssistantMessage } from '../lib/hijackManual.js';
import { undoCapture } from '../lib/hijackManual.js';
import { scopeMatchesThreadParticipants } from '../lib/hijackManual.js';
import { applyImportWipeRestore } from '../lib/hijackManual.js';

test('findMostRecentAssistantMessage returns null for an empty chat', () => {
    assert.equal(findMostRecentAssistantMessage([]), null);
});

test('findMostRecentAssistantMessage returns null when chat is undefined', () => {
    assert.equal(findMostRecentAssistantMessage(undefined), null);
});

test('findMostRecentAssistantMessage skips a trailing user message and returns the assistant index before it', () => {
    const chat = [
        { is_user: true, mes: 'hello' },
        { is_user: false, mes: 'hi there' },
        { is_user: true, mes: 'ok bye' },
    ];
    assert.equal(findMostRecentAssistantMessage(chat), 1);
});

test('findMostRecentAssistantMessage skips multiple trailing user/system messages', () => {
    const chat = [
        { is_user: false, mes: 'assistant reply' },
        { is_system: true, mes: 'system note' },
        { is_user: true, mes: 'user 1' },
        { is_user: true, mes: 'user 2' },
    ];
    assert.equal(findMostRecentAssistantMessage(chat), 0);
});

test('findMostRecentAssistantMessage returns null when no assistant message exists at all', () => {
    const chat = [
        { is_user: true, mes: 'user 1' },
        { is_system: true, mes: 'system note' },
    ];
    assert.equal(findMostRecentAssistantMessage(chat), null);
});

test('findMostRecentAssistantMessage returns the last index directly when it is already an assistant message', () => {
    const chat = [
        { is_user: true, mes: 'user 1' },
        { is_user: false, mes: 'assistant reply' },
    ];
    assert.equal(findMostRecentAssistantMessage(chat), 1);
});

test('findMostRecentAssistantMessage treats a non-string mes as not-processable (skips it like a user message)', () => {
    const chat = [
        { is_user: false, mes: 'earlier assistant reply' },
        { is_user: false, mes: undefined },
    ];
    assert.equal(findMostRecentAssistantMessage(chat), 0);
});

test('undoCapture restores the pre-capture text on the messageId it targets', () => {
    const chat = [{ mes: 'AFTER capture text' }];
    const settings = { conversations: {} };
    const snapshot = { messageId: 0, preCaptureText: 'BEFORE capture text', affectedConversations: [] };
    undoCapture(settings, snapshot, chat);
    assert.equal(chat[0].mes, 'BEFORE capture text');
});

test('undoCapture removes exactly the cached appended message OBJECTS by identity, leaving unrelated messages (including ones sent afterward) untouched', () => {
    const capturedMsg1 = { role: 'assistant', content: 'hi', timestamp: 1 };
    const capturedMsg2 = { role: 'assistant', content: 'there', timestamp: 2 };
    const unrelatedLaterMsg = { role: 'user', content: 'sent by the user after the capture', timestamp: 3 };
    const settings = {
        conversations: {
            c1: { id: 'c1', participants: ['Rosa'], messages: [capturedMsg1, capturedMsg2, unrelatedLaterMsg] },
        },
    };
    const snapshot = {
        messageId: 0,
        preCaptureText: 'BEFORE',
        affectedConversations: [
            { conversationId: 'c1', appendedMessages: [capturedMsg1, capturedMsg2], wasNewlyCreated: false },
        ],
    };
    undoCapture(settings, snapshot, [{ mes: 'AFTER' }]);
    assert.deepEqual(settings.conversations.c1.messages, [unrelatedLaterMsg]);
});

test('undoCapture deletes a conversation entirely when it was newly created by the capture', () => {
    const capturedMsg = { role: 'assistant', content: 'hi', timestamp: 1 };
    const settings = {
        conversations: {
            c1: { id: 'c1', participants: ['Rosa'], messages: [capturedMsg] },
        },
    };
    const snapshot = {
        messageId: 0,
        preCaptureText: 'BEFORE',
        affectedConversations: [
            { conversationId: 'c1', appendedMessages: [capturedMsg], wasNewlyCreated: true },
        ],
    };
    undoCapture(settings, snapshot, [{ mes: 'AFTER' }]);
    assert.equal(settings.conversations.c1, undefined);
});

test('undoCapture handles multiple affected conversations independently (group-chat capture)', () => {
    const msgA = { role: 'assistant', content: 'a', timestamp: 1, speaker: 'Rosa' };
    const msgB = { role: 'assistant', content: 'b', timestamp: 2, speaker: 'Belle' };
    const keepA = { role: 'user', content: 'keep me', timestamp: 3 };
    const settings = {
        conversations: {
            solo: { id: 'solo', participants: ['Rosa'], messages: [msgA, keepA] },
            group: { id: 'group', participants: ['Rosa', 'Belle'], messages: [msgB] },
        },
    };
    const snapshot = {
        messageId: 0,
        preCaptureText: 'BEFORE',
        affectedConversations: [
            { conversationId: 'solo', appendedMessages: [msgA], wasNewlyCreated: false },
            { conversationId: 'group', appendedMessages: [msgB], wasNewlyCreated: true },
        ],
    };
    undoCapture(settings, snapshot, [{ mes: 'AFTER' }]);
    assert.deepEqual(settings.conversations.solo.messages, [keepA]);
    assert.equal(settings.conversations.group, undefined);
});

test('undoCapture is a no-op on the chat when messageId is null (nothing to restore)', () => {
    const settings = { conversations: {} };
    const snapshot = { messageId: null, preCaptureText: '', affectedConversations: [] };
    const chat = [{ mes: 'unaffected' }];
    undoCapture(settings, snapshot, chat);
    assert.equal(chat[0].mes, 'unaffected');
});

test('scopeMatchesThreadParticipants: a headered scope matches only when its resolved participant set exactly equals the thread\'s own (order-independent)', () => {
    const scope = { owner: 'Rosa', title: null, lines: [], lineIndices: [] };
    const decision = { captured: true, perspective: 'CHAR', ownerEntryName: 'Rosa' };
    assert.equal(scopeMatchesThreadParticipants(scope, decision, ['Rosa'], ['Rosa'], false), true);
    assert.equal(scopeMatchesThreadParticipants(scope, decision, ['Rosa', 'Belle'], ['Rosa'], false), false);
    assert.equal(scopeMatchesThreadParticipants(scope, decision, ['Belle'], ['Belle'], false), false);
});

test('scopeMatchesThreadParticipants: order-independence for a group thread', () => {
    const scope = { owner: 'Belle', title: 'Rosa & Belle', lines: [], lineIndices: [] };
    const decision = { captured: true, perspective: 'CHAR', ownerEntryName: 'Belle' };
    assert.equal(scopeMatchesThreadParticipants(scope, decision, ['Belle', 'Rosa'], ['Rosa', 'Belle'], false), true);
});

test('scopeMatchesThreadParticipants: a headerless (owner:null) scope is rejected by default, even with a plausible participant set, unless parseUnscoped is true', () => {
    const scope = { owner: null, title: null, lines: [], lineIndices: [] };
    const decision = { captured: true, perspective: 'CHAR', ownerEntryName: 'Rosa' };
    assert.equal(scopeMatchesThreadParticipants(scope, decision, ['Rosa'], ['Rosa'], false), false);
});

test('scopeMatchesThreadParticipants: with parseUnscoped=true, a headerless scope is eligible for a thread as long as its resolved owner is inside that thread\'s participant set', () => {
    const scope = { owner: null, title: null, lines: [], lineIndices: [] };
    const decision = { captured: true, perspective: 'CHAR', ownerEntryName: 'Rosa' };
    assert.equal(scopeMatchesThreadParticipants(scope, decision, ['Rosa'], ['Rosa'], true), true);
});

test('scopeMatchesThreadParticipants: with parseUnscoped=true, a headerless scope is still rejected if its resolved owner is a DIFFERENT character not in the thread', () => {
    const scope = { owner: null, title: null, lines: [], lineIndices: [] };
    const decision = { captured: true, perspective: 'CHAR', ownerEntryName: 'Belle' };
    assert.equal(scopeMatchesThreadParticipants(scope, decision, ['Rosa'], ['Rosa'], true), false);
});

test('scopeMatchesThreadParticipants: a USER-perspective scope (no CHAR owner) never matches any thread — nothing character-owned to attribute it to', () => {
    const scope = { owner: null, title: null, lines: [], lineIndices: [] };
    const decision = { captured: true, perspective: 'USER', ownerEntryName: null };
    assert.equal(scopeMatchesThreadParticipants(scope, decision, ['Rosa'], ['Rosa'], true), false);
});

test('applyImportWipeRestore: on success, the target keeps its rebuilt messages and has lastMemoryMessageIndex reset to 0, while every sibling is restored to its exact snapshot', () => {
    const target = { id: 'target', messages: ['REBUILT'], lastActive: 999, lastMemoryMessageIndex: 42 };
    const sibling = { id: 'sibling', messages: [], lastActive: 0, lastMemoryMessageIndex: 0 };
    const snapshots = [
        { conv: target, messages: ['old target msg 1', 'old target msg 2'], lastActive: 100, lastMemoryMessageIndex: 5 },
        { conv: sibling, messages: ['sibling msg'], lastActive: 200, lastMemoryMessageIndex: 3 },
    ];
    applyImportWipeRestore(snapshots, target, true);
    // Target keeps its rebuilt content, but its memory-tracking index is reset to 0.
    assert.deepEqual(target.messages, ['REBUILT']);
    assert.equal(target.lastActive, 999);
    assert.equal(target.lastMemoryMessageIndex, 0);
    // Sibling is restored to its exact pre-wipe snapshot.
    assert.deepEqual(sibling.messages, ['sibling msg']);
    assert.equal(sibling.lastActive, 200);
    assert.equal(sibling.lastMemoryMessageIndex, 3);
});

test('applyImportWipeRestore: on failure, the target AND every sibling are restored to their exact snapshots (full rollback)', () => {
    const target = { id: 'target', messages: [], lastActive: 999, lastMemoryMessageIndex: 42 };
    const sibling = { id: 'sibling', messages: [], lastActive: 0, lastMemoryMessageIndex: 0 };
    const snapshots = [
        { conv: target, messages: ['old target msg 1', 'old target msg 2'], lastActive: 100, lastMemoryMessageIndex: 5 },
        { conv: sibling, messages: ['sibling msg'], lastActive: 200, lastMemoryMessageIndex: 3 },
    ];
    applyImportWipeRestore(snapshots, target, false);
    assert.deepEqual(target.messages, ['old target msg 1', 'old target msg 2']);
    assert.equal(target.lastActive, 100);
    assert.equal(target.lastMemoryMessageIndex, 5);
    assert.deepEqual(sibling.messages, ['sibling msg']);
    assert.equal(sibling.lastActive, 200);
    assert.equal(sibling.lastMemoryMessageIndex, 3);
});

test('applyImportWipeRestore: with no siblings (the common single-thread case), success only resets the target\'s lastMemoryMessageIndex', () => {
    const target = { id: 'target', messages: ['REBUILT'], lastActive: 999, lastMemoryMessageIndex: 42 };
    const snapshots = [
        { conv: target, messages: ['old msg'], lastActive: 100, lastMemoryMessageIndex: 5 },
    ];
    applyImportWipeRestore(snapshots, target, true);
    assert.deepEqual(target.messages, ['REBUILT']);
    assert.equal(target.lastMemoryMessageIndex, 0);
});
