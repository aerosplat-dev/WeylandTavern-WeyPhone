// test/helpers.js
//
// Shared fixtures for the test suite. Extracted 2026-07-18 from near-identical fixtures that were
// being hand-rebuilt across several test files (see .superpowers/sdd/test-suite-audit-2026-07-18.md,
// item I-1). Only fixtures confirmed to be genuinely interchangeable across their call sites were
// consolidated here — see each export's comment for what was verified before extraction.

/**
 * A deterministic fake for the `formatClockTime(epochMs) => string` collaborator several lib
 * modules take as a dependency-injected argument. Confirmed identical (same signature, same
 * `T${ms}` behavior) across its three prior inline declarations in generation.test.js,
 * memoryGeneration.test.js, and mainChatInjection.test.js before consolidating here.
 *
 * Note: generation.test.js also has a second, deliberately DIFFERENT fake in the same file
 * (`() => { throw new Error('should not be called') }`) used to assert formatClockTime is never
 * invoked in a specific branch — that one is a distinct fixture for a distinct assertion and was
 * intentionally left inline rather than forced into this shared helper.
 *
 * @param {number} epochMs
 * @returns {string}
 */
export function fakeFormatClockTime(epochMs) {
    return `T${epochMs}`;
}

/**
 * A canonical 3-character cast roster shaped for lib/hijackRouting.js consumers
 * (resolveHijackSpeaker/planScopeCapture/etc.), which read `entryName`, `fullName`, `hasFullBot`,
 * and `hasSubbot`. Extracted from hijackRouting.test.js, the sole file that declared this exact
 * shape as a top-level `ROSTER` constant.
 *
 * Deliberately NOT shared with twitterParsing.test.js's own `ROSTER` constant — that one is a
 * genuinely different fixture shape (`{ name, handle, bio }`) for a different consumer
 * (lib/twitterParsing.js), not an interchangeable duplicate of this one, despite the audit
 * initially flagging both under the same "cast ROSTER" umbrella. Forcing them together would lose
 * fields real tests depend on in one direction or the other.
 *
 * @type {Array<{entryName: string, fullName: string, hasFullBot: boolean, hasSubbot: boolean}>}
 */
export const ROSTER = [
    { entryName: 'Rosa', fullName: 'Rosa Vermillion', hasFullBot: true, hasSubbot: true },
    { entryName: 'Belle', fullName: 'Belle Cadence', hasFullBot: true, hasSubbot: true },
    { entryName: 'Blake', fullName: 'Blake Wolfe', hasFullBot: true, hasSubbot: true },
];

/**
 * A fake for SillyTavern's `context.getThumbnailUrl(type, file)`. Format matches the real
 * implementation (`public/script.js` `getThumbnailUrl()`: `` `/thumbnail?type=${type}&file=${file}` ``)
 * — confirmed against the actual core ST source before picking this format as canonical, since
 * portraits.test.js had this exact query-string version alongside inline path-style variants
 * (`` `/thumbnail/${type}/${file}` ``, lines ~12/21) that didn't match the real API shape.
 *
 * @param {string} type
 * @param {string} file
 * @returns {string}
 */
export function fakeGetThumbnailUrl(type, file) {
    return `/thumbnail?type=${type}&file=${file}`;
}
