// lib/hijackRouting.js

import { findTetheredThreadForRoleplay } from './storage.js';
import { splitFullName } from './castRoster.js';

/**
 * Hardcoded, non-editable built-in character→{{user}}-nickname aliases (per the per-thread naming
 * spec). Consumed ONLY by buildUserAliasSet below. Supplements — never replaces — {{user}}'s real
 * name and this thread's own userNickname whenever a scope has resolved to one of these characters
 * as ownerEntryName. Extend by editing this map directly; deliberately never surfaced in any UI.
 * (These three values are the former lib/nicknames.js BUILT_IN_USER_NICKNAMES, now character-keyed.)
 * @type {Record<string, string>}
 */
export const BUILT_IN_USER_NICKNAMES_BY_CHARACTER = {
    Summer: 'juicebox',
    Belle: 'wolfmeat',
    Indigo: 'pookie',
};

/**
 * Resolves a freeform sender/owner text to a roster entry via SUBSTRING match: a known name must
 * appear somewhere inside the sender text (case-insensitive, trimmed). The known-name set per entry
 * is its entryName, every splitFullName token of its fullName, and its optional custom
 * characterNicknames value. First matching roster entry wins; returns the entry's canonical
 * entryName so downstream storage/portrait lookups stay consistent. Handles decorated names like
 * "Blake 🐺" matching "Blake".
 * @param {string} senderText text captured from a wire line's sender field (or a Phone owner)
 * @param {Array<{entryName: string, fullName?: string}>} castRoster
 * @param {Record<string, string>} [characterNicknames] entryName -> custom nickname
 * @returns {string | null} the roster entry's entryName, or null if unrecognized
 */
export function resolveHijackSpeaker(senderText, castRoster, characterNicknames = {}) {
    if (typeof senderText !== 'string') return null;
    const target = senderText.trim().toLowerCase();
    if (!target) return null;
    for (const entry of castRoster) {
        const knownNames = [];
        if (typeof entry.entryName === 'string') knownNames.push(entry.entryName);
        if (typeof entry.fullName === 'string') knownNames.push(...splitFullName(entry.fullName));
        const nick = characterNicknames && characterNicknames[entry.entryName];
        if (typeof nick === 'string' && nick.trim()) knownNames.push(nick);
        for (const name of knownNames) {
            const needle = name.trim().toLowerCase();
            if (needle && target.includes(needle)) return entry.entryName;
        }
    }
    return null;
}

/**
 * True when a freeform text references {{user}} — the user's display name or any of their configured
 * nicknames appears somewhere inside it (substring, case-insensitive, trimmed). Used to resolve a
 * Phone owner / Outgoing sender / Texting title / Incoming sender against {{user}}.
 * @param {string} text
 * @param {string} userName {{user}}'s display name (context.name1)
 * @param {string[]} [userNicknames]
 * @returns {boolean}
 */
export function resolveUserReference(text, userName, userNicknames = []) {
    if (typeof text !== 'string') return false;
    const target = text.trim().toLowerCase();
    if (!target) return false;
    const names = [];
    if (typeof userName === 'string' && userName.trim()) names.push(userName);
    for (const nick of userNicknames) {
        if (typeof nick === 'string' && nick.trim()) names.push(nick);
    }
    return names.some(name => target.includes(name.trim().toLowerCase()));
}

/**
 * @typedef {{ captured: false }
 *   | { captured: true, perspective: 'USER' | 'CHAR', ownerEntryName: string | null }} ScopeDecision
 * @typedef {{ userName: string, userNicknames: string[],
 *             castRoster: Array<{entryName: string, fullName?: string}>,
 *             characterNicknames: Record<string, string>, roleplayChatId: string | null }} ScopeContext
 */

/**
 * Runs the spec's Perspective -> Participation -> Compatibility decision tree for one scope, in
 * order, dropping out (captured:false, scope left in the roleplay) the moment any check fails. Pure.
 * @param {import('./hijackParsing.js').Scope} scope
 * @param {ScopeContext} ctx
 * @returns {ScopeDecision}
 */
export function evaluateScope(scope, ctx) {
    const { userName, userNicknames, castRoster, characterNicknames } = ctx;
    const outgoing = scope.lines.filter(l => l.direction === 'Outgoing');
    const incomingSenders = scope.lines.filter(l => l.direction === 'Incoming').map(l => l.sender);
    const userIsIncomingSender = incomingSenders.some(s => resolveUserReference(s, userName, userNicknames));

    // --- PERSPECTIVE ---
    let perspective;
    let ownerEntryName = null;
    if (scope.owner !== null && scope.owner !== '') {
        if (resolveUserReference(scope.owner, userName, userNicknames)) {
            perspective = 'USER';
        } else {
            const entry = resolveHijackSpeaker(scope.owner, castRoster, characterNicknames);
            if (!entry) return { captured: false };
            perspective = 'CHAR';
            ownerEntryName = entry;
        }
    } else if (outgoing.length === 0) {
        // No Outgoing lines: a one-sided incoming-only text defaults to USER, UNLESS {{user}}
        // nonsensically appears as an Incoming sender (flagged edge case -> drop).
        if (userIsIncomingSender) return { captured: false };
        perspective = 'USER';
    } else {
        const firstOutgoingSender = outgoing[0].sender;
        if (resolveUserReference(firstOutgoingSender, userName, userNicknames)) {
            perspective = 'USER';
        } else {
            const entry = resolveHijackSpeaker(firstOutgoingSender, castRoster, characterNicknames);
            if (!entry) return { captured: false };
            perspective = 'CHAR';
            ownerEntryName = entry;
        }
    }

    // --- PARTICIPATION ---
    if (perspective === 'CHAR') {
        const titleMatchesUser = scope.title !== null
            && resolveUserReference(scope.title, userName, userNicknames);
        if (!titleMatchesUser && !userIsIncomingSender) return { captured: false };
    }
    // PERSPECTIVE=USER always participates.

    // --- COMPATIBILITY ---
    // Every distinct non-{{user}} sender across the whole scope must resolve to the roster.
    const seen = new Set();
    for (const line of scope.lines) {
        const key = line.sender.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        if (resolveUserReference(line.sender, userName, userNicknames)) continue;
        if (!resolveHijackSpeaker(line.sender, castRoster, characterNicknames)) return { captured: false };
    }

    return { captured: true, perspective, ownerEntryName };
}

/**
 * Gate for the MESSAGE_RECEIVED hijack handler — mirrors Weyland-Formatter's own
 * `isUser || isSystem` skip (its index.js ~line 555) plus a string-mes guard. Impersonate replies
 * arrive as is_user messages (skipped); quiet/dry-run generations don't emit a persisted
 * MESSAGE_RECEIVED with a real assistant mes, so this same predicate covers them.
 * @param {{is_user?: boolean, is_system?: boolean, mes?: string} | undefined} message
 * @returns {boolean}
 */
export function shouldProcessHijackMessage(message) {
    if (!message || typeof message.mes !== 'string') return false;
    if (message.is_user || message.is_system) return false;
    return true;
}

/**
 * @typedef {{ captured: false }
 *   | { captured: true, participants: string[], existingConversationId: string | null,
 *       messages: Array<{role: string, content: string, speaker?: string}>, unreadIncrement: number }} HijackPlan
 */

/**
 * Recap-dedup: finds the longest PREFIX of newMessages that exactly matches (role + content) the END
 * of storedTail, and returns newMessages with that overlap dropped. This is the sole mechanism for
 * "the model recaps {{user}}'s own prior messages for narrative context". Pure.
 * @param {Array<{role: string, content: string}>} newMessages
 * @param {Array<{role: string, content: string}>} storedTail the target thread's stored messages
 * @returns {Array<{role: string, content: string, speaker?: string}>} the genuinely-new remainder
 */
export function dedupeRecap(newMessages, storedTail) {
    const maxK = Math.min(newMessages.length, storedTail.length);
    for (let k = maxK; k > 0; k--) {
        let matches = true;
        for (let i = 0; i < k; i++) {
            const a = newMessages[i];
            const b = storedTail[storedTail.length - k + i];
            if (a.role !== b.role || a.content !== b.content) { matches = false; break; }
        }
        if (matches) return newMessages.slice(k);
    }
    return newMessages;
}

/**
 * Reconstructs a scope that survived evaluateScope into WeyPhone's always-{{user}}-perspective
 * storage shape, applies recap-dedup against the target thread, and produces the routing plan.
 *
 * USER perspective: Incoming -> assistant (speaker=resolved sender in a group), Outgoing -> user.
 * CHAR perspective (transposed): Outgoing -> assistant (speaker=ownerEntryName); Incoming from
 * {{user}} -> user; Incoming from a non-user character -> assistant (speaker=that char, folded into
 * the group — see the resolved-contradiction note in the plan). Solo threads omit `speaker`.
 * Empty-text lines are dropped. A scope resolving to no participants, or deduping to nothing, is
 * NOT captured. Timestamps are added by the caller (kept Date.now()-free / pure).
 * @param {import('./hijackParsing.js').Scope} scope
 * @param {ScopeDecision} decision the captured decision from evaluateScope
 * @param {ScopeContext} ctx
 * @param {{conversations: Record<string, {id: string, participants: string[], messages: Array, lastActive: number}>}} settings
 * @returns {HijackPlan}
 */
export function planScopeCapture(scope, decision, ctx, settings) {
    const { userName, userNicknames, castRoster, characterNicknames } = ctx;

    // Classify each line into {role, speaker(entryName|null), text}. speaker is the char's entryName
    // for any assistant line (attached later only if the thread is a group).
    const classify = (line) => {
        const isUser = resolveUserReference(line.sender, userName, userNicknames);
        if (decision.perspective === 'USER') {
            if (line.direction === 'Incoming') {
                return { role: 'assistant', speaker: resolveHijackSpeaker(line.sender, castRoster, characterNicknames), text: line.text };
            }
            return { role: 'user', speaker: null, text: line.text };
        }
        // CHAR perspective (transposed)
        if (line.direction === 'Outgoing') {
            return { role: 'assistant', speaker: decision.ownerEntryName, text: line.text };
        }
        if (isUser) return { role: 'user', speaker: null, text: line.text };
        return { role: 'assistant', speaker: resolveHijackSpeaker(line.sender, castRoster, characterNicknames), text: line.text };
    };

    const classified = scope.lines.map(classify);

    const participants = [];
    for (const c of classified) {
        if (c.role === 'assistant' && c.speaker && !participants.includes(c.speaker)) participants.push(c.speaker);
    }
    if (participants.length === 0) return { captured: false };

    const isGroup = participants.length > 1;
    const messages = [];
    for (const c of classified) {
        if (!c.text || c.text.trim() === '') continue;
        const message = { role: c.role, content: c.text };
        if (c.role === 'assistant' && isGroup && c.speaker) message.speaker = c.speaker;
        messages.push(message);
    }

    const existing = findTetheredThreadForRoleplay(settings, participants, ctx.roleplayChatId);
    const storedTail = existing ? existing.messages : [];
    const remainder = dedupeRecap(messages, storedTail);
    if (remainder.length === 0) return { captured: false };

    const unreadIncrement = remainder.filter(m => m.role === 'assistant').length;
    return {
        captured: true,
        participants,
        existingConversationId: existing ? existing.id : null,
        messages: remainder,
        unreadIncrement,
    };
}
