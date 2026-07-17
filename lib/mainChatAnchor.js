// lib/mainChatAnchor.js
import { isMainRoleplayActive } from './tetheredContext.js';

/**
 * Snapshots "how many messages the main roleplay chat has right now" at the moment a WeyPhone
 * message/memory is created — the anchor Task 3's injection-grouping logic uses to place that
 * item back at roughly the right point in the main chat's own timeline later, instead of always
 * dumping tethered content at the very end. Returns null (never dropped, just treated as
 * "unanchored" downstream) whenever there's nothing meaningful to anchor to: bi-directional
 * tethering is off, no main roleplay is currently active, or chatLength isn't a real number.
 * @param {{bidirectionalTetheringEnabled: boolean, characterId: number|undefined, groupId: string|undefined, chatLength: number|undefined}} options
 * @returns {number | null}
 */
export function resolveMainChatAnchor({ bidirectionalTetheringEnabled, characterId, groupId, chatLength }) {
    if (!bidirectionalTetheringEnabled) return null;
    if (!isMainRoleplayActive({ characterId, groupId })) return null;
    return typeof chatLength === 'number' ? chatLength : null;
}
