// lib/nicknames.js — pure nickname-pool helpers. No imports (importable from config.js/storage.js
// without cycles).

// The three built-in {{user}} nicknames every deployment ships with (per the design spec). Always
// present in userNicknames — re-seeded on every settings load by migrateNicknameFields, so the user
// can add to this pool but never remove a built-in.
export const BUILT_IN_USER_NICKNAMES = ['juicebox', 'pookie', 'wolfmeat'];

/**
 * Enforces the shared-uniqueness rule: no string may appear in both userNicknames and any value of
 * characterNicknames (case-insensitive, trimmed) — such a name would make perspective-checking
 * ambiguous. Pure; safe to call on every save. Blank/non-string character nicknames are ignored.
 * @param {string[]} userNicknames
 * @param {Record<string, string>} characterNicknames
 * @returns {{valid: boolean, conflicts: string[]}} conflicts are the offending character-nickname
 *   values in their original casing, de-duplicated in first-seen order.
 */
export function validateNicknamePools(userNicknames, characterNicknames) {
    const userSet = new Set();
    for (const name of userNicknames || []) {
        if (typeof name === 'string' && name.trim()) userSet.add(name.trim().toLowerCase());
    }
    const conflicts = [];
    for (const value of Object.values(characterNicknames || {})) {
        if (typeof value !== 'string' || !value.trim()) continue;
        const trimmed = value.trim();
        if (userSet.has(trimmed.toLowerCase()) && !conflicts.includes(trimmed)) conflicts.push(trimmed);
    }
    return { valid: conflicts.length === 0, conflicts };
}

/**
 * Parses a comma-delimited tag-input string into a clean array of tags (trimmed, empties dropped).
 * The pure core of the Configure-Nicknames tag-chip UI (Task 6).
 * @param {string} text
 * @returns {string[]}
 */
export function parseNicknameTags(text) {
    if (typeof text !== 'string') return [];
    return text.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
}
