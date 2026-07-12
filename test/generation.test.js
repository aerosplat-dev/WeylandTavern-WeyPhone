import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, buildMessages, resolveProfileId, sendMessage, reconstructHistoryAsPhoneFormat } from '../lib/generation.js';

test('buildSystemPrompt joins non-empty sections in main->WIbefore->description->personality->scenario->WIafter order', () => {
    const result = buildSystemPrompt({
        systemPrompt: 'MAIN',
        worldInfoBefore: 'WIBEFORE',
        descriptionText: 'DESC',
        personalityText: 'PERSONALITY',
        scenarioText: 'SCENARIO',
        worldInfoAfter: 'WIAFTER',
    });
    assert.equal(result, 'MAIN\n\nWIBEFORE\n\nDESC\n\nPERSONALITY\n\nSCENARIO\n\nWIAFTER');
});

test('buildSystemPrompt skips empty/whitespace-only sections', () => {
    const result = buildSystemPrompt({
        systemPrompt: 'MAIN',
        worldInfoBefore: '',
        descriptionText: '   ',
        personalityText: 'PERSONALITY',
        scenarioText: undefined,
        worldInfoAfter: 'WIAFTER',
    });
    assert.equal(result, 'MAIN\n\nPERSONALITY\n\nWIAFTER');
});

test('buildMessages produces a system message, then history, then the new user message', () => {
    const result = buildMessages({
        systemPromptText: 'SYSTEM',
        history: [{ role: 'user', content: 'earlier' }, { role: 'assistant', content: 'reply' }],
        userMessage: 'new message',
    });
    assert.deepEqual(result, [
        { role: 'system', content: 'SYSTEM' },
        { role: 'user', content: 'earlier' },
        { role: 'assistant', content: 'reply' },
        { role: 'user', content: 'new message' },
    ]);
});

test('resolveProfileId prefers the WeyPhone override when set', () => {
    assert.equal(resolveProfileId({ connectionProfileId: 'override-id' }, 'active-id'), 'override-id');
});

test('resolveProfileId falls back to the active profile when no override is set', () => {
    assert.equal(resolveProfileId({ connectionProfileId: '' }, 'active-id'), 'active-id');
});

test('resolveProfileId returns an empty string when neither is set', () => {
    assert.equal(resolveProfileId({ connectionProfileId: '' }, ''), '');
});

test('sendMessage throws when no profileId is available', async () => {
    await assert.rejects(
        () => sendMessage({ sendRequest: async () => 'unused', profileId: '', messages: [] }),
        /No Connection Profile available/,
    );
});

test('sendMessage calls sendRequest with the profileId and messages', async () => {
    let capturedArgs = null;
    const fakeSendRequest = async (profileId, messages) => {
        capturedArgs = { profileId, messages };
        return 'the reply';
    };
    const result = await sendMessage({ sendRequest: fakeSendRequest, profileId: 'p1', messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(result, 'the reply');
    assert.deepEqual(capturedArgs, { profileId: 'p1', messages: [{ role: 'user', content: 'hi' }] });
});

test('reconstructHistoryAsPhoneFormat wraps user turns as Outgoing lines and assistant turns as Incoming lines', () => {
    const history = [
        { role: 'user', content: 'hey', timestamp: 1000 },
        { role: 'assistant', content: 'hi there', timestamp: 2000 },
    ];
    const fakeFormatClockTime = (ms) => `T${ms}`;
    const result = reconstructHistoryAsPhoneFormat(history, { charName: 'Rosa', userName: 'Ava' }, fakeFormatClockTime);
    assert.deepEqual(result, [
        { role: 'user', content: 'Outgoing¦T1000¦Ava¦hey' },
        { role: 'assistant', content: 'Incoming¦T2000¦Rosa¦hi there' },
    ]);
});

test('reconstructHistoryAsPhoneFormat leaves the time field empty when a message has no timestamp', () => {
    const history = [{ role: 'user', content: 'hey' }];
    const fakeFormatClockTime = () => { throw new Error('should not be called'); };
    const result = reconstructHistoryAsPhoneFormat(history, { charName: 'Rosa', userName: 'Ava' }, fakeFormatClockTime);
    assert.deepEqual(result, [{ role: 'user', content: 'Outgoing¦¦Ava¦hey' }]);
});

test('reconstructHistoryAsPhoneFormat returns an empty array for empty history', () => {
    assert.deepEqual(reconstructHistoryAsPhoneFormat([], { charName: 'Rosa', userName: 'Ava' }, () => ''), []);
});

test('reconstructHistoryAsPhoneFormat preserves turn order', () => {
    const history = [
        { role: 'user', content: 'a', timestamp: 1 },
        { role: 'assistant', content: 'b', timestamp: 2 },
        { role: 'user', content: 'c', timestamp: 3 },
    ];
    const result = reconstructHistoryAsPhoneFormat(history, { charName: 'Rosa', userName: 'Ava' }, (t) => String(t));
    assert.deepEqual(result.map(r => r.content), ['Outgoing¦1¦Ava¦a', 'Incoming¦2¦Rosa¦b', 'Outgoing¦3¦Ava¦c']);
});
