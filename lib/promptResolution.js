/**
 * Looks up the resolved master-prompt entry (system prompt + post-history template)
 * for the given prompt choice, falling back to "Current Prompt" if the choice is unknown.
 * @param {Map<string, {teg: string, post: string, whtml?: string}>} ravs quick-reply-ext's exported ravs Map
 * @param {string} promptChoice The value of the "PromptChoice" global variable
 */
export function resolveMasterPrompt(ravs, promptChoice) {
    const entry = ravs.get(promptChoice) ?? ravs.get('Current Prompt');
    if (!entry) {
        throw new Error(`No rav.js entry found for prompt choice "${promptChoice}" or fallback "Current Prompt"`);
    }
    return entry;
}

/**
 * Replicates quick-reply-ext's XXX()'s {{pipe}} substitution in rav.post.
 *
 * NOTE: the real XXX() branches on a chat-LOCAL "ExpAltShow" variable (rav.expaltshow vs.
 * {{getglobalvar::RPFocus}}). WeyPhone has no chat context, so ExpAltShow is always
 * unset/false here — this always takes the same branch a brand-new chat would take before
 * ExpAltShow is ever toggled on, i.e. always uses rpFocus (a genuinely global variable).
 * @param {{post: string, whtml?: string}} ravEntry
 * @param {{htmlEnabled: boolean, rpFocus?: string}} options
 */
export function resolvePostHistoryInstructions(ravEntry, { htmlEnabled, rpFocus }) {
    const focusText = rpFocus ?? '';
    const htmlPart = htmlEnabled ? (ravEntry.whtml ?? '') : '=====';
    return ravEntry.post.replace('{{pipe}}', `${focusText}\n${htmlPart}`);
}
