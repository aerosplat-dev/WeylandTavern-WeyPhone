// Title tokens stripped from a full name before matching — "Dr", "Mr", "Mrs", "Ms" are the only
// ones confirmed present in real cast.weybooru.com data as of this milestone; add more here if a
// future cast entry introduces one this list doesn't cover (a missed title just becomes an extra,
// harmless token that fails to match anything, degrading gracefully rather than crashing).
const TITLE_TOKENS = new Set(['dr', 'mr', 'mrs', 'ms', 'prof', 'professor']);

/**
 * Splits a full name (as given by cast.weybooru.com) into name tokens for lorebook-title
 * matching: splits on runs of whitespace and/or periods, strips any leading/trailing punctuation
 * from each token, and drops known title tokens (case-insensitively). Confirmed against real
 * data: "Sayori Akiyama" -> ["Sayori", "Akiyama"], "Mr. Wolfy" -> ["Wolfy"], "Kressa" -> ["Kressa"].
 * @param {string} fullName
 * @returns {string[]}
 */
export function splitFullName(fullName) {
    return fullName
        .split(/[\s.]+/)
        .map(token => token.replace(/^[.,]+|[.,]+$/g, ''))
        .filter(token => token.length > 0 && !TITLE_TOKENS.has(token.toLowerCase()));
}

// Matches content that is PURELY a {{getvar::X}} macro (optionally surrounded by whitespace) —
// nothing else. This is the exact signal that separates a real subbot-pointer lorebook entry
// (e.g. "Belle" -> "{{getvar::BE}}") from a location/lore entry that merely mentions a name inside
// its body text (e.g. "Red Lantern Ramen" mentioning "Mr. Wolfy").
const PURE_MACRO_RE = /^\{\{getvar::([^}]+)\}\}$/;

/**
 * @param {string | undefined} content
 * @returns {string | null} the macro key (e.g. "BE"), or null if content isn't purely a getvar macro.
 */
export function extractMacroKey(content) {
    if (typeof content !== 'string') return null;
    const match = content.trim().match(PURE_MACRO_RE);
    return match ? match[1] : null;
}

/**
 * Tries each of the first two name tokens (first name, then last name) in order, substring-
 * matching (case-insensitive) against every lorebook entry's TITLE ONLY — never its content, so a
 * name that merely appears inside some unrelated entry's body text (e.g. "Wolfy" inside "Red
 * Lantern Ramen") is never mistaken for a match. Stops at the first token that produces EXACTLY
 * ONE title match whose content is a pure {{getvar::X}} macro; an ambiguous (multiple-title-match)
 * or non-pure-macro result is treated as "try the next token", not an error.
 *
 * Disambiguates a multi-title-match token by preferring an entry whose title EQUALS the token
 * exactly, over one that merely contains it — e.g. "Belle" (BE) over "Belle & Dash Room", even
 * though the latter's content is ALSO a pure getvar macro ({{getvar::BlakeRoom}}-style companion
 * entries are common and real, so filtering by content alone isn't sufficient to disambiguate).
 *
 * KNOWN LATENT PITFALL (not currently triggered by any real character, confirmed live): this
 * exact-match rule only helps when the real entry's title equals the bare token. A character
 * matched via the LAST-NAME fallback whose real entry title is NOT just their last name (e.g.
 * "Professor Akiyama" resolving via the token "akiyama", her weybooru full name being "Sayori
 * Akiyama") only works today because no OTHER entry also contains "akiyama" in its title. If a
 * second such entry were ever added (e.g. a hypothetical "Professor Akiyama's Apartment"), BOTH
 * would fail the bare-token exact-match check equally (neither literally equals "akiyama"), and
 * this function would report ambiguous/no-match for her even if only one of the two actually had
 * real subbot content. Content-based filtering alone doesn't fix this either (see the Blake/room
 * case above) — a real fix would need a smarter tie-break (e.g. preferring the shortest title, or
 * requiring the token to match a whole word AND be the entry's own primary subject). Not fixed
 * here since no real character currently exercises it — flagged for whoever adds the next
 * lorebook entry that happens to collide with an existing character's last-name token.
 * @param {string[]} nameTokens output of splitFullName, in original order
 * @param {Array<{comment?: string, content?: string}>} entries a lorebook's entries (e.g.
 *   Object.values(context.loadWorldInfo('Weyland').entries))
 * @returns {{entryName: string, macroKey: string} | null}
 */
export function findEntryTitleMatch(nameTokens, entries) {
    for (const token of nameTokens.slice(0, 2)) {
        const lowerToken = token.toLowerCase();
        const substringMatches = entries.filter(entry => typeof entry.comment === 'string' && entry.comment.toLowerCase().includes(lowerToken));
        // Prefer an EXACT (whole-title, case-insensitive) match over an ambiguous substring match
        // — confirmed live against real production data that most full-bot characters have
        // companion lorebook entries sharing their name as a substring (e.g. "Belle" the real
        // subbot-pointer entry vs. "Belle & Dash Room", an unrelated location entry that merely
        // mentions her name), which used to make ANY multi-substring-match token get rejected as
        // ambiguous even though exactly one of the matches was the real, exact-title entry.
        const exactMatches = substringMatches.filter(entry => entry.comment.toLowerCase() === lowerToken);
        const candidates = exactMatches.length === 1 ? exactMatches : (substringMatches.length === 1 ? substringMatches : []);
        if (candidates.length !== 1) continue;
        const macroKey = extractMacroKey(candidates[0].content);
        if (macroKey) return { entryName: candidates[0].comment, macroKey };
    }
    return null;
}

/**
 * Builds the complete, dynamically-discovered subbot/full-bot contact roster for a session by
 * cross-referencing cast.weybooru.com's live character catalog against the Weyland lorebook and
 * charPer.js. Runs once per browser session (see index.js's init wiring) — this function itself
 * does no I/O, taking already-fetched data so it stays unit-testable.
 *
 * `manualFullBotOnlyNames` covers characters explicitly tagged "No Subbot" in weybooru's data (so
 * they're never discovered via the normal cross-reference loop below) but who still have a real
 * full-bot (charPer.js) and are wanted as ordinary solo-conversation contacts — confirmed real
 * cases: Loona, Kressa. These get a manufactured entry with `macroKey: null, hasSubbot: false`
 * (skipping lorebook lookup entirely, since there's no subbot content to find), so the UI can grey
 * them out specifically in Group Chat selection mode while they behave completely normally for a
 * 1-on-1 thread. Aethel is deliberately NOT in this list — excluded per explicit direction, reserved
 * for a different, unrelated use elsewhere in the platform.
 * @param {{
 *   weybooruCharacters: Record<string, {bot?: string}>,
 *   weylandEntries: Array<{comment?: string, content?: string}>,
 *   charPerKeys: string[],
 *   excludedEntryNames?: string[],
 *   manualFullBotOnlyNames?: string[],
 * }} options
 * @returns {Array<{fullName: string, entryName: string, macroKey: string | null, hasFullBot: boolean, hasSubbot: boolean, portraitFirstName: string}>}
 */
export function buildCastRoster({ weybooruCharacters, weylandEntries, charPerKeys, excludedEntryNames = [], manualFullBotOnlyNames = [] }) {
    const charPerKeySet = new Set(charPerKeys);
    const excludedSet = new Set(excludedEntryNames);
    const roster = [];
    for (const [fullName, data] of Object.entries(weybooruCharacters)) {
        if (typeof data.bot === 'string' && data.bot.includes('No Subbot')) continue;
        const tokens = splitFullName(fullName);
        if (tokens.length === 0) continue;
        const match = findEntryTitleMatch(tokens, weylandEntries);
        if (!match) continue;
        if (excludedSet.has(match.entryName)) continue;
        roster.push({
            fullName,
            entryName: match.entryName,
            macroKey: match.macroKey,
            hasFullBot: charPerKeySet.has(match.entryName),
            hasSubbot: true,
            portraitFirstName: tokens[0].toLowerCase(),
        });
    }
    for (const name of manualFullBotOnlyNames) {
        if (excludedSet.has(name)) continue;
        const tokens = splitFullName(name);
        if (tokens.length === 0) continue;
        roster.push({
            fullName: name,
            entryName: name,
            macroKey: null,
            hasFullBot: charPerKeySet.has(name),
            hasSubbot: false,
            portraitFirstName: tokens[0].toLowerCase(),
        });
    }
    return roster;
}
