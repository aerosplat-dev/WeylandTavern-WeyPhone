import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createConversation,
    getConversation,
    appendMessage,
    editMessage,
    deleteMessage,
    deleteConversation,
    getAllConversationSummaries,
} from '../lib/storage.js';

test('createConversation creates a conversation with a generated id and empty messages', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    assert.equal(conversation.charName, 'Rosa');
    assert.deepEqual(conversation.messages, []);
    assert.equal(typeof conversation.id, 'string');
    assert.ok(conversation.id.length > 0);
    assert.equal(typeof conversation.createdAt, 'number');
    assert.equal(conversation.lastActive, conversation.createdAt);
    assert.equal(settings.conversations[conversation.id], conversation);
});

test('createConversation generates distinct ids for successive calls', () => {
    const settings = { conversations: {} };
    const a = createConversation(settings, 'Rosa');
    const b = createConversation(settings, 'Rosa');
    assert.notEqual(a.id, b.id);
});

test('createConversation allows multiple conversations with the same character', () => {
    const settings = { conversations: {} };
    const a = createConversation(settings, 'Rosa');
    const b = createConversation(settings, 'Rosa');
    assert.equal(Object.keys(settings.conversations).length, 2);
    assert.equal(getConversation(settings, a.id).charName, 'Rosa');
    assert.equal(getConversation(settings, b.id).charName, 'Rosa');
});

test('getConversation returns undefined for an unknown id', () => {
    const settings = { conversations: {} };
    assert.equal(getConversation(settings, 'nonexistent'), undefined);
});

test('appendMessage pushes a message and updates lastActive', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    const before = conversation.createdAt;
    const result = appendMessage(settings, conversation.id, { role: 'user', content: 'hi' });
    assert.deepEqual(result.messages, [{ role: 'user', content: 'hi' }]);
    assert.ok(result.lastActive >= before);
});

test('appendMessage returns undefined and is a no-op for an unknown conversation id', () => {
    const settings = { conversations: {} };
    assert.equal(appendMessage(settings, 'nonexistent', { role: 'user', content: 'hi' }), undefined);
});

test('editMessage replaces the content at the given index', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    appendMessage(settings, conversation.id, { role: 'user', content: 'original' });
    editMessage(settings, conversation.id, 0, 'edited');
    assert.equal(getConversation(settings, conversation.id).messages[0].content, 'edited');
});

test('editMessage does not change role or lastActive', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    appendMessage(settings, conversation.id, { role: 'assistant', content: 'original' });
    const lastActiveBefore = getConversation(settings, conversation.id).lastActive;
    editMessage(settings, conversation.id, 0, 'edited');
    const updated = getConversation(settings, conversation.id);
    assert.equal(updated.messages[0].role, 'assistant');
    assert.equal(updated.lastActive, lastActiveBefore);
});

test('editMessage is a no-op for an out-of-range index or unknown conversation', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    appendMessage(settings, conversation.id, { role: 'user', content: 'only message' });
    editMessage(settings, conversation.id, 5, 'should not apply');
    assert.equal(getConversation(settings, conversation.id).messages[0].content, 'only message');
    assert.equal(editMessage(settings, 'nonexistent', 0, 'x'), undefined);
});

test('deleteMessage removes the message at the given index', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    appendMessage(settings, conversation.id, { role: 'user', content: 'first' });
    appendMessage(settings, conversation.id, { role: 'assistant', content: 'second' });
    deleteMessage(settings, conversation.id, 0);
    const updated = getConversation(settings, conversation.id);
    assert.deepEqual(updated.messages, [{ role: 'assistant', content: 'second' }]);
});

test('deleteMessage is a no-op for an out-of-range index or unknown conversation', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    appendMessage(settings, conversation.id, { role: 'user', content: 'only message' });
    deleteMessage(settings, conversation.id, 5);
    assert.equal(getConversation(settings, conversation.id).messages.length, 1);
    assert.equal(deleteMessage(settings, 'nonexistent', 0), undefined);
});

test('deleteConversation removes the conversation entirely', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    deleteConversation(settings, conversation.id);
    assert.equal(getConversation(settings, conversation.id), undefined);
    assert.equal(Object.keys(settings.conversations).length, 0);
});

test('deleteConversation on an unknown id does not throw', () => {
    const settings = { conversations: {} };
    assert.doesNotThrow(() => deleteConversation(settings, 'nonexistent'));
});

test('getAllConversationSummaries returns summaries sorted by lastActive descending', () => {
    const settings = { conversations: {} };
    const a = createConversation(settings, 'Rosa');
    appendMessage(settings, a.id, { role: 'user', content: 'first conversation' });
    const b = createConversation(settings, 'Ava');
    appendMessage(settings, b.id, { role: 'user', content: 'second conversation' });

    const summaries = getAllConversationSummaries(settings);
    assert.equal(summaries.length, 2);
    assert.equal(summaries[0].id, b.id); // most recently active first
    assert.equal(summaries[0].charName, 'Ava');
    assert.equal(summaries[0].lastMessageSnippet, 'second conversation');
    assert.equal(summaries[1].id, a.id);
});

test('getAllConversationSummaries reports an empty snippet for a conversation with no messages', () => {
    const settings = { conversations: {} };
    const conversation = createConversation(settings, 'Rosa');
    const summaries = getAllConversationSummaries(settings);
    assert.equal(summaries[0].lastMessageSnippet, '');
    assert.equal(summaries[0].id, conversation.id);
});

test('getAllConversationSummaries returns an empty array when there are no conversations', () => {
    const settings = { conversations: {} };
    assert.deepEqual(getAllConversationSummaries(settings), []);
});
