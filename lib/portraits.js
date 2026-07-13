const WEYBOORU_PORTRAIT_BASE_URL = 'https://cast.weybooru.com/images/portraits';

/**
 * Resolves a weybooru-CDN primary portrait URL plus a local SillyTavern-avatar fallback URL (or
 * a fallback initial, for a character that can't be found — e.g. one deleted after a conversation
 * with them was created) for each of the given character names. Weybooru is a real third-party
 * external CDN outside this codebase's control — callers must render `primaryUrl` with a graceful
 * fallback to `fallbackUrl` on load failure (see lib/panel.js's avatarMarkup), never assume it
 * resolves.
 * @param {Array<{name: string, avatar: string}>} characters SillyTavern's context.characters
 * @param {string[]} charNames
 * @param {(type: string, file: string) => string} getThumbnailUrl SillyTavern's context.getThumbnailUrl
 * @returns {Record<string, {primaryUrl: string|null, fallbackUrl: string|null, initial: string|null}>}
 */
export function buildPortraitMap(characters, charNames, getThumbnailUrl) {
    const map = {};
    for (const charName of new Set(charNames)) {
        const character = characters.find(c => c.name === charName);
        if (character) {
            map[charName] = {
                primaryUrl: `${WEYBOORU_PORTRAIT_BASE_URL}/${character.name.toLowerCase()}.jpg`,
                fallbackUrl: getThumbnailUrl('avatar', character.avatar),
                initial: null,
            };
        } else {
            map[charName] = { primaryUrl: null, fallbackUrl: null, initial: String(charName ?? '').charAt(0).toUpperCase() };
        }
    }
    return map;
}
