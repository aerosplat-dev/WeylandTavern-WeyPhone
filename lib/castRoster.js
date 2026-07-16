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
 * @param {string[]} nameTokens output of splitFullName, in original order
 * @param {Array<{comment?: string, content?: string}>} entries a lorebook's entries (e.g.
 *   Object.values(context.loadWorldInfo('Weyland').entries))
 * @returns {{entryName: string, macroKey: string} | null}
 */
export function findEntryTitleMatch(nameTokens, entries) {
    for (const token of nameTokens.slice(0, 2)) {
        const lowerToken = token.toLowerCase();
        const matches = entries.filter(entry => typeof entry.comment === 'string' && entry.comment.toLowerCase().includes(lowerToken));
        if (matches.length !== 1) continue;
        const macroKey = extractMacroKey(matches[0].content);
        if (macroKey) return { entryName: matches[0].comment, macroKey };
    }
    return null;
}
