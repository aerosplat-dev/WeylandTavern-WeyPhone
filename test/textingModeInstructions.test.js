// test/textingModeInstructions.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { TEXTING_MODE_INSTRUCTIONS } from '../lib/textingModeInstructions.js';

test('TEXTING_MODE_INSTRUCTIONS is a non-empty string', () => {
    assert.equal(typeof TEXTING_MODE_INSTRUCTIONS, 'string');
    assert.ok(TEXTING_MODE_INSTRUCTIONS.trim().length > 0);
});

test('TEXTING_MODE_INSTRUCTIONS establishes the always-texting framing', () => {
    assert.match(TEXTING_MODE_INSTRUCTIONS, /entire world|entire conversation/i);
    assert.match(TEXTING_MODE_INSTRUCTIONS, /Date\/Time\/Location|scene header/i);
});

test('TEXTING_MODE_INSTRUCTIONS references the Incoming line format', () => {
    assert.match(TEXTING_MODE_INSTRUCTIONS, /Incoming¦/);
});

test('TEXTING_MODE_INSTRUCTIONS explicitly omits the Expression/ClothingCode footer', () => {
    assert.match(TEXTING_MODE_INSTRUCTIONS, /\[Expression\]/);
    assert.match(TEXTING_MODE_INSTRUCTIONS, /omit/i);
});

test('TEXTING_MODE_INSTRUCTIONS explicitly omits HTML formatting regardless of the platform setting', () => {
    assert.match(TEXTING_MODE_INSTRUCTIONS, /HTML/);
});

test('TEXTING_MODE_INSTRUCTIONS instructs the model to infer voice from personality rather than a hardcoded style', () => {
    assert.match(TEXTING_MODE_INSTRUCTIONS, /personality/i);
});

test('TEXTING_MODE_INSTRUCTIONS discourages narration in this context', () => {
    assert.match(TEXTING_MODE_INSTRUCTIONS, /narration/i);
});

test('TEXTING_MODE_INSTRUCTIONS overrides bracketed internal-thought instructions from the character\'s own prompt', () => {
    // The platform's own master prompt tells the model "[Brackets] for character thoughts (if
    // enabled)", and some per-character configs enable it — texting mode must explicitly override
    // this, since nobody writes their internal thoughts as an actual text message.
    assert.match(TEXTING_MODE_INSTRUCTIONS, /\[Bracketed\]|\[brackets\]/i);
    assert.match(TEXTING_MODE_INSTRUCTIONS, /internal thoughts/i);
    assert.match(TEXTING_MODE_INSTRUCTIONS, /nobody writes/i);
});

test('TEXTING_MODE_INSTRUCTIONS instructs the model to actively judge this specific character\'s texting voice', () => {
    assert.match(TEXTING_MODE_INSTRUCTIONS, /how would THIS character actually text/);
});

test('TEXTING_MODE_INSTRUCTIONS discourages verbose back-to-back messages, framing a burst as an elevated-emotion signal', () => {
    assert.match(TEXTING_MODE_INSTRUCTIONS, /verbose back-to-back messages/i);
    assert.match(TEXTING_MODE_INSTRUCTIONS, /panic|fury|overjoyed/i);
});

test('TEXTING_MODE_INSTRUCTIONS instructs each message in an earned burst to get shorter, not longer, as it goes', () => {
    assert.match(TEXTING_MODE_INSTRUCTIONS, /SHORTER as it goes/);
    assert.match(TEXTING_MODE_INSTRUCTIONS, /never a string of full,? polished sentences/i);
});

