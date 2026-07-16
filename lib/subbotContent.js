/**
 * Resolves a subbot's condensed personality text directly from quick-reply-ext's own strings
 * module — the same base91+Proxy-obfuscated, directly-importable data source charPer.js/rav.js
 * already use, confirmed live to be the real (non-mirror-universe) source RosterSB() wires into
 * chat-scoped {{getvar::XX}} variables during normal play. Reading it directly here means WeyPhone
 * never depends on any chat-scoped variable actually being set — no chat needs to be open, no
 * quick-reply-ext internal function needs to run.
 *
 * The returned text still contains its OWN nested macros (e.g. "{{getvar::22YO}}",
 * "{{getvar::MCY}}") — callers must run it through the same applyMacroSubstitution pass already
 * applied to full-bot (charPer.js) personality text; this function does not resolve those itself.
 * @param {Record<string, string>} strings the default export of quick-reply-ext/src/strings.js
 * @param {string} macroKey e.g. "FA" (Fasti), "EAd" (Emily Adler)
 * @returns {string}
 */
export function resolveSubbotPersonality(strings, macroKey) {
    const value = strings['rsb' + macroKey];
    return typeof value === 'string' ? value : '';
}
