// lib/hijackParsing.js

/**
 * @typedef {{ speaker: string, role: 'assistant', text: string } | { role: 'user', text: string }} HijackLine
 * @typedef {{ headerLine: string | null, lines: HijackLine[], blockText: string, startIndex: number, endIndex: number }} HijackBlock
 */

// Delimiter class: ¦ (U+00A6), ASCII | , │ (U+2502) — per Weyland-Formatter's documented
// delimiter-flexibility. A phone line is `<Direction>¦<Time>¦<Name>¦<Text>`: exactly three
// delimiters, four fields. `[^¦|│]*` for the first three fields forbids a delimiter inside them so
// a partial/malformed line (missing the final ¦text) never matches. Group 1 = direction, group 2 =
// time (unused), group 3 = name/speaker, group 4 = text (may be empty; `.*`).
const PHONE_LINE_RE = /^(Incoming|Outgoing)[¦|│]([^¦|│]*)[¦|│]([^¦|│]*)[¦|│](.*)$/;
const HEADER_LINE_RE = /^(?:Phone|Texting)[¦|│]/;

/**
 * @param {string} line
 * @returns {HijackLine | null}
 */
function parsePhoneLine(line) {
    const match = line.match(PHONE_LINE_RE);
    if (!match) return null;
    const direction = match[1];
    const speaker = match[3].trim();
    const text = match[4].trim();
    if (direction === 'Incoming') return { role: 'assistant', speaker, text };
    return { role: 'user', text };
}

/**
 * Locates the single longest contiguous run of Incoming¦/Outgoing¦ lines (any of the three
 * delimiter variants) inside rawText, plus one optional Phone¦.../Texting¦... header line
 * IMMEDIATELY preceding it. Returns null if no such run exists. Ties on run length resolve to the
 * earliest run. Normalizes `\r\n?`→`\n` then splits; startIndex/endIndex are inclusive line indices
 * into that normalized array (startIndex points at the header line when one is captured).
 * @param {string} rawText
 * @returns {HijackBlock | null}
 */
export function locatePhoneBlock(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    const lines = rawText.replace(/\r\n?/g, '\n').split('\n');

    let bestStart = -1;
    let bestEnd = -1;
    let bestLen = 0;
    let i = 0;
    while (i < lines.length) {
        if (!PHONE_LINE_RE.test(lines[i])) { i++; continue; }
        const runStart = i;
        while (i < lines.length && PHONE_LINE_RE.test(lines[i])) i++;
        const runEnd = i - 1;
        const runLen = runEnd - runStart + 1;
        if (runLen > bestLen) {
            bestLen = runLen;
            bestStart = runStart;
            bestEnd = runEnd;
        }
    }
    if (bestLen === 0) return null;

    const hasHeader = bestStart > 0 && HEADER_LINE_RE.test(lines[bestStart - 1]);
    const startIndex = hasHeader ? bestStart - 1 : bestStart;
    const headerLine = hasHeader ? lines[bestStart - 1] : null;

    const parsedLines = [];
    for (let j = bestStart; j <= bestEnd; j++) {
        const parsed = parsePhoneLine(lines[j]);
        if (parsed) parsedLines.push(parsed);
    }

    return {
        headerLine,
        lines: parsedLines,
        blockText: lines.slice(startIndex, bestEnd + 1).join('\n'),
        startIndex,
        endIndex: bestEnd,
    };
}

/**
 * Removes the located block (header line, if present, plus every line in the run) from rawText,
 * collapsing any resulting run of blank lines down to at most one, and trimming a leading/trailing
 * blank line at the very start/end of the result. Never touches text outside the block. Re-splits
 * the SAME rawText locatePhoneBlock was given (same `\r\n?`→`\n` normalization), so block's
 * startIndex/endIndex line into the same array.
 * @param {string} rawText
 * @param {HijackBlock} block
 * @returns {string}
 */
export function stripPhoneBlock(rawText, block) {
    const lines = rawText.replace(/\r\n?/g, '\n').split('\n');
    const kept = [...lines.slice(0, block.startIndex), ...lines.slice(block.endIndex + 1)];

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
