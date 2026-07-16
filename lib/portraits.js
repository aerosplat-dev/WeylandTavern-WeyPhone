import { ASSET_BASE_URL } from './assetPaths.js';

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
 *
 * `portraitSlugOverrides` (keyed by charName) lets a caller supply the AUTHORITATIVE portrait
 * filename from cast.weybooru.com's own `data.json` (see lib/castRoster.js's `portraitSlug`,
 * sourced from each character's `image` field) instead of falling back to the naive
 * first-word-lowercased guess below. This matters for real characters where the guess is wrong:
 * "Margaret" guesses `margaret.jpg` (doesn't exist — she's filed under her nickname, `marge.jpg`),
 * and weybooru's own cast page misspells "Garret Sullivan" (missing a second "t"), which the guess
 * would faithfully reproduce as `garret.jpg` instead of the real `garrett.jpg`. When no override is
 * given for a name (not yet resolved, or a name outside the cast roster entirely, e.g. a PSA
 * account), this degrades to the same guess as before — never a hard requirement.
 * @param {Array<{name: string, avatar: string}>} characters SillyTavern's context.characters
 * @param {string[]} charNames
 * @param {(type: string, file: string) => string} getThumbnailUrl SillyTavern's context.getThumbnailUrl
 * @param {Record<string, string>} [portraitSlugOverrides]
 * @returns {Record<string, {primaryUrl: string|null, fallbackUrl: string|null, initial: string|null}>}
 */
export function buildPortraitMap(characters, charNames, getThumbnailUrl, portraitSlugOverrides = {}) {
    const map = {};
    for (const charName of new Set(charNames)) {
        if (!charName) {
            map[charName] = { primaryUrl: null, fallbackUrl: null, initial: '' };
            continue;
        }
        const character = characters.find(c => c.name === charName);
        const slug = portraitSlugOverrides[charName] || charName.trim().split(/\s+/)[0].toLowerCase();
        map[charName] = {
            primaryUrl: `${WEYBOORU_PORTRAIT_BASE_URL}/${slug}.jpg`,
            fallbackUrl: character ? getThumbnailUrl('avatar', character.avatar) : null,
            initial: character ? null : charName.charAt(0).toUpperCase(),
        };
    }
    return map;
}

/**
 * Resolves a bundled local profile-picture asset for each PSA/business Twitter account —
 * unlike buildPortraitMap's character resolution, these are NOT weybooru CDN lookups or
 * SillyTavern character-card avatars; they're static images shipped with the extension itself
 * (assets/profiles/profile_<portraitKey>.png). Keyed by each account's own explicit `portraitKey`
 * field (lib/twitterPrompts.js's PSA_ACCOUNTS) rather than a derived slug — deriving one the way
 * character portraits derive from a first name would collide here (e.g. "Weyland Alert" and
 * "Weyland Research Center" would both slug to "weyland").
 * @param {Array<{name: string, portraitKey: string}>} psaAccounts
 * @returns {Record<string, {primaryUrl: string, fallbackUrl: string|null, initial: string|null}>}
 */
export function buildPsaPortraitMap(psaAccounts) {
    const map = {};
    for (const account of psaAccounts) {
        map[account.name] = {
            primaryUrl: `${ASSET_BASE_URL}/profiles/profile_${account.portraitKey}.png`,
            fallbackUrl: null,
            initial: account.name.charAt(0).toUpperCase(),
        };
    }
    return map;
}
