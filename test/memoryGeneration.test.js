// test/memoryGeneration.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMemoryGenerationMessages, joinMemoriesForInjection } from '../lib/memoryGeneration.js';

test('buildMemoryGenerationMessages returns a system+user message pair', () => {
    const windowMessages = [
        { role: 'user', content: 'hey', timestamp: 1000 },
        { role: 'assistant', content: 'hi there', timestamp: 2000 },
    ];
    const fakeFormatClockTime = (ms) => `T${ms}`;
    const messages = buildMemoryGenerationMessages({
        charName: 'Rosa',
        personalityText: 'Rosa is blunt and sarcastic.',
        windowMessages,
        userName: 'Ava',
        formatClockTime: fakeFormatClockTime,
    });
    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, 'system');
    assert.equal(messages[1].role, 'user');
});

test('buildMemoryGenerationMessages system message references the character name and personality', () => {
    const messages = buildMemoryGenerationMessages({
        charName: 'Rosa',
        personalityText: 'Rosa is blunt and sarcastic.',
        windowMessages: [],
        userName: 'Ava',
        formatClockTime: () => '',
    });
    assert.match(messages[0].content, /Rosa/);
    assert.match(messages[0].content, /Rosa is blunt and sarcastic\./);
});

test('buildMemoryGenerationMessages omits the personality section when empty', () => {
    const messages = buildMemoryGenerationMessages({
        charName: 'Rosa',
        personalityText: '',
        windowMessages: [],
        userName: 'Ava',
        formatClockTime: () => '',
    });
    assert.doesNotMatch(messages[0].content, /\n\n\n/);
});

test('buildMemoryGenerationMessages user message contains the phone-format transcript of the window', () => {
    const windowMessages = [
        { role: 'user', content: 'hey', timestamp: 1000 },
        { role: 'assistant', content: 'hi there', timestamp: 2000 },
    ];
    const fakeFormatClockTime = (ms) => `T${ms}`;
    const messages = buildMemoryGenerationMessages({
        charName: 'Rosa',
        personalityText: '',
        windowMessages,
        userName: 'Ava',
        formatClockTime: fakeFormatClockTime,
    });
    assert.match(messages[1].content, /Outgoing¦T1000¦Ava¦hey/);
    assert.match(messages[1].content, /Incoming¦T2000¦Rosa¦hi there/);
});

test('joinMemoriesForInjection returns an empty string for no memories', () => {
    assert.equal(joinMemoriesForInjection([]), '');
});

test('joinMemoriesForInjection wraps memory content in a LONG TERM MEMORY block', () => {
    const result = joinMemoriesForInjection([{ content: 'They met at a party.' }, { content: 'She shared her real name.' }]);
    assert.match(result, /^\[LONG TERM MEMORY\]/);
    assert.match(result, /- They met at a party\./);
    assert.match(result, /- She shared her real name\./);
    assert.match(result, /\[END LONG TERM MEMORY\]$/);
});

test('joinMemoriesForInjection preserves memory order', () => {
    const result = joinMemoriesForInjection([{ content: 'first' }, { content: 'second' }]);
    assert.ok(result.indexOf('first') < result.indexOf('second'));
});
