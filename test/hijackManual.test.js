import test from 'node:test';
import assert from 'node:assert/strict';
import { findMostRecentAssistantMessage } from '../lib/hijackManual.js';
import { undoCapture } from '../lib/hijackManual.js';

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
