// lib/hijackManual.js
//
// Pure logic backing the three manual Hijack tools (Capture Last Message, Undo Last Capture,
// Import from Scenario). Deliberately contains NO new detection/matching/transposition/dedup
// logic of its own — every function here is a thin wrapper that either walks/filters a chat
// array, or removes-by-identity from already-captured WeyPhone state. All actual scope
// detection/routing still comes from lib/hijackParsing.js and lib/hijackRouting.js.

import { shouldProcessHijackMessage } from './hijackRouting.js';

/**
 * Walks backward from the end of `chat` and returns the index of the most recent message
 * shouldProcessHijackMessage would accept (i.e. the same message the live MESSAGE_RECEIVED
 * handler would have processed had it fired on it) — skipping any trailing user/system/non-
 * string-mes messages. This is "the latest model response," not necessarily chat[chat.length-1].
 * @param {Array<{is_user?: boolean, is_system?: boolean, mes?: string}> | undefined} chat
 * @returns {number | null}
 */
export function findMostRecentAssistantMessage(chat) {
    if (!Array.isArray(chat)) return null;
    for (let i = chat.length - 1; i >= 0; i--) {
        if (shouldProcessHijackMessage(chat[i])) return i;
    }
    return null;
}
