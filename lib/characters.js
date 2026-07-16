// EXCLUDED_CHARACTER_NAMES is now a deliberate WeyPhone-only override, unrelated to any
// cast.weybooru.com/Weyland-lorebook signal — Muse DOES have both a working full-bot and subbot
// (confirmed live), but her story/scenario makes no sense for her to have any line of
// communication with the outside world, so she's excluded from WeyPhone's contact list entirely
// as a deliberate design choice, not a data-accuracy correction. See lib/castRoster.js's
// buildCastRoster, which takes this as its excludedEntryNames option.
export const EXCLUDED_CHARACTER_NAMES = ['Muse'];
