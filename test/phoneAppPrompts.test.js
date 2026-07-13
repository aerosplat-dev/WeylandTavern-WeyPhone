// test/phoneAppPrompts.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PHONE_APP_PROMPTS } from '../lib/phoneAppPrompts.js';

test('PHONE_APP_PROMPTS.chronicle is a non-empty string', () => {
    assert.equal(typeof PHONE_APP_PROMPTS.chronicle, 'string');
    assert.ok(PHONE_APP_PROMPTS.chronicle.trim().length > 0);
});

test('PHONE_APP_PROMPTS.discord is a non-empty string', () => {
    assert.equal(typeof PHONE_APP_PROMPTS.discord, 'string');
    assert.ok(PHONE_APP_PROMPTS.discord.trim().length > 0);
});

test('PHONE_APP_PROMPTS.yikyak is a non-empty string', () => {
    assert.equal(typeof PHONE_APP_PROMPTS.yikyak, 'string');
    assert.ok(PHONE_APP_PROMPTS.yikyak.trim().length > 0);
});

test('all three prompts carry the special-generation framing marker', () => {
    for (const key of ['chronicle', 'discord', 'yikyak']) {
        assert.match(PHONE_APP_PROMPTS[key], /\[SPECIAL GENERATION/);
    }
});

test('all three prompts state the markdown formatting convention', () => {
    for (const key of ['chronicle', 'discord', 'yikyak']) {
        assert.match(PHONE_APP_PROMPTS[key], /## /);
        assert.match(PHONE_APP_PROMPTS[key], /"- "/);
    }
});

test('chronicle includes the WEYLAND ALERTS and HEADLINES sections', () => {
    assert.match(PHONE_APP_PROMPTS.chronicle, /## WEYLAND ALERTS/);
    assert.match(PHONE_APP_PROMPTS.chronicle, /## HEADLINES/);
});

test('discord references @luckypaww and the expected channels', () => {
    assert.match(PHONE_APP_PROMPTS.discord, /@luckypaww/);
    assert.match(PHONE_APP_PROMPTS.discord, /#announcements/);
    assert.match(PHONE_APP_PROMPTS.discord, /#dorm-commons/);
    assert.match(PHONE_APP_PROMPTS.discord, /#weyland-sports/);
});

test('yikyak includes the YIK YAK section and contrasts anonymity with Discord', () => {
    assert.match(PHONE_APP_PROMPTS.yikyak, /## YIK YAK/);
    assert.match(PHONE_APP_PROMPTS.yikyak, /anonymous/i);
    assert.match(PHONE_APP_PROMPTS.yikyak, /Discord/);
});
