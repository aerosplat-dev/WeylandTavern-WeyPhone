// lib/phoneCommand.js

/**
 * Runs the platform's real `!Phone` command mechanism against the main roleplay's own actual chat
 * — not WeyPhone's own texting pipeline. Temporarily pushes a synthetic message containing
 * `commandText` onto the LIVE `chat` array reference (so SillyTavern's real World Info keyword
 * scan sees the literal "!Phone" text and activates the real `!Phone` World Info entry, which a
 * bare `quiet_prompt` string would NOT do — the WI scan only reads real chat history), calls the
 * real `generate('quiet', {})` (SillyTavern's own `Generate` function — runs the exact real prompt
 * assembly and returns the raw text WITHOUT ever saving it to the visible chat or the chat file),
 * then removes the synthetic message.
 *
 * The push MUST be the first statement inside `try`, and removal MUST happen in `finally` —
 * `chat` is the user's REAL, live main roleplay history. A leaked synthetic message here doesn't
 * just leave a stuck UI flag (like this codebase's other concurrency-tracking Sets) — it silently
 * corrupts the user's actual roleplay chat with a message they never sent. This is why removal
 * finds and splices the EXACT object reference this call pushed, not `chat.pop()` — another
 * operation could plausibly push something else onto the same shared array while this call's
 * generate() is in flight, and a blind pop() would then delete that unrelated entry instead.
 * @param {{chat: Array<any>, generate: (type: string, options: object) => Promise<string>, commandText: string, userName: string}} options
 * @returns {Promise<string>} the raw generated text
 */
export async function runPhoneCommand({ chat, generate, commandText, userName }) {
    const syntheticMessage = { is_user: true, name: userName, mes: commandText, send_date: Date.now() };
    try {
        chat.push(syntheticMessage);
        return await generate('quiet', {});
    } finally {
        const index = chat.indexOf(syntheticMessage);
        if (index !== -1) chat.splice(index, 1);
    }
}
