// lib/phoneAppPrompts.js

import { WEYLAND_ROSTER, formatRosterAsText } from './weylandRoster.js';
import { SHARED_FRAMING_PREAMBLE } from './sharedPromptFraming.js';

// This app's own formatting rules, appended to the shared preamble — maps directly onto this
// codebase's own { sections: [{ title, items }] } parser contract.
const SHARED_FRAMING = `${SHARED_FRAMING_PREAMBLE}
- Use "- " (a markdown bullet) to start every individual item/post/headline.
- If an item has a specific time, put it in square brackets at the very start of the bullet, like
  "- [10:52 PM] the rest of the item text here".
- Do not use any HTML tags, inline styling, or decorative characters/borders around section
  headers — plain markdown only.
- Keep each item to 1-3 sentences.
[END SPECIAL GENERATION FRAMING]`;

// Verbatim roster text supplied by the human operator, copy-pasted directly from the real
// !Phone command's own resolved prompt content ({{getvar::PhoneCom}}). Interpolated into BOTH
// the discord and yikyak prompts below (Task 9) so SillyTavern's real World Info scan — which
// now also scans this app's own prompt text, not just chat history, see index.js's
// resolveWorldInfoTetheredForMainChat — has a chance to match established roster characters'
// real WI entries even when they weren't recently active in the visible chat. Left as literal
// {{user}}/{{getvar::MCY-2}} macro tokens intentionally: this codebase's existing
// applyMacroSubstitution mechanism resolves them at send time. Now sourced from the structured
// WEYLAND_ROSTER data in lib/weylandRoster.js (Task 1 refactor) and reconstituted back into the
// original flat-text block via formatRosterAsText() — byte-identical to the original constant.

// Small operator-supplied keyword list of real Weyland locations/themes — interpolated only into
// the chronicle prompt (Task 9), for the same WI-scan-grounding reason as WEYLAND_ROSTER above.
// Deliberately NOT interpolated into discord/yikyak (roster-grounding is scoped to those two
// only), and WEYLAND_ROSTER is deliberately NOT interpolated into chronicle.
const WEYLAND_LOCATIONS = 'Weyland City, lecture halls, workshop, research, observatory, dorms, Senaka, Sakurai, Black Barrel Bar, Rustwood Cafe, Mama\'s Den, Exchange, Kodo Bowl, Kyomi, Brodlak, Tetsuya, Red Lantern, 7-Eleven, Somnia, Soft Pike, Moonvale, religion, kemeticism, seishism';

export const PHONE_APP_PROMPTS = {
    chronicle: `${SHARED_FRAMING}

Generate content for "The Weyland Chronicle," the university's student newspaper app.

## WEYLAND ALERTS
A short section ({{random::1::2::3}} items) of practical campus alerts — weather, a maintenance
notice, an event reminder. Same spirit as a real campus alert system: brief, informative, not
dramatic. Every alert MUST start with the clock time it was posted, in brackets, exactly like
"[9:14 AM]" or "[4:45 PM]" — the same convention as every other timestamped item in this app. Do
NOT use a day name, a date, or a relative day reference (e.g. "[Monday]", "[This weekend]") as the
bracketed timestamp — a day/date can still appear later in the alert's own sentence (e.g. "through
Sunday"), just never as the bracketed marker itself.

## HEADLINES
6-8 news headlines for the city of Weyland broadly — not just campus/student life, but the wider
city: local business openings/closings, city council happenings, weather-related city news, minor
local crime blotter items, community events, human-interest pieces. Vary the tone — some mundane,
some quirky, a couple with real local color. Format each item as a short, punchy bolded headline
(3-8 words, like a real newspaper headline) followed by a one-sentence summary with the actual
detail — for example: "- **City Council Approves Waterfront Rezoning** After a three-hour session
Tuesday, the council cleared the way for a mixed-use development that has divided residents for
over a year." Not campus gossip.

When mentioning specific places, prefer real Weyland locations and themes such as: ${WEYLAND_LOCATIONS}.`,

    discord: `${SHARED_FRAMING}

Generate content for the Weyland Tavern Discord server, as it would appear to {{user}} scrolling
through their notifications.

FORMAT — this OVERRIDES the generic "## SECTION NAME" instruction above for this app specifically:
do NOT put every message under one shared "## DISCORD" header. Instead, use EACH CHANNEL NAME as
its own markdown h2 header, in lowercase with the "#", exactly like "## #announcements", and list
that channel's messages as bullets underneath it before starting the next channel's "## #channel"
header. Format every message bullet exactly like "- [10:52 PM] **@handle** — message text" (a
timestamp, then the bolded @handle, then an em dash, then the message). Do not describe which
channel a message is in inside the message text itself (e.g. do not write "in #channel:") — the
channel is already established by which "## #channel" header the message sits under.

8-10 messages total, spread across channels like #announcements, #dorm-commons, #weyland-sports,
and 1-2 other channels you invent that fit campus life.
Discord here is about live back-and-forth — replies, quick reactions, an ongoing conversation
across a channel — not standalone announcements. Include at least 1-2 short reply exchanges (2-3
messages responding to each other) so it reads like a real live chat, not a list of unrelated posts.
Avoid anonymous-sounding confessions, rants, or gossip about someone without naming them — every
message here is tied to a real name. Also avoid single standalone personal-life announcements or
opinion posts with no reply or reaction attached — everything here is part of a back-and-forth,
not a broadcast.
Include 1-2 messages specifically from
@luckypaww — he's the Discord server's owner, posts 4th-wall-breaking meta commentary about
running/maintaining "Weyland Tavern" and its characters/subbots, usually complaining about
something breaking or fixing something in a comedic way, and hates getting DMs because he's always
busy. The remaining messages should be a mix of named Weyland characters and generic
students/staff, written in-character where a named character is involved. Keep the @luckypaww
posts distinctly meta/self-aware compared to everything else, which should read as normal in-world
chatter.

## WEYLAND ROSTER (for inspiration — draw from these established personalities when a post is plausibly from one of them)
${formatRosterAsText(WEYLAND_ROSTER)}`,

    yikyak: `${SHARED_FRAMING}

Generate content for "Yik Yak," an anonymous, hyperlocal social app popular at Weyland University.
Posts are anonymous (no usernames, just the post itself, optionally a vote count like "+47" at the
end) and hyperlocal to campus.

## YIK YAK
8-10 anonymous posts in the spirit of an anonymous local community board — missed connections,
rants and raves, lost & found, roommate drama, campus gossip, hookup-culture chatter. Unlike a
semi-public channel where every message is tied to a real, named identity, Yik Yak's whole appeal
is that people say things here they wouldn't say with their name attached — lean into that: posts
can be noticeably more scandalous, gossipy, horny, petty, or inappropriate than something posted
under a real name. Keep it anonymous-board energy, not named-character dialogue. Posts are
anonymous, but content can still be written in a way that's recognizably consistent with one of the
roster personalities above, for a reader who knows them well — this is a fun, intentional "guess
who posted this" element. Don't literally name the poster.
Avoid writing this like an organized back-and-forth conversation between named people across
different topic channels, and avoid a public personal update/announcement with an attached
name — this is one anonymous voice per post, not a structured exchange or a personal broadcast.

## WEYLAND ROSTER (for inspiration — draw from these established personalities when a post is plausibly from one of them)
${formatRosterAsText(WEYLAND_ROSTER)}`,
};
