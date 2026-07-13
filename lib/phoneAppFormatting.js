/**
 * @typedef {{text: string, timestamp?: string}} PhoneAppItem
 * @typedef {{title: string, items: Array<PhoneAppItem>}} PhoneAppSection
 * @typedef {{sections: Array<PhoneAppSection>}} PhoneAppParseResult
 */

// Matches a markdown h2 section header, e.g. "## WEYLAND ALERTS" — WeyPhone's own prompts
// (lib/phoneAppPrompts.js) explicitly request this exact convention, unlike the prior milestone
// attempt's real !Phone command, which had no consistent machine-parseable marker at all.
const SECTION_HEADER_RE = /^##\s+(.+)$/gm;

// Matches a markdown bullet item, e.g. "- [10:52 PM] some text" or "- some text with no timestamp".
const BULLET_ITEM_RE = /^-\s+(.+)$/gm;

// A bare time-of-day in square brackets at the start of an item's text, e.g. "[10:52 PM]" or
// "[9:14 AM]".
const TIMESTAMP_RE = /^\[(\d{1,2}:\d{2}\s?[AaPp]\.?[Mm]\.?)\]\s*/;

// Real captured Discord output wraps usernames in markdown bold (e.g. "**@luckypaww** — ...")
// even though the shared prompt framing explicitly says "plain markdown only" with no inline
// styling — matches this codebase's established pattern of the model not perfectly following its
// own formatting instructions (see the prior HTML-based parser's header/nesting deviations).
// Unwraps `**bold**`/`__bold__` (and the rarer `***bold-italic***`/`___bold-italic___`) down to
// their inner text so no emphasis markers ever reach the rendered UI. Applied to both item text
// and section titles.
//
// Deliberately does NOT match single `*`/`_` (would-be italic markers): real captured output has
// only ever been observed to use double/triple wrapping (e.g. bold-wrapped Discord/Yik Yak
// usernames like "**@luckypaww**"), and single-char alternatives are unsafe here — usernames in
// this parser's real fixtures routinely contain bare underscores (e.g. "@belle_281"), so two
// unrelated single `_`/`*` tokens in the same line/section body would cross-word false-pair and
// the regex would splice everything between them together, corrupting real text (e.g.
// "shoutout to under_score and also foo_bar" would wrongly become "underscore and foobar").
const MARKDOWN_EMPHASIS_RE = /(\*\*\*|___|\*\*|__)(.+?)\1/g;

/**
 * Strips markdown emphasis markers (bold/italic) from a string, unwrapping the marked text rather
 * than deleting it, then collapses whitespace. Never throws.
 * @param {string} text
 * @returns {string}
 */
function stripMarkdownEmphasis(text) {
    if (!text) return '';
    return text.replace(MARKDOWN_EMPHASIS_RE, '$2').replace(/\s+/g, ' ').trim();
}

/**
 * Parses WeyPhone's own markdown-formatted phone-app output (see lib/phoneAppPrompts.js for the
 * format this is built against) into a structured `{ sections }` shape for the phone-app UI to
 * render. Built against real live-captured output (see this milestone's Task 7 report), not an
 * idealized reading of the prompt — real output can still deviate from the requested convention:
 * captured Discord output wraps usernames in `**bold**` despite the prompt saying "plain markdown
 * only", and nests per-channel `## ` sub-headers under a leading empty `## DISCORD` header rather
 * than the single flat section the prompt describes. Both are handled here (emphasis markers are
 * stripped, and sections with zero items — like that leading empty header — are dropped) rather
 * than forcing the parser to match an idealized reading of the prompt.
 *
 * Degrades gracefully rather than throwing on unparseable/empty input.
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
            const title = stripMarkdownEmphasis(headers[i][1]);
            if (!title) continue;

            const bodyStart = headers[i].index + headers[i][0].length;
            const bodyEnd = i + 1 < headers.length ? headers[i + 1].index : rawText.length;
            const body = rawText.slice(bodyStart, bodyEnd);

            const items = [];
            for (const match of body.matchAll(BULLET_ITEM_RE)) {
                let text = match[1].trim();
                if (!text) continue;
                const timestampMatch = text.match(TIMESTAMP_RE);
                const item = {};
                if (timestampMatch) {
                    item.timestamp = timestampMatch[1];
                    text = text.slice(timestampMatch[0].length).trim();
                }
                item.text = stripMarkdownEmphasis(text);
                if (item.text) items.push(item);
            }

            // Real captured output sometimes emits a leading section header with no bullets
            // under it before the actual content starts (e.g. a bare "## DISCORD" followed by
            // per-channel "## #announcements" sub-headers) — drop these rather than rendering an
            // empty section header with nothing under it.
            if (items.length === 0) continue;

            sections.push({ title, items });
        }

        return { sections };
    } catch {
        return { sections: [] };
    }
}
