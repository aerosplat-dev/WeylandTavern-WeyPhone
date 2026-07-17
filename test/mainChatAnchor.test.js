import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMainChatAnchor } from '../lib/mainChatAnchor.js';

test('resolveMainChatAnchor returns null when bi-directional tethering is disabled', () => {
    assert.equal(resolveMainChatAnchor({
        bidirectionalTetheringEnabled: false,
        characterId: 3,
        groupId: undefined,
        chatLength: 10,
    }), null);
});

test('resolveMainChatAnchor returns null when no main roleplay is active (no characterId or groupId)', () => {
    assert.equal(resolveMainChatAnchor({
        bidirectionalTetheringEnabled: true,
        characterId: undefined,
        groupId: undefined,
        chatLength: 10,
    }), null);
});

test('resolveMainChatAnchor returns the chat length when enabled and a solo character chat is active', () => {
    assert.equal(resolveMainChatAnchor({
        bidirectionalTetheringEnabled: true,
        characterId: 3,
        groupId: undefined,
        chatLength: 10,
    }), 10);
});

test('resolveMainChatAnchor returns the chat length when enabled and a group chat is active', () => {
    assert.equal(resolveMainChatAnchor({
        bidirectionalTetheringEnabled: true,
        characterId: undefined,
        groupId: 'group-1',
        chatLength: 4,
    }), 4);
});

test('resolveMainChatAnchor returns null if chatLength is not a number (defensive)', () => {
    assert.equal(resolveMainChatAnchor({
        bidirectionalTetheringEnabled: true,
        characterId: 3,
        groupId: undefined,
        chatLength: undefined,
    }), null);
});
