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
 * is its entryName and every splitFullName token of its fullName. First matching roster entry wins;
 * returns the entry's canonical entryName so downstream storage/portrait lookups stay consistent.
 * Handles decorated names like "Blake 🐺" matching "Blake".
 * @param {string} senderText text captured from a wire line's sender field (or a Phone owner)
 * @param {Array<{entryName: string, fullName?: string}>} castRoster
 * @returns {string | null} the roster entry's entryName, or null if unrecognized
 */
export function resolveHijackSpeaker(senderText, castRoster) {
    if (typeof senderText !== 'string') return null;
    const target = senderText.trim().toLowerCase();
    if (!target) return null;
    for (const entry of castRoster) {
        const knownNames = [];
        if (typeof entry.entryName === 'string') knownNames.push(entry.entryName);
        if (typeof entry.fullName === 'string') knownNames.push(...splitFullName(entry.fullName));
        for (const name of knownNames) {
            const needle = name.trim().toLowerCase();
            if (needle && target.includes(needle)) return entry.entryName;
        }
    }
    return null;
}

/**
 * True when a freeform text references {{user}} — {{user}}'s real display name (context.name1,
 * ALWAYS checked) or any additive per-thread/built-in alias appears somewhere inside it (substring,
 * case-insensitive, trimmed). `extraAliases` is the strictly-additive layer from buildUserAliasSet;
 * pass none (or []) during perspective resolution, where per-thread names must not intervene.
 * @param {string} text
 * @param {string} userName {{user}}'s display name (context.name1)
 * @param {string[]} [extraAliases]
 * @returns {boolean}
 */
export function resolveUserReference(text, userName, extraAliases = []) {
    if (typeof text !== 'string') return false;
    const target = text.trim().toLowerCase();
    if (!target) return false;
    const names = [];
    if (typeof userName === 'string' && userName.trim()) names.push(userName);
    for (const alias of extraAliases) {
        if (typeof alias === 'string' && alias.trim()) names.push(alias);
    }
    return names.some(name => target.includes(name.trim().toLowerCase()));
}

/**
 * @typedef {{ captured: false }
 *   | { captured: true, perspective: 'USER' | 'CHAR', ownerEntryName: string | null }} ScopeDecision
 * @typedef {{ userName: string,
 *             castRoster: Array<{entryName: string, fullName?: string}>,
 *             roleplayChatId: string | null }} ScopeContext
 */

/**
 * The order-INDEPENDENT set of roster characters a scope resolves to, used ONLY for the additive-
 * alias tethered-thread lookup. Alias-independent by construction: it consults resolveHijackSpeaker
 * ONLY (never {{user}} aliases), so it can be computed BEFORE the alias set it helps build — this is
 * what breaks the apparent circular dependency. Distinct from planScopeCapture's ordered
 * `participants` list (which is speaker-order-sensitive and asserted by tests); do NOT unify them.
 * @param {import('./hijackParsing.js').Scope} scope
 * @param {string | null} ownerEntryName
 * @param {Array<{entryName: string, fullName?: string}>} castRoster
 * @returns {string[]}
 */
function resolveScopeCharacterSet(scope, ownerEntryName, castRoster) {
    const set = [];
    if (ownerEntryName) set.push(ownerEntryName);
    for (const line of scope.lines) {
        const entry = resolveHijackSpeaker(line.sender, castRoster);
        if (entry && !set.includes(entry)) set.push(entry);
    }
    return set;
}

/**
 * Builds the strictly-additive {{user}}-alias set for a scope that has resolved to CHAR with a
 * concrete ownerEntryName, plus the tethered thread those aliases were derived from (reused by
 * evaluateScope's displayName participation path). ADDITIVE ONLY: the returned list never includes
 * {{user}}'s real name — every caller ALSO passes userName to resolveUserReference, which always
 * checks it. The two additive sources are (1) the hardcoded built-in for ownerEntryName, if any,
 * and (2) the userNickname of an already-tethered thread for this exact character set + roleplay.
 * The SINGLE source of the alias set for BOTH evaluateScope and planScopeCapture — do not
 * reimplement either lookup inline anywhere else.
 * @param {import('./hijackParsing.js').Scope} scope
 * @param {string | null} ownerEntryName
 * @param {Array<{entryName: string, fullName?: string}>} castRoster
 * @param {{conversations: Record<string, import('./storage.js').Conversation>}} settings
 * @param {string | null} roleplayChatId
 * @returns {{aliases: string[], tethered: import('./storage.js').Conversation | undefined}}
 */
export function buildUserAliasSet(scope, ownerEntryName, castRoster, settings, roleplayChatId) {
    const aliases = [];
    const builtin = ownerEntryName ? BUILT_IN_USER_NICKNAMES_BY_CHARACTER[ownerEntryName] : null;
    if (typeof builtin === 'string' && builtin) aliases.push(builtin);
    const characterSet = resolveScopeCharacterSet(scope, ownerEntryName, castRoster);
    const tethered = findTetheredThreadForRoleplay(settings, characterSet, roleplayChatId);
    if (tethered && typeof tethered.userNickname === 'string' && tethered.userNickname.trim()) {
        aliases.push(tethered.userNickname);
    }
    return { aliases, tethered };
}

/**
 * Runs the spec's Perspective -> Participation -> Compatibility decision tree for one scope, in
 * order, dropping out (captured:false, scope left in the roleplay) the moment any check fails. Pure.
 * @param {import('./hijackParsing.js').Scope} scope
 * @param {ScopeContext} ctx
 * @param {{conversations: Record<string, import('./storage.js').Conversation>}} settings
 * @returns {ScopeDecision}
 */
export function evaluateScope(scope, ctx, settings) {
    const { userName, castRoster, roleplayChatId } = ctx;
    const outgoing = scope.lines.filter(l => l.direction === 'Outgoing');
    const incomingSenders = scope.lines.filter(l => l.direction === 'Incoming').map(l => l.sender);
    // Perspective resolution uses ONLY {{user}}'s real name — per-thread aliases never intervene here.
    const baseUserIsIncoming = incomingSenders.some(s => resolveUserReference(s, userName));

    // --- PERSPECTIVE (unchanged logic/order: real name -> roster) ---
    let perspective;
    let ownerEntryName = null;
    if (scope.owner !== null && scope.owner !== '') {
        if (resolveUserReference(scope.owner, userName)) {
            perspective = 'USER';
        } else {
            const entry = resolveHijackSpeaker(scope.owner, castRoster);
            if (!entry) return { captured: false };
            perspective = 'CHAR';
            ownerEntryName = entry;
        }
    } else if (outgoing.length === 0) {
        // No Outgoing lines: a one-sided incoming-only text defaults to USER, UNLESS {{user}}
        // nonsensically appears as an Incoming sender (flagged edge case -> drop).
        if (baseUserIsIncoming) return { captured: false };
        perspective = 'USER';
    } else {
        const firstOutgoingSender = outgoing[0].sender;
        if (resolveUserReference(firstOutgoingSender, userName)) {
            perspective = 'USER';
        } else {
            const entry = resolveHijackSpeaker(firstOutgoingSender, castRoster);
            if (!entry) return { captured: false };
            perspective = 'CHAR';
            ownerEntryName = entry;
        }
    }

    // --- ADDITIVE ALIAS SET (built only once perspective is CHAR with a concrete ownerEntryName) ---
    let extraAliases = [];
    if (perspective === 'CHAR') {
        const { aliases, tethered } = buildUserAliasSet(scope, ownerEntryName, castRoster, settings, roleplayChatId);
        extraAliases = aliases;

        // --- PARTICIPATION ---
        const userIsIncomingSender = incomingSenders.some(s => resolveUserReference(s, userName, extraAliases));
        const titleMatchesUser = scope.title !== null
            && resolveUserReference(scope.title, userName, extraAliases);
        const titleMatchesDisplayName = scope.title !== null
            && tethered
            && typeof tethered.displayName === 'string'
            && tethered.displayName.trim() !== ''
            && scope.title.trim().toLowerCase().includes(tethered.displayName.trim().toLowerCase());
        if (!titleMatchesUser && !userIsIncomingSender && !titleMatchesDisplayName) return { captured: false };
    }
    // PERSPECTIVE=USER always participates.

    // --- COMPATIBILITY ---
    // Every distinct non-{{user}} sender across the whole scope must resolve to the roster. The
    // additive aliases apply only in CHAR perspective (extraAliases stays [] for USER).
    const seen = new Set();
    for (const line of scope.lines) {
        const key = line.sender.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        if (resolveUserReference(line.sender, userName, extraAliases)) continue;
        if (!resolveHijackSpeaker(line.sender, castRoster)) return { captured: false };
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
    const { userName, castRoster, roleplayChatId } = ctx;

    // Same additive alias set evaluateScope used — via the SAME builder, so the two never drift.
    // Only meaningful for CHAR (isUser is unused in the USER branch); [] otherwise.
    const extraAliases = decision.perspective === 'CHAR'
        ? buildUserAliasSet(scope, decision.ownerEntryName, castRoster, settings, roleplayChatId).aliases
        : [];

    // Classify each line into {role, speaker(entryName|null), text}. speaker is the char's entryName
    // for any assistant line (attached later only if the thread is a group).
    const classify = (line) => {
        const isUser = resolveUserReference(line.sender, userName, extraAliases);
        if (decision.perspective === 'USER') {
            if (line.direction === 'Incoming') {
                return { role: 'assistant', speaker: resolveHijackSpeaker(line.sender, castRoster), text: line.text };
            }
            return { role: 'user', speaker: null, text: line.text };
        }
        // CHAR perspective (transposed)
        if (line.direction === 'Outgoing') {
            return { role: 'assistant', speaker: decision.ownerEntryName, text: line.text };
        }
        if (isUser) return { role: 'user', speaker: null, text: line.text };
        return { role: 'assistant', speaker: resolveHijackSpeaker(line.sender, castRoster), text: line.text };
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
