import test from 'node:test';
import assert from 'node:assert/strict';
import { findMostRecentAssistantMessage } from '../lib/hijackManual.js';

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
