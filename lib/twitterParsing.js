// lib/twitterParsing.js

// Matches "[@handle] rest of the post {likes:N retweets:N views:N}" — the exact format Twitter's
// own prompts (lib/twitterPrompts.js) instruct the model to produce. Every post line also starts
// with a markdown "- " bullet per that same prompt, so an optional leading "- " is tolerated here.
// Never throws; unparseable lines are simply skipped (degrade gracefully, matching this
// codebase's convention elsewhere).
const POST_LINE_RE = /^-?\s*\[(@[\w.]+)\]\s+(.*?)\s*\{likes:(\d+)\s+retweets:(\d+)\s+views:(\d+)\}\s*$/;
const RETWEET_RE = /^🔁\s*Retweeted from\s+(@[\w.]+):\s*(.*)$/;

/**
 * Resolves a display name for a handle: a real roster character's real name, a PSA/business
 * account's real name, or (if the model invented a handle not in either list) the handle text
 * itself with the leading "@" stripped — a graceful fallback, not an error.
 * @param {string} handle
 * @param {Array<{name: string, handle: string}>} roster
 * @param {Array<{name: string, handle: string}>} psaAccounts
 * @returns {string}
 */
function resolveAuthorName(handle, roster, psaAccounts) {
    const rosterMatch = roster.find(c => c.handle === handle);
    if (rosterMatch) return rosterMatch.name;
    const psaMatch = psaAccounts.find(a => a.handle === handle);
    if (psaMatch) return psaMatch.name;
    return handle.replace(/^@/, '');
}

/**
 * Parses WeyPhone's own Twitter markdown output (see lib/twitterPrompts.js for the format this is
 * built against) into a structured `{ posts }` shape for the Twitter feed/profile UI to render.
 * Degrades gracefully rather than throwing on unparseable/empty input — unrecognized lines are
 * simply skipped, matching this codebase's convention elsewhere (see lib/phoneAppFormatting.js).
 * @param {string} rawText
 * @param {{roster: Array<{name: string, handle: string}>, psaAccounts: Array<{name: string, handle: string}>}} options
 * @returns {{posts: Array<{authorName: string, handle: string, text: string, likes: number, retweets: number, views: number, isRetweet: boolean, retweetedFrom?: string, retweetedText?: string}>}}
 */
export function parseTwitterPosts(rawText, { roster, psaAccounts }) {
    if (!rawText || typeof rawText !== 'string') return { posts: [] };

    try {
        const posts = [];
        for (const line of rawText.split('\n')) {
            const match = line.match(POST_LINE_RE);
            if (!match) continue;
            const [, handle, bodyText, likes, retweets, views] = match;
            if (!bodyText) continue;

            const retweetMatch = bodyText.match(RETWEET_RE);
            const post = {
                authorName: resolveAuthorName(handle, roster, psaAccounts),
                handle,
                likes: Number(likes),
                retweets: Number(retweets),
                views: Number(views),
                isRetweet: !!retweetMatch,
            };
            if (retweetMatch) {
                post.retweetedFrom = retweetMatch[1];
                post.retweetedText = retweetMatch[2];
                post.text = '';
            } else {
                post.text = bodyText;
            }
            posts.push(post);
        }
        return { posts };
    } catch {
        return { posts: [] };
    }
}
