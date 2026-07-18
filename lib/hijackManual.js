// lib/hijackManual.js
//
// Pure logic backing the three manual Hijack tools (Capture Last Message, Undo Last Capture,
// Import from Scenario). Deliberately contains NO new detection/matching/transposition/dedup
// logic of its own — every function here is a thin wrapper that either walks/filters a chat
// array, or removes-by-identity from already-captured WeyPhone state. All actual scope
// detection/routing still comes from lib/hijackParsing.js and lib/hijackRouting.js.

import { shouldProcessHijackMessage } from './hijackRouting.js';
import { getConversation, deleteConversation, sameParticipants } from './storage.js';

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

/**
 * Import from Scenario's participant-set restriction (spec: "restricted to scopes whose resolved
 * participant set matches THIS thread's own `participants` exactly, order-independent"), plus the
 * more permissive "Parse unscoped messages" rule for headerless scopes (spec: "as long as none of
 * the scope's senders conflict with participants outside this thread's own set").
 *
 * `planScopeCapture`'s own participant computation is deliberately NOT reused for this decision —
 * that function computes the union of every distinct participant across the WHOLE scope (used to
 * decide solo-vs-group STORAGE shape), whereas this decides whether a scope belongs to THIS
 * thread at all. A CHAR-perspective scope's ownership is its `decision.ownerEntryName` (a scope
 * with owner "Rosa" always belongs to a Rosa-owned thread regardless of who else appears in it as
 * a non-owner incoming/outgoing sender), and a USER-perspective scope has no character owner to
 * attribute to any thread, so it is never eligible for Import (it would need every OTHER
 * participant of a group thread to independently also match, which the exact-owner check below
 * does not attempt — out of scope per this task's "no new detection logic" constraint; a
 * USER-perspective scope inside a group's own history is left for a future task if ever needed).
 *
 * @param {import('./hijackParsing.js').Scope} scope
 * @param {import('./hijackRouting.js').ScopeDecision} decision the captured decision from evaluateScope
 * @param {string[]} ownParticipants the target thread's own `participants`
 * @param {string[]} scopeParticipants the FULL resolved participant set of this scope (as
 *   planScopeCapture would compute it) — used only for the headered exact-match branch.
 * @param {boolean} parseUnscoped the "Parse unscoped messages" checkbox state
 * @returns {boolean}
 */
export function scopeMatchesThreadParticipants(scope, decision, ownParticipants, scopeParticipants, parseUnscoped) {
    if (decision.perspective !== 'CHAR' || !decision.ownerEntryName) return false;
    const isHeadered = scope.owner !== null && scope.owner !== '';
    if (isHeadered) {
        // The owner must itself be one of this thread's own participants — sameParticipants alone
        // is insufficient when scopeParticipants doesn't actually reflect the owner (e.g. contrived
        // or inconsistent inputs), since a scope belongs to whichever character owns it.
        return ownParticipants.includes(decision.ownerEntryName) && sameParticipants(ownParticipants, scopeParticipants);
    }
    if (!parseUnscoped) return false;
    // Headerless: eligible for THIS thread as long as the resolved owner is one of this thread's
    // own participants (a conflict with a participant OUTSIDE this thread's set is exactly the
    // case where ownerEntryName would name a character not in ownParticipants).
    return ownParticipants.includes(decision.ownerEntryName);
}
