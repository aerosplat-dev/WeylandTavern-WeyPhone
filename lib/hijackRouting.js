// lib/hijackRouting.js

import { findMostRecentThread } from './storage.js';

/**
 * Exact, case-insensitive match against each roster entry's entryName (WeyPhone's own internal
 * canonical name — NOT the freeform cast.weybooru fullName), so exact-match is appropriate and
 * simpler than findEntryTitleMatch's fuzzy first/last-name matching, which solves a different
 * problem. Returns the roster's canonical casing so downstream storage/portrait lookups (both
 * entryName-keyed) stay consistent regardless of how the model cased the name in the wire line.
 * @param {string} speakerName exact text captured from an Incoming¦[Time]¦[Name]¦[Text] line
 * @param {Array<{entryName: string, fullName?: string, hasFullBot?: boolean, hasSubbot?: boolean}>} castRoster
 * @returns {string | null} the roster entry's entryName, or null if unrecognized
 */
export function resolveHijackSpeaker(speakerName, castRoster) {
    if (typeof speakerName !== 'string') return null;
    const target = speakerName.trim().toLowerCase();
    if (!target) return null;
    for (const entry of castRoster) {
        if (typeof entry.entryName === 'string' && entry.entryName.toLowerCase() === target) {
            return entry.entryName;
        }
    }
    return null;
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
