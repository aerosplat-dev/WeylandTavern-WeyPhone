// lib/twitterPrompts.js

import { WEYLAND_ROSTER, formatRosterAsText, formatNameHandle } from './weylandRoster.js';
import { SHARED_FRAMING_PREAMBLE } from './sharedPromptFraming.js';

// Twitter's own formatting rules, appended to the shared preamble.
const SHARED_FRAMING = `${SHARED_FRAMING_PREAMBLE}
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
    return accounts.map(formatNameHandle).join('\n');
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
one side of a back-and-forth. Avoid writing these like a live group-chat reply thread, and avoid
an anonymous-sounding confession or explicit rant — these are public posts under
${character.name}'s own name, so keep them a personal broadcast, not a conversation or an
anonymous vent. Stay consistent with their established personality below.

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
takes — not back-and-forth conversation. A Twitter post stands on its own rather than being part
of a live chat exchange; replies/quote-posts are rare and should read as occasional commentary, not
an ongoing back-and-forth. Avoid writing these like a live group-chat reply thread, and avoid an
anonymous-sounding confession or explicit rant — these are public posts under the poster's own
name, so keep them a personal broadcast, not a conversation or an anonymous vent.
PSA/business posts should NOT dominate the feed — pick at random which (if any) business accounts
post this time, prioritizing whichever would be most relevant to the current roleplay context.

## WEYLAND ROSTER (for inspiration — draw from these established personalities)
${formatRosterAsText(WEYLAND_ROSTER)}

## PSA/BUSINESS ACCOUNTS (occasional posts only, don't overuse)
${formatPsaAccountsAsText(PSA_ACCOUNTS)}`;
}
