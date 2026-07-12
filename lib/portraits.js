/**
 * Resolves an avatar URL (or a fallback initial, for a character that can't be found — e.g. one
 * deleted after a conversation with them was created) for each of the given character names.
 * @param {Array<{name: string, avatar: string}>} characters SillyTavern's context.characters
 * @param {string[]} charNames
 * @param {(type: string, file: string) => string} getThumbnailUrl SillyTavern's context.getThumbnailUrl
 * @returns {Record<string, {avatarUrl: string|null, initial: string|null}>}
 */
export function buildPortraitMap(characters, charNames, getThumbnailUrl) {
    const map = {};
    for (const charName of new Set(charNames)) {
        const character = characters.find(c => c.name === charName);
        if (character) {
            map[charName] = { avatarUrl: getThumbnailUrl('avatar', character.avatar), initial: null };
        } else {
            map[charName] = { avatarUrl: null, initial: charName.charAt(0).toUpperCase() };
        }
    }
    return map;
}
