import test from 'node:test';
import assert from 'node:assert/strict';
import { decorateDiscordItem, decorateYikYakItem, speakerAccentColor } from '../lib/panel.js';

// decorateDiscordItem — real call shape (lib/panel.js's renderPhoneAppScreen) is
// `decorateDiscordItem(item)` where `item` is a PhoneAppItem from parsePhoneAppOutput
// (lib/phoneAppFormatting.js): `text` retains the boldPrefix's own text unwrapped at its front,
// and `boldPrefix` (when present) holds just that leading bold span's inner text with no markdown
// markers — see phoneAppFormatting.test.js's "captures a leading bold span as boldPrefix" case for
// the real shape this mirrors.

test('decorateDiscordItem flags @luckypaww as a server post and strips the bolded username from text', () => {
    const item = { text: '@luckypaww posted an update', boldPrefix: '@luckypaww' };
    const result = decorateDiscordItem(item);
    assert.equal(result.isServerPost, true);
    assert.equal(result.username, '@luckypaww');
    assert.equal(result.text, 'posted an update');
});

test('decorateDiscordItem treats a normal user post as non-server and still extracts the username', () => {
    const item = { text: '@belle_281 said something funny', boldPrefix: '@belle_281' };
    const result = decorateDiscordItem(item);
    assert.equal(result.isServerPost, false);
    assert.equal(result.username, '@belle_281');
    assert.equal(result.text, 'said something funny');
});

test('decorateDiscordItem falls back to plain text when there is no boldPrefix', () => {
    const item = { text: 'no username here, just a plain message' };
    const result = decorateDiscordItem(item);
    assert.equal(result.isServerPost, false);
    assert.equal(result.username, null);
    assert.equal(result.text, 'no username here, just a plain message');
});

test('decorateDiscordItem falls back to plain text when boldPrefix does not actually prefix text', () => {
    // Mirrors the JSDoc's own stated "never assumes the model's output matches perfectly" guard:
    // boldPrefix present but text doesn't start with it.
    const item = { text: 'something else entirely', boldPrefix: '@luckypaww' };
    const result = decorateDiscordItem(item);
    assert.equal(result.isServerPost, false);
    assert.equal(result.username, null);
    assert.equal(result.text, 'something else entirely');
});

// decorateYikYakItem — called as `decorateYikYakItem(item.text)` (a plain string, not a whole item)
// from renderPhoneAppScreen's Yik Yak branch.

test('decorateYikYakItem extracts a trailing "+NN" vote count and trims it from the text', () => {
    const result = decorateYikYakItem('the dining hall soft serve machine is down again +47');
    assert.equal(result.voteCount, 47);
    assert.equal(result.text, 'the dining hall soft serve machine is down again');
});

test('decorateYikYakItem returns voteCount null and unchanged text when there is no vote count', () => {
    const result = decorateYikYakItem('anyone else hear that noise from the quad at 2am');
    assert.equal(result.voteCount, null);
    assert.equal(result.text, 'anyone else hear that noise from the quad at 2am');
});

// speakerAccentColor — used directly as a CSS color value (`nameLabel.style.color =
// speakerAccentColor(...)` in renderMessages), so real consumers expect a full `hsl(...)` string,
// not a bare hue number.

test('speakerAccentColor is deterministic: the same name produces the same color on repeated calls', () => {
    assert.equal(speakerAccentColor('Rosa'), speakerAccentColor('Rosa'));
});

test('speakerAccentColor returns a full hsl(...) string with the fixed saturation/lightness', () => {
    const color = speakerAccentColor('Rosa');
    assert.match(color, /^hsl\(\d+, 65%, 72%\)$/);
});

test('speakerAccentColor produces different colors for different names', () => {
    const rosa = speakerAccentColor('Rosa');
    const blake = speakerAccentColor('Blake');
    const belle = speakerAccentColor('Belle');
    assert.notEqual(rosa, blake);
    assert.notEqual(rosa, belle);
    assert.notEqual(blake, belle);
});
