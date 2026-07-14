const WEYBOORU_PORTRAIT_BASE_URL = 'https://cast.weybooru.com/images/portraits';

/**
 * Resolves a weybooru-CDN primary portrait URL plus a local SillyTavern-avatar fallback URL (or
 * a fallback initial, if the given name is empty) for each of the given character names.
 *
 * The weybooru URL is built from just the first word of `charName` (weybooru portrait filenames
 * are lowercase first names only, e.g. a multi-word character like "Kinsbane Manor" has its
 * portrait filed under "kinsbane.jpg") and attempted for EVERY name, regardless of
 * whether a matching local SillyTavern character card is actually installed — weybooru's own
 * catalog is independent of what's locally installed (e.g. it has real portraits for platform
 * roster characters like Fasti/Gem/Lyris even where no matching local character card exists, or
 * exists only under a different name/inside a combined multi-character card). Requiring a local
 * match before even trying weybooru was a real bug: several real roster names never got a portrait
 * attempted at all, even though the weybooru image genuinely existed and loaded fine on its own.
 *
 * `fallbackUrl` (the LOCAL SillyTavern avatar, used only if the weybooru image itself fails to
 * load) still requires a real local character match, since it has to reference a real local avatar
 * file — when no local match exists, `fallbackUrl` is simply `null`, and lib/panel.js's
 * `avatarMarkup` degrades to a broken-image icon only in the rare case where weybooru ALSO fails
 * for a name with no local install to fall back to.
 *
 * Weybooru is a real third-party external CDN outside this codebase's control — callers must
 * render `primaryUrl` with a graceful fallback to `fallbackUrl` on load failure (see
 * lib/panel.js's avatarMarkup), never assume it resolves.
 * @param {Array<{name: string, avatar: string}>} characters SillyTavern's context.characters
 * @param {string[]} charNames
 * @param {(type: string, file: string) => string} getThumbnailUrl SillyTavern's context.getThumbnailUrl
 * @returns {Record<string, {primaryUrl: string|null, fallbackUrl: string|null, initial: string|null}>}
 */
export function buildPortraitMap(characters, charNames, getThumbnailUrl) {
    const map = {};
    for (const charName of new Set(charNames)) {
        if (!charName) {
            map[charName] = { primaryUrl: null, fallbackUrl: null, initial: '' };
            continue;
        }
        const character = characters.find(c => c.name === charName);
        const firstName = charName.trim().split(/\s+/)[0].toLowerCase();
        map[charName] = {
            primaryUrl: `${WEYBOORU_PORTRAIT_BASE_URL}/${firstName}.jpg`,
            fallbackUrl: character ? getThumbnailUrl('avatar', character.avatar) : null,
            initial: character ? null : charName.charAt(0).toUpperCase(),
        };
    }
    return map;
}
