/**
 * @typedef {{text: string, timestamp?: string}} PhoneAppItem
 * @typedef {{title: string, items: Array<PhoneAppItem>}} PhoneAppSection
 * @typedef {{sections: Array<PhoneAppSection>}} PhoneAppParseResult
 */

// Matches the model's real "section divider" bar, e.g.:
//   ━━━━━━━━━【 ✧･ﾟ: *✧ WEYLAND ALERTS ✧*:･ﾟ✧ 】━━━━━━━━━
// Observed across live-captured `!Phone` output (all three command variants), the decorative
// characters surrounding the bar vary slightly in spacing, but the title always sits between a
// literal `*✧` and the following `✧*` — that's the one stable anchor we match on, rather than
// trying to model the full decorative glyph run (which is cosmetic and not worth pinning down).
const SECTION_HEADER_RE = /\*✧\s*([^\n]+?)\s*✧\*/g;

// Matches an `<li ...>...content...</li>` element, non-greedy so it stops at the first closing
// tag rather than spanning to the last `</li>` in the whole document. Real captured output nests
// some items inside an extra `<div style="border-left...">` wrapper for threaded replies (and, in
// one capture, does NOT re-wrap a threaded reply in its own `<li>` at all) — this regex doesn't
// care about that surrounding structure since it only looks for `<li>` tags themselves, wherever
// they appear in the raw string.
const LIST_ITEM_RE = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;

// A bare time-of-day like `10:52 PM` or `[11:02 PM]` — used to pull out an optional timestamp
// from an item's text after HTML tags have already been stripped.
const TIMESTAMP_RE = /\[?(\d{1,2}:\d{2}\s?[AaPp]\.?[Mm]\.?)\]?/;

const HTML_ENTITIES = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
};

/**
 * Strips HTML tags and decodes the small set of entities this codebase's captured output actually
 * uses, then collapses whitespace. Never throws — worst case it returns an empty string.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
    if (!html) return '';
    let text = html.replace(/<[^>]+>/g, ' ');
    for (const [entity, replacement] of Object.entries(HTML_ENTITIES)) {
        text = text.split(entity).join(replacement);
    }
    return text.replace(/\s+/g, ' ').trim();
}

/**
 * Parses the raw text returned by the platform's real `!Phone` command (via
 * `runPhoneCommand`/`ctx.generate('quiet', {})`) into a structured `{ sections }` shape for
 * WeyPhone's own phone-app UI to render, without carrying any of the model's raw HTML/inline
 * styling through into displayed text.
 *
 * Built against real live-captured output (see `.superpowers/sdd/task-3-report.md`), not an
 * idealized reading of the prompt template — the model's real section-title decoration and item
 * nesting varies between calls, so this intentionally anchors on the few structural markers that
 * stayed stable across all three captured command variants (the `*✧ TITLE ✧*` section divider and
 * `<li>` items) rather than the full literal bar/emoji run.
 *
 * Degrades gracefully rather than throwing on unparseable/empty input, matching this codebase's
 * convention elsewhere for background/optional features (e.g. `resolveMainActiveLtmEntries`).
 *
 * @param {string} rawText
 * @returns {PhoneAppParseResult}
 */
export function parsePhoneAppOutput(rawText) {
    if (!rawText || typeof rawText !== 'string') return { sections: [] };

    try {
        const headers = [...rawText.matchAll(SECTION_HEADER_RE)];
        if (headers.length === 0) return { sections: [] };

        const sections = [];
        for (let i = 0; i < headers.length; i++) {
            const title = stripHtml(headers[i][1]);
            if (!title) continue;

            const bodyStart = headers[i].index + headers[i][0].length;
            const bodyEnd = i + 1 < headers.length ? headers[i + 1].index : rawText.length;
            const body = rawText.slice(bodyStart, bodyEnd);

            const items = [];
            for (const match of body.matchAll(LIST_ITEM_RE)) {
                const text = stripHtml(match[1]);
                if (!text) continue;
                const timestampMatch = text.match(TIMESTAMP_RE);
                const item = { text };
                if (timestampMatch) item.timestamp = timestampMatch[1];
                items.push(item);
            }

            sections.push({ title, items });
        }

        return { sections };
    } catch {
        return { sections: [] };
    }
}
