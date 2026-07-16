
const ANALYSIS_BLOCK_RE = /<analysis>[\s\S]*?<\/analysis>/;
const INCOMING_LINE_RE = /^Incoming¦[^¦]*¦[^¦]*¦(.*)$/;
const INCOMING_LINE_WITH_SPEAKER_RE = /^Incoming¦[^¦]*¦([^¦]*)¦(.*)$/;
const FOOTER_LINE_RE = /^(\[[^\[\]]+\]\s*)+$/;

/**
 * Shared preprocessing for parseReply/parseGroupReply: normalizes line endings, strips the
 * <analysis>...</analysis> reasoning-scaffold block, then strips a trailing [Word] [Word]-style
 * footer line. Returns null (not an empty array) to signal a genuinely unusable input — either a
 * non-string/empty rawText, or an <analysis> block that was opened but never closed (e.g.
 * generation cut off mid-analysis) — callers must treat null as "nothing usable survives at all",
 * the same case parseReply previously signaled directly via an early return.
 * @param {string} rawText
 * @returns {string[] | null} the remaining lines, analysis/footer already stripped
 */
function preprocessReplyLines(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;

    let text = rawText.replace(/\r\n?/g, '\n');

    const analysisMatch = text.match(ANALYSIS_BLOCK_RE);
    if (analysisMatch) {
        text = text.slice(analysisMatch.index + analysisMatch[0].length);
    } else if (text.includes('<analysis>')) {
        return null;
    }

    const lines = text.split('\n');
    let lastContentIdx = lines.length - 1;
    while (lastContentIdx >= 0 && lines[lastContentIdx].trim() === '') lastContentIdx--;
    if (lastContentIdx >= 0 && FOOTER_LINE_RE.test(lines[lastContentIdx].trim())) {
        lines.splice(lastContentIdx, 1);
    }

    return lines;
}

/**
 * Cleans up a raw model reply for storage/display: strips the <analysis>...</analysis>
 * reasoning-scaffold block, defensively strips a trailing [Word] [Word]-style footer line, then
 * extracts each Incoming¦[Time]¦[Sender]¦[Message] line's message text as its own standalone
 * entry. Phone¦/Texting¦/Outgoing¦ lines and any other non-matching lines (including narration
 * that slipped through) are discarded. Falls back to the cleaned remainder as a single message if
 * no Incoming¦ lines are found — signals a format-following failure without silently losing the
 * reply. Returns an empty messages array (usedFallback: false) only when nothing usable survives
 * at all (e.g. the analysis block was never closed) — callers must treat that as an error.
 * @param {string} rawText
 * @returns {{ messages: string[], usedFallback: boolean }}
 */
export function parseReply(rawText) {
    const lines = preprocessReplyLines(rawText);
    if (lines === null) return { messages: [], usedFallback: false };

    const messages = [];
    for (const line of lines) {
        const match = line.match(INCOMING_LINE_RE);
        if (match) {
            const content = match[1].trim();
            if (content) messages.push(content);
        }
    }

    if (messages.length > 0) {
        return { messages, usedFallback: false };
    }

    const fallbackText = lines.join('\n').trim();
    if (!fallbackText) {
        return { messages: [], usedFallback: false };
    }
    return { messages: [fallbackText], usedFallback: true };
}

/**
 * Same preprocessing as parseReply (analysis-block stripping, footer-line stripping) but preserves
 * each Incoming¦ line's SPEAKER name alongside its text — used for group conversations, where
 * knowing WHICH participant sent each message matters (see index.js's generateReply group branch,
 * which stores each returned message's speaker on the conversation record). Shares the exact same
 * graceful-fallback contract as parseReply: a format-breaking reply still becomes a single stored
 * fallback message (with speaker: null, since there's no reliable per-speaker attribution to
 * recover from unstructured text) rather than being silently dropped.
 * @param {string} rawText
 * @returns {{ messages: Array<{speaker: string | null, content: string}>, usedFallback: boolean }}
 */
export function parseGroupReply(rawText) {
    const lines = preprocessReplyLines(rawText);
    if (lines === null) return { messages: [], usedFallback: false };

    const messages = [];
    for (const line of lines) {
        const match = line.match(INCOMING_LINE_WITH_SPEAKER_RE);
        if (match) {
            const speaker = match[1].trim() || null;
            const content = match[2].trim();
            if (content) messages.push({ speaker, content });
        }
    }

    if (messages.length > 0) {
        return { messages, usedFallback: false };
    }

    const fallbackText = lines.join('\n').trim();
    if (!fallbackText) {
        return { messages: [], usedFallback: false };
    }
    return { messages: [{ speaker: null, content: fallbackText }], usedFallback: true };
}
