// lib/hijackManual.js
//
// Pure logic backing the three manual Hijack tools (Capture Last Message, Undo Last Capture,
// Import from Scenario). Deliberately contains NO new detection/matching/transposition/dedup
// logic of its own — every function here is a thin wrapper that either walks/filters a chat
// array, or removes-by-identity from already-captured WeyPhone state. All actual scope
// detection/routing still comes from lib/hijackParsing.js and lib/hijackRouting.js.

import { shouldProcessHijackMessage } from './hijackRouting.js';
import { getConversation, deleteConversation } from './storage.js';

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

/**
 * @typedef {Object} AffectedConversation
 * @property {string} conversationId
 * @property {Array<object>} appendedMessages the EXACT message objects appendMessage stored —
 *   removed by reference/identity below, never by index/count.
 * @property {boolean} wasNewlyCreated
 */
/**
 * @typedef {Object} CaptureSnapshot
 * @property {number | null} messageId index into the roleplay chat[] the capture stripped
 * @property {string} preCaptureText chat[messageId].mes BEFORE the capture's strip
 * @property {AffectedConversation[]} affectedConversations
 */

/**
 * Symmetric undo of a single capture (automatic or manual): restores chat[messageId].mes to its
 * pre-capture text, and for each affected conversation removes exactly the cached appended message
 * objects (matched by reference/identity via a Set — NOT by count or index, so a conversation the
 * user has since added unrelated new messages to is left with only those unrelated messages
 * intact), deleting the conversation entirely if the capture had newly created it. Pure with
 * respect to `settings`/`chat` (no context/DOM access) — the caller is responsible for
 * context.updateMessageBlock/context.saveChat/context.saveSettingsDebounced afterward.
 * @param {{conversations: Record<string, import('./storage.js').Conversation>}} settings
 * @param {CaptureSnapshot} snapshot
 * @param {Array<{mes?: string}>} chat the roleplay's context.chat array
 */
export function undoCapture(settings, snapshot, chat) {
    if (snapshot.messageId !== null && Array.isArray(chat) && chat[snapshot.messageId]) {
        chat[snapshot.messageId].mes = snapshot.preCaptureText;
    }
    for (const affected of snapshot.affectedConversations) {
        if (affected.wasNewlyCreated) {
            deleteConversation(settings, affected.conversationId);
            continue;
        }
        const conversation = getConversation(settings, affected.conversationId);
        if (!conversation) continue;
        const toRemove = new Set(affected.appendedMessages);
        conversation.messages = conversation.messages.filter(m => !toRemove.has(m));
    }
}
