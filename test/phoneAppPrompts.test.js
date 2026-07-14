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

// Regression test: the WEYLAND ALERTS section had no explicit timestamp-format instruction of its
// own (unlike Discord/Yik Yak/Twitter, which all spell out an exact machine-parseable convention),
// so it only inherited the generic SHARED_FRAMING_PREAMBLE's vague "if it has a specific time" —
// which the model interpreted as a day/date reference (e.g. "[Monday]"), a format
// lib/phoneAppFormatting.js's TIMESTAMP_RE never matches (it requires a clock time), so the
// bracketed day was left stuck in the rendered item text instead of becoming a timestamp badge.
test('chronicle explicitly requires a clock-time timestamp (not a day/date) for Weyland Alerts', () => {
    assert.match(PHONE_APP_PROMPTS.chronicle, /\[9:14 AM\]/);
    assert.match(PHONE_APP_PROMPTS.chronicle, /do\s+not\s+use\s+a\s+day\s+name/i);
});

// The alert count now uses ST's real {{random::1::2::3}} macro (resolved server-side, before the
// prompt is even sent, via context.substituteParams — see index.js's runFlavorAppGeneration) rather
// than asking the model to freely pick "2-3 items" itself.
test('chronicle uses the {{random::1::2::3}} macro for the Weyland Alerts item count', () => {
    assert.match(PHONE_APP_PROMPTS.chronicle, /\{\{random::1::2::3\}\} items/);
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

test('discord and yikyak both embed the real WEYLAND ROSTER names/handles', () => {
    for (const key of ['discord', 'yikyak']) {
        assert.match(PHONE_APP_PROMPTS[key], /## WEYLAND ROSTER/);
        assert.match(PHONE_APP_PROMPTS[key], /Blake \[@codewolf\]/);
        assert.match(PHONE_APP_PROMPTS[key], /Kai \[@breakingthecycle\]/);
        assert.match(PHONE_APP_PROMPTS[key], /Kris \[@QKittonMod\]/);
    }
});

test('discord still contains the pre-existing static @luckypaww mention, unremoved by the roster addition', () => {
    assert.match(PHONE_APP_PROMPTS.discord, /@luckypaww/);
});

test('yikyak explicitly notes anonymous posts can still be recognizably consistent with a roster personality', () => {
    assert.match(PHONE_APP_PROMPTS.yikyak, /recognizably\s+consistent with one of the roster personalities above/);
    assert.match(PHONE_APP_PROMPTS.yikyak, /guess who posted this/);
});

test('chronicle embeds several WEYLAND_LOCATIONS keywords but does NOT include roster names', () => {
    assert.match(PHONE_APP_PROMPTS.chronicle, /Sakurai/);
    assert.match(PHONE_APP_PROMPTS.chronicle, /Black Barrel Bar/);
    assert.match(PHONE_APP_PROMPTS.chronicle, /kemeticism/);
    assert.doesNotMatch(PHONE_APP_PROMPTS.chronicle, /@codewolf/);
    assert.doesNotMatch(PHONE_APP_PROMPTS.chronicle, /## WEYLAND ROSTER/);
});

test('discord and yikyak do NOT include the WEYLAND_LOCATIONS list (location-grounding is scoped to chronicle only)', () => {
    assert.doesNotMatch(PHONE_APP_PROMPTS.discord, /kemeticism/);
    assert.doesNotMatch(PHONE_APP_PROMPTS.yikyak, /kemeticism/);
});

test('discord and yikyak prompts still contain the full roster text after the weylandRoster refactor', () => {
    assert.ok(PHONE_APP_PROMPTS.discord.includes('Blake [@codewolf]'));
    assert.ok(PHONE_APP_PROMPTS.discord.includes('Warren [@lovingnotes]'));
    assert.ok(PHONE_APP_PROMPTS.yikyak.includes('Blake [@codewolf]'));
    assert.ok(PHONE_APP_PROMPTS.yikyak.includes('Warren [@lovingnotes]'));
});

test('discord prompt instructs live back-and-forth chat flavor', () => {
    assert.match(PHONE_APP_PROMPTS.discord, /live back-and-forth/i);
});

// Regression test: the discord prompt used to only vaguely say "spread across channels", with no
// literal, machine-parseable convention for which channel a message belongs to or how to write a
// message bullet — the per-channel "## #channel" sub-header nesting that lib/phoneAppFormatting.js
// and lib/panel.js were built/tested against was something one real generation happened to do on
// its own, never something the prompt actually required, so other generations could (and did)
// drift to an entirely unparseable format instead. This asserts the prompt now explicitly mandates
// the exact convention the parser/renderer rely on.
test('discord prompt explicitly mandates per-channel "## #channel" sub-headers instead of one flat section', () => {
    assert.match(PHONE_APP_PROMPTS.discord, /## #announcements/);
    assert.match(PHONE_APP_PROMPTS.discord, /own markdown h2 header/i);
    assert.match(PHONE_APP_PROMPTS.discord, /do not write "in #channel:"/i, 'prompt must explicitly tell the model not to name its channel inline in the message text');
});

test('discord prompt gives an exact message-bullet template with timestamp, bolded handle, and em dash', () => {
    assert.match(PHONE_APP_PROMPTS.discord, /\[10:52 PM\]\s+\*\*@handle\*\*\s+—\s+message text/);
});
