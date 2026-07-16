import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSubbotPersonality } from '../lib/subbotContent.js';

test('resolveSubbotPersonality reads strings["rsb" + macroKey]', () => {
    const strings = { rsbFA: '[FASTI INFO]\nFasti is an incubus...' };
    assert.equal(resolveSubbotPersonality(strings, 'FA'), '[FASTI INFO]\nFasti is an incubus...');
});

test('resolveSubbotPersonality returns an empty string for a macro key with no matching content', () => {
    const strings = {};
    assert.equal(resolveSubbotPersonality(strings, 'ZZ'), '');
});

test('resolveSubbotPersonality returns an empty string when the resolved value is not a string', () => {
    const strings = { rsbXX: undefined };
    assert.equal(resolveSubbotPersonality(strings, 'XX'), '');
});
