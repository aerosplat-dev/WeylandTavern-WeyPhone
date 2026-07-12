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

test('buildMessages coalesces 3 consecutive assistant history entries into one newline-joined message', () => {
    const result = buildMessages({
        systemPromptText: 'SYSTEM',
        history: [
            { role: 'user', content: 'hey' },
            { role: 'assistant', content: 'burst 1' },
            { role: 'assistant', content: 'burst 2' },
            { role: 'assistant', content: 'burst 3' },
        ],
        userMessage: 'new message',
    });
    assert.deepEqual(result, [
        { role: 'system', content: 'SYSTEM' },
        { role: 'user', content: 'hey' },
        { role: 'assistant', content: 'burst 1\nburst 2\nburst 3' },
        { role: 'user', content: 'new message' },
    ]);
});

test('buildMessages coalesces 2 consecutive user history entries (dangling-user-turn scenario)', () => {
    const result = buildMessages({
        systemPromptText: 'SYSTEM',
        history: [
            { role: 'assistant', content: 'earlier reply' },
            { role: 'user', content: 'first attempt' },
            { role: 'user', content: 'retry after failed generation' },
        ],
        userMessage: 'new message',
    });
    assert.deepEqual(result, [
        { role: 'system', content: 'SYSTEM' },
        { role: 'assistant', content: 'earlier reply' },
        { role: 'user', content: 'first attempt\nretry after failed generation' },
        { role: 'user', content: 'new message' },
    ]);
});

test('buildMessages leaves strictly-alternating history unaffected (one message per entry)', () => {
    const result = buildMessages({
        systemPromptText: 'SYSTEM',
        history: [
            { role: 'user', content: 'a' },
            { role: 'assistant', content: 'b' },
            { role: 'user', content: 'c' },
            { role: 'assistant', content: 'd' },
        ],
        userMessage: 'new message',
    });
    assert.deepEqual(result, [
        { role: 'system', content: 'SYSTEM' },
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' },
        { role: 'assistant', content: 'd' },
        { role: 'user', content: 'new message' },
    ]);
});

test('buildMessages coalescing does not touch the leading system message or the trailing userMessage', () => {
    // Leading system message must never merge with a same-role-looking history entry, and the
    // trailing userMessage is always its own final message even if the last history entry is
    // also role:'user' (coalescing only applies within `history` itself).
    const result = buildMessages({
        systemPromptText: 'SYSTEM',
        history: [
            { role: 'assistant', content: 'x' },
            { role: 'user', content: 'y' },
        ],
        userMessage: 'z',
    });
    assert.deepEqual(result, [
        { role: 'system', content: 'SYSTEM' },
        { role: 'assistant', content: 'x' },
        { role: 'user', content: 'y' },
        { role: 'user', content: 'z' },
    ]);
    assert.equal(result[0].role, 'system');
    assert.equal(result.length, 4);
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
