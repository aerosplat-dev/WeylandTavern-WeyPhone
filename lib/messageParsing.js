
const ANALYSIS_BLOCK_RE = /<analysis>[\s\S]*?<\/analysis>/;
const INCOMING_LINE_RE = /^Incoming¦[^¦]*¦[^¦]*¦(.*)$/;
const FOOTER_LINE_RE = /^(\[[^\[\]]+\]\s*)+$/;

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
    if (!rawText || typeof rawText !== 'string') return { messages: [], usedFallback: false };

    let text = rawText.replace(/\r\n?/g, '\n');

    const analysisMatch = text.match(ANALYSIS_BLOCK_RE);
    if (analysisMatch) {
        text = text.slice(analysisMatch.index + analysisMatch[0].length);
    } else if (text.includes('<analysis>')) {
        // Opening tag present but never closed (e.g. generation cut off mid-analysis) — no
        // usable reply content survives past an unterminated analysis block.
        return { messages: [], usedFallback: false };
    }

    const lines = text.split('\n');
    let lastContentIdx = lines.length - 1;
    while (lastContentIdx >= 0 && lines[lastContentIdx].trim() === '') lastContentIdx--;
    if (lastContentIdx >= 0 && FOOTER_LINE_RE.test(lines[lastContentIdx].trim())) {
        lines.splice(lastContentIdx, 1);
    }

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
