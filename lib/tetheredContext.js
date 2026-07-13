
/**
 * @param {{characterId: number|undefined, groupId: string|undefined}} options
 * @returns {boolean}
 */
export function isMainRoleplayActive({ characterId, groupId }) {
    return characterId !== undefined || !!groupId;
}

const LTM_MARKER_PREFIX = 'ltm:';

/**
 * Mirrors Weyland-LTM's own entryLooksLikeLTM detection exactly (read-only reference, not
 * imported — Weyland-LTM exports no reusable API) so this recognizes the same entries the main
 * roleplay's own LTM system would.
 */
function entryLooksLikeLtm(entry) {
    const autoId = String(entry.automationId ?? '');
    if (autoId.startsWith(LTM_MARKER_PREFIX)) return true;
    if (/^\d+$/.test(autoId)) {
        return /MEMORY ENTRY|LTM/i.test(entry.comment || '') || /MEMORY:/i.test(entry.content || '');
    }
    return false;
}

/**
 * Mirrors Weyland-LTM's `Chat Book <chatId>` sanitize convention exactly (see
 * Weyland-LTM/index.js's getOrCreateChatBookName) so an already-bound book is found by the same
 * name a freshly-created one would get.
 */
function sanitizedChatBookName(chatId) {
    const sanitized = `${chatId}`.replace(/[^a-z0-9]/gi, '_').replace(/_{2,}/g, '_');
    const fullName = `Chat Book ${sanitized}`;
    return fullName.substring(0, 64);
}

/**
 * Resolves the main roleplay's currently-ACTIVE LTM entries — `entry.constant === true` only.
 * Weyland-LTM's own demoteExcessLTMs already maintains this flag to mean "currently injected into
 * the main roleplay's own prompt"; this deliberately does not reimplement that "keep newest N"
 * logic, just reads the already-computed result. Returns [] (never throws) if no book is bound or
 * the book has no matching entries — a main chat that's never used Weyland-LTM is normal, not an
 * error.
 * @param {{loadWorldInfo: (name: string) => Promise<any>, chatMetadata: Record<string, any>, chatId: string}} options
 * @returns {Promise<Array<{content: string}>>}
 */
export async function resolveMainActiveLtmEntries({ loadWorldInfo, chatMetadata, chatId }) {
    try {
        const bookName = chatMetadata?.world_info || sanitizedChatBookName(chatId);
        const book = await loadWorldInfo(bookName);
        if (!book?.entries) return [];
        return Object.values(book.entries).filter(entry => entryLooksLikeLtm(entry) && entry.constant === true);
    } catch {
        return [];
    }
}

/**
 * @param {{chat: Array<{name: string, mes: string, is_user?: boolean, is_system?: boolean}>, lastLtmMessageId: number, historyCap: number|null}} options
 * @returns {Array<{name: string, mes: string, is_system?: boolean}>}
 */
export function resolveMainHistorySlice({ chat, lastLtmMessageId, historyCap }) {
    if (typeof historyCap === 'number') {
        return chat.slice(Math.max(0, chat.length - historyCap));
    }
    const start = Math.max(0, (lastLtmMessageId ?? -1) + 1);
    return chat.slice(start);
}

/**
 * @param {Array<{name: string, mes: string, is_system?: boolean}>} messages
 * @returns {string}
 */
export function formatMainHistoryTranscript(messages) {
    return messages
        .filter(m => !m.is_system && typeof m.mes === 'string' && m.mes.trim())
        .map(m => `${m.name}: ${m.mes}`)
        .join('\n');
}

/**
 * @param {{worldInfoText: string, ltmEntries: Array<{content: string}>, historyTranscript: string}} options
 * @returns {string} empty string if all three sections are empty
 */
export function buildTetheredViewBlock({ worldInfoText, ltmEntries, historyTranscript }) {
    const ltmText = ltmEntries.map(e => e.content).filter(Boolean).join('\n');
    const sections = [worldInfoText, ltmText, historyTranscript]
        .filter(section => typeof section === 'string' && section.trim().length > 0);
    if (sections.length === 0) return '';
    return [
        '[TETHERED VIEW]',
        'Below is another roleplay {{user}} is currently running, shown to you for context only — you are',
        "not in it and can't act within it. If {{user}} brings it up, react the way YOUR personality",
        'actually would, not generically; otherwise ignore it.',
        '',
        ...sections,
        '',
        '[END TETHERED VIEW]',
    ].join('\n');
}
