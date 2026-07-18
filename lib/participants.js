// lib/participants.js

/**
 * Formats a conversation's participant list for display, per this format:
 *   1 participant  -> "Belle"
 *   2 participants -> "Belle & Blake"
 *   3 participants -> "Belle, Blake & Ava"
 *   4+ participants -> "Belle, Blake & 2 more" (N = total - 2, the count of participants NOT
 *   individually named — the first two are always shown by name, everyone past that is just
 *   counted, regardless of how many there are).
 * @param {string[]} participants entry names, in conversation order
 * @returns {string}
 */
export function formatParticipantNames(participants) {
    if (participants.length === 0) return '';
    if (participants.length === 1) return participants[0];
    if (participants.length === 2) return `${participants[0]} & ${participants[1]}`;
    if (participants.length === 3) return `${participants[0]}, ${participants[1]} & ${participants[2]}`;
    const extra = participants.length - 2;
    return `${participants[0]}, ${participants[1]} & ${extra} more`;
}

/**
 * A thread's display label: its custom `displayName` if set (non-blank), else the formatted
 * participant names. Accepts anything carrying `{displayName?, participants}` — both a full
 * Conversation and a summary row — so every display site can share one fallback rather than
 * inlining `displayName ||` everywhere.
 * @param {{displayName?: string | null, participants: string[]}} conversation
 * @returns {string}
 */
export function resolveThreadDisplayName(conversation) {
    if (typeof conversation.displayName === 'string' && conversation.displayName.trim()) {
        return conversation.displayName;
    }
    return formatParticipantNames(conversation.participants);
}
