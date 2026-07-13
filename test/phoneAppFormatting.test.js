import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePhoneAppOutput } from '../lib/phoneAppFormatting.js';

// All three fixtures below are REAL raw output captured live from the actual running platform
// (SillyTavern's real generate('quiet', {}) via the push/quiet-generate/pop mechanism in
// lib/phoneCommand.js), against the 'Rosa' main-roleplay chat (character 'Rosa', chatId
// 'Rosa - 2025-11-02@22h06m12s', 75 existing messages) — not hypothetical/idealized examples.
// See .superpowers/sdd/task-3-report.md for the full capture transcript and chat-integrity check.

const REAL_CHRONICLE_OUTPUT = `Mack's Phone

<div style="background-color: #1a1a1a; border: 1px solid #444; border-radius: 8px; padding: 16px; font-family: monospace; color: #f0f0f0; max-width: 600px; margin: auto;">
<div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 8px; margin-bottom: 12px; font-weight: bold; color: #66d9ef;">
<span>Mack's Phone</span>
<span>68% [//////&nbsp;&nbsp;&nbsp;]</span>
</div>

<div style="font-weight: bold; color: #a6e22e; text-transform: uppercase; text-align: center;">━━━━━━━━━【 ✧･ﾟ: *✧ WEYLAND ALERTS ✧*:･ﾟ✧ 】━━━━━━━━━</div>
<ul>
<li style="margin-bottom: 8px; line-height: 1.4;"><span style="color: #fd971f;">10:52 PM</span> — <span style="color: #f92672;">Weather Advisory</span>: Light rain expected after 2AM, clearing by morning. Temps dropping to low 50s overnight.</li>
<li style="margin-bottom: 8px; line-height: 1.4;"><span style="color: #fd971f;">9:15 PM</span> — <span style="color: #f92672;">Campus Notice</span>: Sterling Hall community kitchen closed for deep cleaning tomorrow 8AM-2PM. Plan meals accordingly.</li>
</ul>

<div style="font-weight: bold; color: #a6e22e; text-transform: uppercase; text-align: center;">━━━━━━━━━【 ✧･ﾟ: *✧ SOCIAL MEDIA ✧*:･ﾟ✧ 】━━━━━━━━━</div>
<ul>
<li style="margin-bottom: 8px; line-height: 1.4;">DISCORD: [<span style="color: #ae81ff;">@luckypaww</span>] in #announcements: "Someone please explain to me why the Rivera party subbot logic is spawning FOUR separate Reggie NPCs. One Reggie. There is only one Reggie. Purging the duplicates now, expect some flicker."</li>
<li style="margin-bottom: 8px; line-height: 1.4;">DISCORD: [<span style="color: #ae81ff;">@codewolf</span>] in #dorm-commons: "if mack doesn't come home tonight im telling the RA he died. saves me explaining the smell when he shows up hungover at 6am"</li>
<div style="border-left: 2px solid #66d9ef; padding-left: 8px; margin-top: 4px;">
<li style="margin-bottom: 8px; line-height: 1.4;"><span style="color: #ae81ff;">@breakingthecycle</span>: not my problem anymore lol</li>
<li style="margin-bottom: 8px; line-height: 1.4;"><span style="color: #ae81ff;">@codewolf</span>: nobody asked kai</li>
</div>
</ul>

<div style="font-weight: bold; color: #a6e22e; text-transform: uppercase; text-align: center;">━━━━━━━━━【 ✧･ﾟ: *✧ MESSAGES ✧*:･ﾟ✧ 】━━━━━━━━━</div>
<ul>
<li style="margin-bottom: 8px; line-height: 1.4;"><span style="color: #ae81ff;">Blake</span> <span style="color: #fd971f;">11:03 PM</span>: "someone sent me a video of a naked man doing a cannonball off rivera's diving board and I swear to god if that's you I'm changing the locks"</li>
<li style="margin-bottom: 8px; line-height: 1.4;"><span style="color: #ae81ff;">Vera</span> <span style="color: #fd971f;">10:41 PM</span>: "hey sooo this party sucks and I'm hiding in a bathroom rn can you come get me or is that weird lol no worries either way!! :)"</li>
<li style="margin-bottom: 8px; line-height: 1.4;"><span style="color: #ae81ff;">Sterling Hall Front Desk</span> <span style="color: #fd971f;">9:30 PM</span>: "Reminder: lost key replacement fee is $40, please stop by during office hours if applicable."</li>
</ul>
</div>`;

const REAL_TWITTER_OUTPUT = `<div style="background-color: #1a1a1a; border: 1px solid #444; border-radius: 8px; padding: 16px; font-family: monospace; color: #f0f0f0; max-width: 600px; margin: auto;">
<div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 8px; margin-bottom: 12px; font-weight: bold; color: #66d9ef;">
Mack's Phone
<span>34% [///       ]</span>
</div>

<div style="font-weight: bold; color: #a6e22e; text-transform: uppercase; text-align: center;">━━━━━━━━━【 ✧･ﾟ: *✧ WEYLAND ALERTS ✧*:･ﾟ✧ 】━━━━━━━━━</div>
<ul style="padding-left: 16px;">
<li style="margin-bottom: 8px; line-height: 1.4;"><span style="color: #f92672;">Weather Advisory</span> <span style="color: #fd971f;">[11:02 PM]</span> — Light rain expected overnight, clearing by mid-morning. Low near 51°F. Nothing that'll stop a party from happening in your backyard, apparently.</li>
<li style="margin-bottom: 8px; line-height: 1.4;"><span style="color: #f92672;">Noise Complaint Notice</span> <span style="color: #fd971f;">[10:48 PM]</span> — Campus Safety received 2 noise reports near off-campus student housing on Birchwood Ln. Officers advised to "assess before engaging" per new de-escalation policy.</li>
</ul>

<div style="font-weight: bold; color: #a6e22e; text-transform: uppercase; text-align: center;">━━━━━━━━━【 ✧･ﾟ: *✧ SOCIAL MEDIA ✧*:･ﾟ✧ 】━━━━━━━━━</div>
<ul style="padding-left: 16px;">
<li style="margin-bottom: 8px; line-height: 1.4;">[<span style="color: #ae81ff;">@luckypaww</span>] in #announcements: "hey uh, why does Bianca's photography feed suddenly have 40 unposted drafts of just... doorknobs. no context. investigating."</li>
<li style="margin-bottom: 8px; line-height: 1.4;">[<span style="color: #ae81ff;">@codewolf</span>] posted: "mack better not track pool water into our room tonight or I'm hiding his charger for a week 💀"</li>
<li style="margin-bottom: 8px; line-height: 1.4;">
[<span style="color: #ae81ff;">@breakingthecycle</span>]: "SOMEONE TELL ME WHY THERE'S A VIDEO OF A NAKED GUY WALKING THROUGH RIVERA'S LIVING ROOM ON MY TIMELINE"
<div style="border-left: 2px solid #66d9ef; padding-left: 8px; margin-top: 4px;">
[<span style="color: #ae81ff;">@luxuryiafford</span>]: "oh honey. oh honey no. don't click on that one."
</div>
</li>
</ul>

<div style="font-weight: bold; color: #a6e22e; text-transform: uppercase; text-align: center;">━━━━━━━━━【 ✧･ﾟ: *✧ MESSAGES ✧*:･ﾟ✧ 】━━━━━━━━━</div>
<ul style="padding-left: 16px;">
<li style="margin-bottom: 8px; line-height: 1.4;"><span style="color: #ae81ff;">Blake</span> <span style="color: #fd971f;">[11:05 PM]</span>: "if I see one single wet footprint on my side of the room tomorrow I'm telling everyone about the ladle incident"</li>
<li style="margin-bottom: 8px; line-height: 1.4;"><span style="color: #ae81ff;">Jenn</span> <span style="color: #fd971f;">[10:51 PM]</span>: "haven't seen u around in forever :( miss our mario kart nights lol"</li>
<li style="margin-bottom: 8px; line-height: 1.4;"><span style="color: #ae81ff;">Sterling Hall Front Desk</span> <span style="color: #fd971f;">[9:30 PM]</span>: "Reminder: quiet hours begin 12AM. Package pickup window extended to 10PM this week only."</li>
</ul>
</div>`;

const REAL_CONFESSIONS_OUTPUT = `<div style="background-color: #1a1a1a; border: 1px solid #444; border-radius: 8px; padding: 16px; font-family: monospace; color: #f0f0f0; max-width: 600px; margin: auto;">
<div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 8px; margin-bottom: 12px; font-weight: bold; color: #66d9ef;">
<span>Mack's Phone</span><span>34% [///       ]</span>
</div>

<div style="font-weight: bold; color: #a6e22e; text-transform: uppercase; text-align: center;">━━━━━━━━━【 ✧･ﾟ: *✧ WEYLAND ALERTS ✧*:･ﾟ✧ 】━━━━━━━━━</div>
<ul>
<li style="margin-bottom: 8px; line-height: 1.4;"><span style="color: #f92672;">Weather Advisory</span> <span style="color: #fd971f;">11:15 PM</span> — Light rain expected after 2AM, clearing by morning. Temps dropping to low 50s.</li>
<li style="margin-bottom: 8px; line-height: 1.4;"><span style="color: #f92672;">Campus Notice</span> <span style="color: #fd971f;">10:50 PM</span> — Noise complaints filed near Senaka Blvd residential zone. Weyland PD requests house parties keep volume down after midnight.</li>
</ul>

<div style="font-weight: bold; color: #a6e22e; text-transform: uppercase; text-align: center;">━━━━━━━━━【 ✧･ﾟ: *✧ SOCIAL MEDIA ✧*:･ﾟ✧ 】━━━━━━━━━</div>
<ul>
<li style="margin-bottom: 8px; line-height: 1.4;"><span style="color: #ae81ff;">[&lt;@luckypaww&gt;]</span> in #announcements: <span style="color: #fd971f;">11:02 PM</span> — "why does the Reggie subbot keep trying to diving-board off things that aren't diving boards. he tried to dive off a KEG. someone's getting a stern talking to."</li>
<li style="margin-bottom: 8px; line-height: 1.4;"><span style="color: #ae81ff;">[&lt;@codewolf&gt;]</span> in #dorm-commons: <span style="color: #fd971f;">10:58 PM</span> — "mack better come home with a good excuse tomorrow morning or im changing his door lock code out of spite"</li>
<li style="margin-bottom: 8px; line-height: 1.4;">
<span style="color: #ae81ff;">@QKittonMod</span>: "another dog breeding ground rager huh. real shocker"
<div style="border-left: 2px solid #66d9ef; padding-left: 8px; margin-top: 4px;">
<span style="color: #ae81ff;">@youwouldntgetit</span>: "kris i will drain every ounce of blood from your body and it will improve you"
</div>
</li>
</ul>

<div style="font-weight: bold; color: #a6e22e; text-transform: uppercase; text-align: center;">━━━━━━━━━【 ✧･ﾟ: *✧ MESSAGES ✧*:･ﾟ✧ 】━━━━━━━━━</div>
<ul>
<li style="margin-bottom: 8px; line-height: 1.4;"><span style="color: #ae81ff;">Blake</span> <span style="color: #fd971f;">11:04 PM</span> — "heard you're at rivera's. heard you're naked. heard reggie's shoes are in a pool. explain yourself when you get home shark boy"</li>
<li style="margin-bottom: 8px; line-height: 1.4;"><span style="color: #ae81ff;">Vera</span> <span style="color: #fd971f;">10:47 PM</span> — "hiii!! having a good night?? 💚 (mine's fine. totally fine. everyone here is SO fun to be around lol)"</li>
<li style="margin-bottom: 8px; line-height: 1.4;"><span style="color: #ae81ff;">Sterling Hall Front Desk</span> <span style="color: #fd971f;">10:30 PM</span> — "Reminder: quiet hours begin at 12AM. Guest check-in closes at 1AM sharp."</li>
</ul>
</div>`;

test('parsePhoneAppOutput extracts at least one section with a title from real captured Chronicle output', () => {
    const result = parsePhoneAppOutput(REAL_CHRONICLE_OUTPUT);
    assert.ok(result.sections.length > 0, 'expected at least one section to be extracted from real output');
    assert.ok(result.sections[0].title.length > 0);
});

test('parsePhoneAppOutput extracts multiple items within a section from real captured Chronicle output', () => {
    const result = parsePhoneAppOutput(REAL_CHRONICLE_OUTPUT);
    const totalItems = result.sections.reduce((sum, s) => sum + s.items.length, 0);
    assert.ok(totalItems > 1, 'expected more than one item across all sections');
});

test('parsePhoneAppOutput never includes the raw HTML style attributes in extracted item text (Chronicle)', () => {
    const result = parsePhoneAppOutput(REAL_CHRONICLE_OUTPUT);
    for (const section of result.sections) {
        for (const item of section.items) {
            assert.doesNotMatch(item.text, /style="/);
            assert.doesNotMatch(item.text, /<div/);
        }
    }
});

test('parsePhoneAppOutput extracts at least one section with a title from real captured Twitter output', () => {
    const result = parsePhoneAppOutput(REAL_TWITTER_OUTPUT);
    assert.ok(result.sections.length > 0, 'expected at least one section to be extracted from real output');
    assert.ok(result.sections[0].title.length > 0);
});

test('parsePhoneAppOutput extracts multiple items within a section from real captured Twitter output', () => {
    const result = parsePhoneAppOutput(REAL_TWITTER_OUTPUT);
    const totalItems = result.sections.reduce((sum, s) => sum + s.items.length, 0);
    assert.ok(totalItems > 1, 'expected more than one item across all sections');
});

test('parsePhoneAppOutput never includes the raw HTML style attributes in extracted item text (Twitter)', () => {
    const result = parsePhoneAppOutput(REAL_TWITTER_OUTPUT);
    for (const section of result.sections) {
        for (const item of section.items) {
            assert.doesNotMatch(item.text, /style="/);
            assert.doesNotMatch(item.text, /<div/);
        }
    }
});

test('parsePhoneAppOutput extracts at least one section with a title from real captured Confessions output', () => {
    const result = parsePhoneAppOutput(REAL_CONFESSIONS_OUTPUT);
    assert.ok(result.sections.length > 0, 'expected at least one section to be extracted from real output');
    assert.ok(result.sections[0].title.length > 0);
});

test('parsePhoneAppOutput extracts multiple items within a section from real captured Confessions output', () => {
    const result = parsePhoneAppOutput(REAL_CONFESSIONS_OUTPUT);
    const totalItems = result.sections.reduce((sum, s) => sum + s.items.length, 0);
    assert.ok(totalItems > 1, 'expected more than one item across all sections');
});

test('parsePhoneAppOutput never includes the raw HTML style attributes in extracted item text (Confessions)', () => {
    const result = parsePhoneAppOutput(REAL_CONFESSIONS_OUTPUT);
    for (const section of result.sections) {
        for (const item of section.items) {
            assert.doesNotMatch(item.text, /style="/);
            assert.doesNotMatch(item.text, /<div/);
        }
    }
});

test('parsePhoneAppOutput real captured output section titles match what the model actually produced', () => {
    // Sanity-check against the real observed section names so a future regex change that silently
    // stops matching the model's actual divider format gets caught here, not just via a generic
    // 'length > 0' assertion.
    const chronicle = parsePhoneAppOutput(REAL_CHRONICLE_OUTPUT);
    const titles = chronicle.sections.map(s => s.title);
    assert.deepEqual(titles, ['WEYLAND ALERTS', 'SOCIAL MEDIA', 'MESSAGES']);
});

test('parsePhoneAppOutput returns an empty sections array for empty input', () => {
    assert.deepEqual(parsePhoneAppOutput(''), { sections: [] });
});

test('parsePhoneAppOutput returns an empty sections array (never throws) for garbage input', () => {
    assert.deepEqual(parsePhoneAppOutput('not html at all, just plain text with no structure'), { sections: [] });
});

test('parsePhoneAppOutput returns an empty sections array (never throws) for non-string input', () => {
    assert.deepEqual(parsePhoneAppOutput(null), { sections: [] });
    assert.deepEqual(parsePhoneAppOutput(undefined), { sections: [] });
});
