// lib/phoneAppPrompts.js

// Shared by all three apps — establishes this as a special, one-off generation distinct from a
// normal roleplay turn, and states WeyPhone's own markdown formatting convention (not the real
// platform !Phone command's HTML template — models follow markdown far more reliably, and it maps
// directly onto this codebase's own { sections: [{ title, items }] } parser contract).
const SHARED_FRAMING = `[SPECIAL GENERATION — WEYPHONE APP CONTENT]
This is not a normal roleplay reply. {{user}} is checking an app on their phone, and you are
generating realistic app content for the world of Weyland University — not speaking as any
character, and not continuing the current scene. Do not break the fourth wall, do not mention this
is a generation request, and do not include any narration, character dialogue tags, or in-scene
framing — just the app content itself.

FORMATTING (follow this exactly, it will be parsed automatically):
- Use "## SECTION NAME" (a markdown h2) for each section header, in ALL CAPS.
- Use "- " (a markdown bullet) to start every individual item/post/headline.
- If an item has a specific time, put it in square brackets at the very start of the bullet, like
  "- [10:52 PM] the rest of the item text here".
- Do not use any HTML tags, inline styling, or decorative characters/borders around section
  headers — plain markdown only.
- Keep each item to 1-3 sentences.
[END SPECIAL GENERATION FRAMING]`;

export const PHONE_APP_PROMPTS = {
    chronicle: `${SHARED_FRAMING}

Generate content for "The Weyland Chronicle," the university's student newspaper app.

## WEYLAND ALERTS
A short section (2-3 items) of practical campus alerts — weather, a maintenance notice, an event
reminder. Same spirit as a real campus alert system: brief, informative, not dramatic.

## HEADLINES
6-8 news headlines for the city of Weyland broadly — not just campus/student life, but the wider
city: local business openings/closings, city council happenings, weather-related city news, minor
local crime blotter items, community events, human-interest pieces. Vary the tone — some mundane,
some quirky, a couple with real local color. These should read like real small-city newspaper
headlines with a one-sentence summary each, not campus gossip.`,

    discord: `${SHARED_FRAMING}

Generate content for the Weyland Tavern Discord server, as it would appear to {{user}} scrolling
through their notifications.

## DISCORD
8-10 messages total, spread across channels like #announcements, #dorm-commons, #weyland-sports,
and 1-2 other channels you invent that fit campus life. Include 1-2 messages specifically from
@luckypaww — he's the Discord server's owner, posts 4th-wall-breaking meta commentary about
running/maintaining "Weyland Tavern" and its characters/subbots, usually complaining about
something breaking or fixing something in a comedic way, and hates getting DMs because he's always
busy. The remaining messages should be a mix of named Weyland characters and generic
students/staff, written in-character where a named character is involved. Keep the @luckypaww
posts distinctly meta/self-aware compared to everything else, which should read as normal in-world
chatter.`,

    yikyak: `${SHARED_FRAMING}

Generate content for "Yik Yak," an anonymous, hyperlocal social app popular at Weyland University.
Posts are anonymous (no usernames, just the post itself, optionally a vote count like "+47" at the
end) and hyperlocal to campus.

## YIK YAK
8-10 anonymous posts in the spirit of an anonymous local community board — missed connections,
rants and raves, lost & found, roommate drama, campus gossip, hookup-culture chatter. Unlike
Discord (which is semi-public and tied to real identities), Yik Yak's whole appeal is that people
say things here they wouldn't say with their name attached — lean into that: posts can be
noticeably more scandalous, gossipy, horny, petty, or inappropriate than what would ever get
posted on Discord under a real username. Keep it anonymous-board energy, not named-character
dialogue.`,
};
