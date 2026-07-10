import test from 'node:test';
import assert from 'node:assert/strict';
import { getConversation, appendMessage } from '../lib/storage.js';

test('getConversation creates an empty conversation on first access', () => {
    const settings = { conversations: {} };
    const conversation = getConversation(settings, 'Rosa');
    assert.deepEqual(conversation, { messages: [], lastActive: null });
    assert.equal(settings.conversations.Rosa, conversation);
});

test('getConversation returns the same object on repeated calls (no reset)', () => {
    const settings = { conversations: {} };
    const first = getConversation(settings, 'Rosa');
    first.messages.push({ role: 'user', content: 'hi' });
    const second = getConversation(settings, 'Rosa');
    assert.equal(second.messages.length, 1);
});

test('appendMessage adds a message and updates lastActive', () => {
    const settings = { conversations: {} };
    const before = Date.now();
    const conversation = appendMessage(settings, 'Rosa', { role: 'user', content: 'hi' });
    assert.deepEqual(conversation.messages, [{ role: 'user', content: 'hi' }]);
    assert.ok(conversation.lastActive >= before);
});

test('appendMessage keeps conversations for different characters independent', () => {
    const settings = { conversations: {} };
    appendMessage(settings, 'Rosa', { role: 'user', content: 'to Rosa' });
    appendMessage(settings, 'Ava', { role: 'user', content: 'to Ava' });
    assert.equal(settings.conversations.Rosa.messages.length, 1);
    assert.equal(settings.conversations.Ava.messages.length, 1);
    assert.equal(settings.conversations.Rosa.messages[0].content, 'to Rosa');
});

test('appendMessage does not cap history length', () => {
    const settings = { conversations: {} };
    for (let i = 0; i < 500; i++) {
        appendMessage(settings, 'Rosa', { role: 'user', content: `message ${i}` });
    }
    assert.equal(settings.conversations.Rosa.messages.length, 500);
});
