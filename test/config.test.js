import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_NAME, defaultSettings, getSettings } from '../lib/config.js';

test('MODULE_NAME is WeyPhone', () => {
    assert.equal(MODULE_NAME, 'WeyPhone');
});

test('getSettings creates the settings object on first call', () => {
    const extensionSettings = {};
    const settings = getSettings(extensionSettings);
    assert.deepEqual(settings, defaultSettings);
    assert.equal(extensionSettings[MODULE_NAME], settings);
});

test('getSettings backfills newly-added default keys without clobbering existing values', () => {
    const extensionSettings = {
        [MODULE_NAME]: { debug: true, conversations: {} },
    };
    const settings = getSettings(extensionSettings);
    assert.equal(settings.debug, true);
    assert.equal(settings.connectionProfileId, '');
});

test('getSettings migrates milestone-1-era conversations (keyed by charName, no id) into the current shape', () => {
    const extensionSettings = {
        [MODULE_NAME]: { debug: true, conversations: { Rosa: { messages: ['x'], lastActive: 123 } } },
    };
    const settings = getSettings(extensionSettings);
    assert.equal(settings.conversations.Rosa, undefined);
    const migrated = Object.values(settings.conversations)[0];
    assert.equal(migrated.charName, 'Rosa');
    assert.deepEqual(migrated.messages, ['x']);
    assert.equal(migrated.lastActive, 123);
});

test('getSettings returns the same live object on repeated calls', () => {
    const extensionSettings = {};
    const first = getSettings(extensionSettings);
    first.debug = true;
    const second = getSettings(extensionSettings);
    assert.equal(second.debug, true);
});

test('getSettings backfills memory fields on a pre-milestone-5 conversation', () => {
    const extensionSettings = {
        [MODULE_NAME]: { conversations: { conv_1: { id: 'conv_1', charName: 'Rosa', messages: [], createdAt: 1, lastActive: 1 } } },
    };
    const settings = getSettings(extensionSettings);
    const conversation = settings.conversations.conv_1;
    assert.deepEqual(conversation.memories, []);
    assert.equal(conversation.memoryThreshold, 100);
});

test('getSettings backfills tethered fields on a pre-milestone-6 conversation', () => {
    const extensionSettings = {
        [MODULE_NAME]: { conversations: { conv_1: { id: 'conv_1', charName: 'Rosa', messages: [], createdAt: 1, lastActive: 1 } } },
    };
    const settings = getSettings(extensionSettings);
    const conversation = settings.conversations.conv_1;
    assert.equal(conversation.tethered, false);
    assert.equal(conversation.tetheredHistoryCap, null);
});
