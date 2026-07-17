// lib/hijackRouting.js

import { findMostRecentThread } from './storage.js';
import { splitFullName } from './castRoster.js';

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
 *             characterNicknames: Record<string, string> }} ScopeContext
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
 * Pure routing decision for a located block: resolves every distinct incoming (assistant) speaker
 * against the roster (all-or-nothing — one unresolved speaker aborts the whole block), computes the
 * order-independent participant set, decides existing-thread-vs-new via findMostRecentThread (a
 * read-only lookup — mutates nothing), and maps the block's lines to storable messages. Solo
 * conversations omit `speaker` (only one possible sender); group conversations carry the canonical
 * entryName as `speaker` (matches storage.js's schema note and portraitMap's entryName keying —
 * this is a deliberate, more-correct deviation from the design spec §4 pseudocode's raw
 * `line.speaker`). Empty-text lines are dropped. Timestamps are NOT added here (the caller supplies
 * one genTimestamp() per appended message) so this stays pure and Date.now()-free.
 * @param {{ lines: Array<{ role: string, speaker?: string, text: string }> }} block
 * @param {Array<{entryName: string}>} castRoster
 * @param {{conversations: Record<string, {id: string, participants: string[], lastActive: number}>}} settings
 * @returns {HijackPlan}
 */
export function planHijackCapture(block, castRoster, settings) {
    const incomingSpeakers = [];
    for (const line of block.lines) {
        if (line.role === 'assistant' && !incomingSpeakers.includes(line.speaker)) {
            incomingSpeakers.push(line.speaker);
        }
    }
    if (incomingSpeakers.length === 0) return { captured: false };

    const canonicalBySpeaker = new Map();
    const participants = [];
    for (const name of incomingSpeakers) {
        const entryName = resolveHijackSpeaker(name, castRoster);
        if (!entryName) return { captured: false };
        canonicalBySpeaker.set(name, entryName);
        if (!participants.includes(entryName)) participants.push(entryName);
    }

    const isGroup = participants.length > 1;
    const messages = [];
    for (const line of block.lines) {
        if (!line.text || line.text.trim() === '') continue;
        if (line.role === 'user') {
            messages.push({ role: 'user', content: line.text });
        } else {
            const message = { role: 'assistant', content: line.text };
            if (isGroup) message.speaker = canonicalBySpeaker.get(line.speaker);
            messages.push(message);
        }
    }
    const unreadIncrement = messages.filter(m => m.role === 'assistant').length;

    const existing = findMostRecentThread(settings, participants);
    return {
        captured: true,
        participants,
        existingConversationId: existing ? existing.id : null,
        messages,
        unreadIncrement,
    };
}
