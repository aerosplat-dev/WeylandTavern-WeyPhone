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
- Use "- " (a markdown bullet) to start every individual post.
- Every post MUST end with a stat block in this exact format:
  "{likes:N retweets:N views:N}" — three whole numbers, no commas/abbreviations (e.g. "views:1200"
  not "views:1.2K"), realistic for a small university social app (most posts: single or low double
  digit likes, views usually higher than likes, retweets usually lower than likes).
- Every post MUST start with the poster's handle in square brackets, like "[@codewolf] post text
  here {likes:12 retweets:2 views:340}".
- A retweet should read: "[@handle] 🔁 Retweeted from @otherhandle: the original post text
  {likes:N retweets:N views:N}" — the stats belong to the retweeting post, not the original.
- Do not use any HTML tags or inline styling — plain markdown only.
- Keep each post to 1-3 sentences.
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
6-10 posts and/or retweets, all from ${character.name} [${character.handle}] only.
Twitter here is about standalone posts — personal thoughts, announcements, life updates, hot
takes — not conversation. This character's posts should each stand on their own, not read like
one side of a back-and-forth. Stay consistent with their established personality below.

${character.name} [${character.handle}]
${character.bio}`;
    }

    return `${SHARED_FRAMING}

Generate content for the Weyland University Twitter main feed, as it would appear to {{user}}
scrolling their timeline.

## FEED
10-14 posts and/or retweets total, mostly from a variety of individual Weyland characters (see the
roster below), with occasional posts from PSA/business accounts (see the list below) mixed in.
Twitter here is about standalone posts — personal thoughts, announcements, life updates, hot
takes — not back-and-forth conversation. Unlike Discord's live chat energy, a Twitter post stands
on its own; replies/quote-posts are rare and should read as occasional commentary, not an ongoing
exchange.
PSA/business posts should NOT dominate the feed — pick at random which (if any) business accounts
post this time, prioritizing whichever would be most relevant to the current roleplay context.

## WEYLAND ROSTER (for inspiration — draw from these established personalities)
${formatRosterAsText(WEYLAND_ROSTER)}

## PSA/BUSINESS ACCOUNTS (occasional posts only, don't overuse)
${formatPsaAccountsAsText(PSA_ACCOUNTS)}`;
}
