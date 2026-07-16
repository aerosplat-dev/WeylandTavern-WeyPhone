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

// Regression coverage for TWITTER_ONLY_ROSTER's whole reason for existing: Navine and Bastet are
// NOT Weyland students, so they must never appear in the campus-bound Discord/Yik Yak prompts —
// only lib/twitterPrompts.js should ever reference TWITTER_ONLY_ROSTER.
test('PHONE_APP_PROMPTS.discord and .yikyak never mention the non-student TWITTER_ONLY_ROSTER accounts', () => {
    assert.doesNotMatch(PHONE_APP_PROMPTS.discord, /unschoolingjourney_navine|RoyalBastet/);
    assert.doesNotMatch(PHONE_APP_PROMPTS.yikyak, /unschoolingjourney_navine|RoyalBastet/);
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

test('yikyak includes the YIK YAK section and contrasts anonymity with a semi-public, real-name channel', () => {
    // Deliberately does NOT reference another app by name (prompts aren't aware of each other or
    // of other social apps) — the contrast is phrased by subject matter instead.
    assert.match(PHONE_APP_PROMPTS.yikyak, /## YIK YAK/);
    assert.match(PHONE_APP_PROMPTS.yikyak, /anonymous/i);
    assert.match(PHONE_APP_PROMPTS.yikyak, /semi-public channel where every message is tied to a real, named identity/);
    assert.doesNotMatch(PHONE_APP_PROMPTS.yikyak, /Discord|Twitter|Chronicle/);
});

// Regression coverage for cross-app subject-matter bleed: each of the three apps now discourages
// the OTHER two apps' dominant subject matter, described by content type rather than app name
// (prompts aren't aware of each other or of other social apps, so no app is ever named).
test('discord discourages anonymous-confession subject matter and standalone-broadcast subject matter', () => {
    assert.match(PHONE_APP_PROMPTS.discord, /avoid anonymous-sounding confessions/i);
    assert.match(PHONE_APP_PROMPTS.discord, /avoid single standalone personal-life announcements/i);
    assert.doesNotMatch(PHONE_APP_PROMPTS.discord, /Yik Yak|Twitter|Chronicle/);
});

test('yikyak discourages organized-channel-conversation subject matter and personal-broadcast subject matter', () => {
    assert.match(PHONE_APP_PROMPTS.yikyak, /avoid writing this like an organized back-and-forth conversation/i);
    assert.match(PHONE_APP_PROMPTS.yikyak, /a public personal update\/announcement with an attached\s+name/i);
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
    assert.match(PHONE_APP_PROMPTS.yikyak, /recognizably\s+consistent\s+with\s+one\s+of\s+the\s+roster\s+personalities\s+above/);
    assert.match(PHONE_APP_PROMPTS.yikyak, /guess\s+who\s+posted\s+this/);
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
