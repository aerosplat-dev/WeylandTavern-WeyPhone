// lib/hijackParsing.js

/**
 * @typedef {{ direction: 'Incoming' | 'Outgoing', sender: string, text: string }} ScopeLine
 * @typedef {{ owner: string | null, title: string | null, lines: ScopeLine[], lineIndices: number[] }} Scope
 */

// A phone line is `<Direction>¦<Time>¦<Name>¦<Text>`: exactly three delimiters, four fields.
// `[^¦|│]*` for the first three fields forbids a delimiter inside them so a partial/malformed line
// (missing the final ¦text) never matches. Group 1 = direction, 2 = time (unused), 3 = sender,
// 4 = text (may be empty). Delimiter class: ¦ (U+00A6), ASCII |, │ (U+2502).
const PHONE_LINE_RE = /^(Incoming|Outgoing)[¦|│]([^¦|│]*)[¦|│]([^¦|│]*)[¦|│](.*)$/;
const PHONE_HEADER_RE = /^Phone[¦|│]/;
const TEXTING_HEADER_RE = /^Texting[¦|│]/;

/**
 * Extracts the owner NAME from a `Phone¦<carrier>¦<battery>%` line. Per the wire grammar the
 * carrier field is `Weynet - <owner>`; the owner is the text after the ` - ` separator. A
 * carrier-only field (`Weynet`, no separator) has no owner name and returns null — this preserves
 * the shipped feature's implicit-USER default for a bare `Phone¦Weynet¦82%` header (a spec gap: the
 * perspective tree only addresses "no Phone line", never a carrier-only Phone line).
 * @param {string} line
 * @returns {string | null}
 */
function parsePhoneOwner(line) {
    const match = line.match(/^Phone[¦|│]([^¦|│]*)/);
    if (!match) return null;
    const parts = match[1].split(/\s+-\s+/);
    if (parts.length < 2) return null;
    const owner = parts.slice(1).join(' - ').trim();
    return owner || null;
}

/**
 * @param {string} line
 * @returns {string | null} the title text from a `Texting¦<title>` line, or null if blank.
 */
function parseTextingTitle(line) {
    const match = line.match(/^Texting[¦|│](.*)$/);
    if (!match) return null;
    const title = match[1].trim();
    return title || null;
}

/**
 * @param {string} line
 * @returns {ScopeLine | null}
 */
function parseScopeLine(line) {
    const match = line.match(PHONE_LINE_RE);
    if (!match) return null;
    return { direction: match[1], sender: match[3].trim(), text: match[4].trim() };
}

/**
 * True when two freeform name strings refer to the same name — case-insensitive, trimmed, and
 * tolerant of decoration on either side (`"Blake"` vs `"Blake 🐺"`), used ONLY to decide whether an
 * Outgoing sender contradicts a scope's established owner. Pure string comparison, no roster.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function sameName(a, b) {
    const x = String(a).trim().toLowerCase();
    const y = String(b).trim().toLowerCase();
    if (!x || !y) return false;
    return x.includes(y) || y.includes(x);
}

/**
 * Scans a message top-to-bottom and partitions it into scopes (see the Scope typedef). A
 * Phone¦/Texting¦ header starts a scope (adjacent Phone+Texting, before any phone line, merge into
 * one); a run before any header is a headerless scope (owner:null, title:null); subsequent
 * Incoming/Outgoing runs belong to the current scope across intervening narrative until a new header
 * OR an Outgoing sender contradicting the established owner starts a new (implicit) scope. Narrative
 * lines are never part of any scope. Normalizes `\r\n?`→`\n`; lineIndices index that normalized array.
 * @param {string} rawText
 * @returns {Scope[]}
 */
export function locatePhoneScopes(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];
    const lines = rawText.replace(/\r\n?/g, '\n').split('\n');
    const scopes = [];
    let current = null;

    const startScope = (owner, title, index) => {
        current = { owner, title, lines: [], lineIndices: index === null ? [] : [index] };
        scopes.push(current);
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isPhone = PHONE_HEADER_RE.test(line);
        const isTexting = TEXTING_HEADER_RE.test(line);

        if (isPhone || isTexting) {
            const owner = isPhone ? parsePhoneOwner(line) : null;
            const title = isTexting ? parseTextingTitle(line) : null;
            // Augment the current header-only scope (no phone lines yet, matching slot still empty),
            // merging an adjacent Phone+Texting pair into one scope's header.
            if (current && current.lines.length === 0
                && ((isPhone && current.owner === null) || (isTexting && current.title === null))) {
                if (isPhone) current.owner = owner;
                if (isTexting) current.title = title;
                current.lineIndices.push(i);
            } else {
                startScope(owner, title, i);
            }
            continue;
        }

        const parsed = parseScopeLine(line);
        if (!parsed) continue; // narrative — not part of any scope

        // An Outgoing sender contradicting an ESTABLISHED owner starts a new implicit scope.
        if (current && current.owner !== null && parsed.direction === 'Outgoing'
            && !sameName(current.owner, parsed.sender)) {
            startScope(null, null, null);
        }
        if (!current) startScope(null, null, null);
        current.lines.push(parsed);
        current.lineIndices.push(i);
    }
    return scopes;
}

/**
 * Removes exactly the lines of the CAPTURED scopes (every index in each captured scope's
 * lineIndices — header lines and phone lines, potentially multiple non-contiguous ranges),
 * collapsing any resulting run of blank lines to at most one and trimming a leading/trailing blank.
 * Uncaptured scopes and all narrative are left untouched. Re-splits the SAME rawText
 * locatePhoneScopes was given (same `\r\n?`→`\n` normalization).
 * @param {string} rawText
 * @param {Scope[]} capturedScopes
 * @returns {string}
 */
export function stripPhoneScopes(rawText, capturedScopes) {
    const lines = rawText.replace(/\r\n?/g, '\n').split('\n');
    const remove = new Set();
    for (const scope of capturedScopes) {
        for (const idx of scope.lineIndices) remove.add(idx);
    }
    const kept = lines.filter((_, idx) => !remove.has(idx));

    const collapsed = [];
    for (const line of kept) {
        const isBlank = line.trim() === '';
        if (isBlank && collapsed.length > 0 && collapsed[collapsed.length - 1].trim() === '') continue;
        collapsed.push(line);
    }
    while (collapsed.length && collapsed[0].trim() === '') collapsed.shift();
    while (collapsed.length && collapsed[collapsed.length - 1].trim() === '') collapsed.pop();
    return collapsed.join('\n');
}
