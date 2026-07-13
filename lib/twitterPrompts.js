// lib/twitterPrompts.js

import { WEYLAND_ROSTER, formatRosterAsText } from './weylandRoster.js';

// Same "special generation" framing convention as lib/phoneAppPrompts.js's SHARED_FRAMING —
// duplicated rather than imported since Twitter's own prompt structure diverges enough (dynamic,
// not a fixed string) that sharing the constant would need its own plumbing for little benefit.
const SHARED_FRAMING = `[SPECIAL GENERATION — WEYPHONE APP CONTENT]
This is not a normal roleplay reply. {{user}} is checking an app on their phone, and you are
generating realistic app content for the world of Weyland University — not speaking as any
character, and not continuing the current scene. Do not break the fourth wall, do not mention this
is a generation request, and do not include any narration, character dialogue tags, or in-scene
framing — just the app content itself.

FORMATTING (follow this exactly, it will be parsed automatically):
- Use "## SECTION NAME" (a markdown h2) for each section header, in ALL CAPS.
- Use "- " (a markdown bullet) to start every individual item/post/tweet.
- If an item has a specific time, put it in square brackets at the very start of the bullet, like
  "- [10:52 PM] the rest of the item text here".
- Do not use any HTML tags, inline styling, or decorative characters/borders around section
  headers — plain markdown only.
- Keep each item to 1-3 sentences.
[END SPECIAL GENERATION FRAMING]`;

/**
 * PSA/business accounts that post to the Twitter main feed but are NOT characters — no Following
 * entry, no profile page, no weybooru portrait lookup (they get the existing initials-in-circle
 * fallback avatar treatment in the UI). Explicitly excludes Red Lantern, Black Barrel, and Mama's
 * Den — not businesses that would have an online presence, per the operator's own direction.
 * @type {Array<{name: string, handle: string}>}
 */
export const PSA_ACCOUNTS = [
    { name: 'Weyland Alert', handle: '@WeylandAlert' },
    { name: 'WeylandU', handle: '@WeylandU' },
    { name: 'Sakurai Cafe', handle: '@SakuraiCafe' },
    { name: 'Rustwood Cafe', handle: '@RustwoodCafe' },
    { name: 'Tetsuya Market', handle: '@TetsuyaMarket' },
    { name: 'Somnia', handle: '@Somnia' },
    { name: 'Exchange', handle: '@ExchangeWeyland' },
    { name: 'Kodo Bowl', handle: '@KodoBowl' },
];

function formatPsaAccountsAsText(accounts) {
    return accounts.map(a => `${a.name} [${a.handle}]`).join('\n');
}

/**
 * @param {{mode: 'feed'} | {mode: 'profile', character: {name: string, handle: string, bio: string}}} options
 * @returns {string}
 */
export function buildTwitterPrompt(options) {
    if (options.mode === 'profile') {
        const { character } = options;
        return `${SHARED_FRAMING}

Generate content for "${character.name}"'s [${character.handle}] Twitter profile — a scrollable
list of ONLY this one person's own tweets and retweets. Do not generate posts from anyone else.

## POSTS
6-10 posts and/or retweets, all from ${character.name} [${character.handle}] only. Retweets are
acceptable and should read naturally, e.g. "🔁 Retweeted from @someoneelse: <the retweeted text>" —
just plain post text, no special formatting needed. Stay consistent with their established
personality below.

${character.name} [${character.handle}]
${character.bio}`;
    }

    return `${SHARED_FRAMING}

Generate content for the Weyland University Twitter main feed, as it would appear to {{user}}
scrolling their timeline.

## FEED
10-14 posts and/or retweets total, mostly from a variety of individual Weyland characters (see the
roster below), with occasional posts from PSA/business accounts (see the list below) mixed in.
PSA/business posts should NOT dominate the feed — pick at random which (if any) business accounts
post this time, prioritizing whichever would be most relevant to the current roleplay context.
Retweets are acceptable and should read naturally, e.g. "🔁 Retweeted from @someoneelse: <the
retweeted text>" — just plain post text, no special formatting needed.

## WEYLAND ROSTER (for inspiration — draw from these established personalities)
${formatRosterAsText(WEYLAND_ROSTER)}

## PSA/BUSINESS ACCOUNTS (occasional posts only, don't overuse)
${formatPsaAccountsAsText(PSA_ACCOUNTS)}`;
}
