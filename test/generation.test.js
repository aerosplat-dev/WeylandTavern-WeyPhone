import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, buildMessages, resolveProfileId, sendMessage } from '../lib/generation.js';

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
