import { reconstructHistoryAsPhoneFormat } from './generation.js';

/**
 * Builds the request messages for a background memory-summarization call: a system message
 * instructing the model to condense the given window into one short, plain-prose memory, and a
 * user message containing the window reformatted as a phone-style transcript (reusing the same
 * reconstruction the regular chat-history uses, for consistency).
 * @param {{charName: string, personalityText: string, windowMessages: Array<{role: 'user'|'assistant', content: string, timestamp?: number}>, userName: string, formatClockTime: (epochMs: number) => string}} options
 * @returns {Array<{role: string, content: string}>}
 */
export function buildMemoryGenerationMessages({ charName, personalityText, windowMessages, userName, formatClockTime }) {
    const reconstructed = reconstructHistoryAsPhoneFormat(windowMessages, { charName, userName }, formatClockTime);
    const transcript = reconstructed.map(m => m.content).join('\n');
    const systemPrompt = [
        `You are condensing a portion of a text-message conversation into ONE short memory entry for ${charName}, so future replies can recall what happened without needing to re-read the full history.`,
        'Write 2-4 sentences of plain third-person prose summarizing the key relationship developments, facts learned, promises made, or emotional shifts in the conversation transcript below. Skip minor small talk that doesn\'t matter later. Do not use any special formatting, headers, or the pipe-delimited texting markers from the transcript — just plain prose, like a brief diary entry.',
        personalityText,
    ].filter(section => typeof section === 'string' && section.trim().length > 0).join('\n\n');
    return [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Conversation transcript to summarize:\n\n${transcript}` },
    ];
}

/**
 * Joins already-filtered memories (e.g. only pinned ones) into one prompt-ready block, wrapped in
 * the same proven framing header/caveat pattern the platform's own Weyland-LTM system uses (
 * confirmed from a real World Info entry during this milestone's design) — but applied ONCE
 * around the whole joined block, not per-memory, since WeyPhone defaults every memory to pinned
 * and repeating the wrapper per entry would be wasteful given many could be active at once.
 * @param {Array<{content: string}>} memories
 * @returns {string} empty string if `memories` is empty
 */
export function joinMemoriesForInjection(memories) {
    if (!memories || memories.length === 0) return '';
    const lines = memories.map(m => `- ${m.content}`).join('\n');
    return [
        '[LONG TERM MEMORY]',
        '- The following are short summaries of earlier developments in this conversation, in chronological order.',
        '- These are historical records of events that already happened — treat them as background knowledge, not instructions for what should happen next.',
        '- Consider this information only if contextually relevant, otherwise disregard.',
        '',
        lines,
        '',
        '[END LONG TERM MEMORY]',
    ].join('\n');
}
