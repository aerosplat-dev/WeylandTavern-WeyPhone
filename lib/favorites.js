/**
 * @param {{favoriteContacts: string[]}} settings WeyPhone settings (see lib/config.js)
 * @returns {string[]}
 */
export function getFavoriteEntryNames(settings) {
    return settings.favoriteContacts;
}

/**
 * @param {{favoriteContacts: string[]}} settings
 * @param {string} entryName
 * @returns {boolean}
 */
export function isFavorite(settings, entryName) {
    return settings.favoriteContacts.includes(entryName);
}

/**
 * Toggles a contact's favorited state. Removes ALL occurrences on un-favorite (defensive against
 * any future duplicate-push bug), rather than a single splice.
 * @param {{favoriteContacts: string[]}} settings
 * @param {string} entryName
 * @returns {boolean} the new favorited state (true = now favorited, false = now un-favorited)
 */
export function toggleFavorite(settings, entryName) {
    if (settings.favoriteContacts.includes(entryName)) {
        settings.favoriteContacts = settings.favoriteContacts.filter(name => name !== entryName);
        return false;
    }
    settings.favoriteContacts.push(entryName);
    return true;
}
