/**
 * @param {Array<{key?: string[], content?: string, disable?: boolean, constant?: boolean}>} entries
 * @param {Array<{role: string, content: string}>} history
 */
export function scanEntries(entries, history) {
    const text = history.map(m => m.content ?? '').join('\n').toLowerCase();
    const matched = entries.filter(entry => {
        if (entry.disable) return false;
        if (entry.constant) return true;
        const keys = entry.key ?? [];
        return keys.some(key => typeof key === 'string' && key.length > 0 && text.includes(key.toLowerCase()));
    });
    return matched.map(entry => entry.content).filter(Boolean).join('\n');
}

/**
 * Tethered mode: use SillyTavern's real World Info scan engine, unmodified — this reflects
 * whatever World Info is currently globally active (the main chat's linked books) as-is.
 *
 * The real `getWorldInfoPrompt(chat, maxContext, isDryRun, globalScanData)` delegates to
 * `checkWorldInfo` which builds a `new WorldInfoBuffer(chat, globalScanData)` — that
 * constructor expects `chat` to be a plain `string[]`, ordered newest-message-first (depth 0
 * = most recent), and its `#initDepthBuffer` calls `.trim()` directly on each element.
 * WeyPhone's own `history` convention is an array of `{role, content}` objects, oldest-first,
 * so it must be converted at this boundary before being handed to the real function —
 * mirroring how SillyTavern's own core code prepares the same argument
 * (`public/script.js`): `coreChat.map(x => x.mes).reverse()`.
 * @param {{getWorldInfoPrompt: Function, history: Array<{role: string, content: string}>, maxContext: number}} options
 */
export async function resolveWorldInfoTethered({ getWorldInfoPrompt, history, maxContext }) {
    const chatForWI = history.map(m => m.content ?? '').reverse();
    const result = await getWorldInfoPrompt(chatForWI, maxContext, false, {});
    return {
        worldInfoBefore: result.worldInfoBefore ?? '',
        worldInfoAfter: result.worldInfoAfter ?? '',
    };
}

/**
 * Untethered mode: scan only the fixed "Weyland" lorebook plus (if set) the current persona's
 * linked lorebook, using WeyPhone's own lightweight scan — entirely independent of whatever
 * World Info the main chat has selected.
 * @param {{loadWorldInfo: Function, history: Array<{role: string, content: string}>, personaLorebookName?: string}} options
 */
export async function resolveWorldInfoUntethered({ loadWorldInfo, history, personaLorebookName }) {
    const bookNames = ['Weyland', ...(personaLorebookName ? [personaLorebookName] : [])];
    const texts = [];
    for (const name of bookNames) {
        const data = await loadWorldInfo(name);
        if (!data || !data.entries) continue;
        const entries = Object.values(data.entries);
        const scanned = scanEntries(entries, history);
        if (scanned) texts.push(scanned);
    }
    return { worldInfoBefore: texts.join('\n'), worldInfoAfter: '' };
}
