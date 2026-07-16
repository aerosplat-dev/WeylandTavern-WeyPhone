/**
 * Drops non-string / empty / whitespace-only sections and joins the rest with `sep`. The single
 * canonical home for the filter-then-join idiom every WeyPhone prompt-assembly site shares
 * (buildSystemPrompt here, buildTetheredViewBlock, buildMemoryGenerationMessages). Pure/read-only.
 * @param {Array<unknown>} sections
 * @param {string} [sep]
 * @returns {string}
 */
export function joinNonEmptySections(sections, sep = '\n\n') {
    return sections
        .filter(section => typeof section === 'string' && section.trim().length > 0)
        .join(sep);
}

/**
 * Assembles WeyPhone's system prompt in the same section order the real chat-completion
 * pipeline uses (see preparePromptsForChatCompletion in openai.js): main, worldInfoBefore,
 * charDescription, charPersonality, scenario, worldInfoAfter. (dialogueExamples/chatHistory
 * are not part of the system prompt itself and are handled separately in buildMessages.)
 */
export function buildSystemPrompt({ systemPrompt, worldInfoBefore, descriptionText, personalityText, scenarioText, worldInfoAfter }) {
    return joinNonEmptySections([systemPrompt, worldInfoBefore, descriptionText, personalityText, scenarioText, worldInfoAfter]);
}

/**
 * Assembles the system prompt for a group conversation (2+ subbot participants, no full-bot
 * content ever used here regardless of whether a participant also has a full-bot — see this
 * milestone's design spec for why). Lists every participant's name + condensed subbot personality,
 * then instructs the model to privately judge, per character, whether they'd have anything worth
 * saying in response to the user's latest message — anywhere from none of them to all of them may
 * respond, entirely the model's call based on message content and each character's personality.
 * Reuses the existing pipe-delimited Incoming¦[Time]¦[Name]¦[Text] format (see
 * reconstructHistoryAsPhoneFormat) so per-speaker parsing/rendering needs no new wire format.
 * @param {{basePrompt: string, postHistory: string, participants: Array<{entryName: string, personalityText: string}>}} options
 * @returns {string}
 */
export function buildGroupSystemPrompt({ basePrompt, postHistory, participants }) {
    const roster = participants
        .map(p => `## ${p.entryName}\n${p.personalityText}`)
        .join('\n\n');
    const judgmentInstruction = `[GROUP TEXT THREAD]
This is a group text with multiple people. For EACH character below, silently judge: would this character actually respond to {{user}}'s message, given what was said and their own personality?
Some messages call for one reply, some for a back-and-forth between several people, some for
everyone to chime in, some for near-silence. Only write Incoming¦ lines for characters who would
genuinely respond — skip anyone with nothing to add. Use "Incoming¦[Time]¦[Character Name]¦[Text]"
for each message, exactly as usual, with the correct speaking character's name each time.

${roster}`;
    return joinNonEmptySections([basePrompt, judgmentInstruction, postHistory]);
}

/**
 * Reformats stored conversation turns into bare Incoming¦/Outgoing¦ lines (no Phone¦/Texting¦
 * header — those only matter for initializing a fresh live reply's visual interface, not for
 * conditioning past turns) using each message's own real stored timestamp, never anything the
 * model itself emitted (which is discarded during parsing and would be untrustworthy free text
 * to re-parse anyway). Reinforces the phone-format style across a long conversation.
 *
 * `charName` is only a fallback: for a group conversation, `charName` is just one representative
 * participant (see `entryNameForMacros` in index.js's `generateReply`), while each stored
 * assistant message from a prior group turn carries its OWN real `speaker` (set by the group
 * branch's per-line `appendMessage` calls — see Task 9). An entry's own `speaker` always wins
 * when present, so reconstructed history correctly attributes every past turn to whichever
 * character actually said it, instead of collapsing every past speaker to one representative name.
 * @param {Array<{role: 'user'|'assistant', content: string, timestamp?: number, speaker?: string}>} history
 * @param {{charName: string, userName: string}} names
 * @param {(epochMs: number) => string} formatClockTime
 * @returns {Array<{role: 'user'|'assistant', content: string}>}
 */
export function reconstructHistoryAsPhoneFormat(history, { charName, userName }, formatClockTime) {
    return history.map(entry => {
        const time = typeof entry.timestamp === 'number' ? formatClockTime(entry.timestamp) : '';
        if (entry.role === 'user') {
            return { role: 'user', content: `Outgoing¦${time}¦${userName}¦${entry.content}` };
        }
        const speaker = entry.speaker || charName;
        return { role: 'assistant', content: `Incoming¦${time}¦${speaker}¦${entry.content}` };
    });
}

/**
 * @param {{systemPromptText: string, history: Array<{role: string, content: string}>, userMessage: string}} options
 */
export function buildMessages({ systemPromptText, history, userMessage }) {
    const messages = [{ role: 'system', content: systemPromptText }];
    // Coalesce consecutive same-role entries in `history` into a single message each, so the
    // final messages array always strictly alternates user/assistant. Multi-message bursts
    // (e.g. several "Incoming¦" lines parsed out of one reply) are stored as separate
    // same-role history entries upstream, which would otherwise produce non-alternating
    // sequences that some chat-completion backends reject or mishandle.
    for (const entry of history) {
        const last = messages[messages.length - 1];
        if (last && last.role === entry.role) {
            last.content = `${last.content}\n${entry.content}`;
        } else {
            messages.push({ role: entry.role, content: entry.content });
        }
    }
    // Same coalescing applies at the history/userMessage boundary: if the last (coalesced)
    // history entry is also role:'user' (e.g. a dangling user turn left over from a failed
    // generation, or discardTrailingReply leaving the conversation ending on 'user'), merge
    // the trailing userMessage into it instead of pushing a second adjacent user message.
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'user') {
        lastMessage.content = `${lastMessage.content}\n${userMessage}`;
    } else {
        messages.push({ role: 'user', content: userMessage });
    }
    return messages;
}

/**
 * Runs a fully-assembled prompt string through SillyTavern's own real macro engine
 * (`context.substituteParams`) — {{user}}, {{char}}, {{time}}, {{date}}, {{weekday}}, dice
 * rolls, and every other registered macro, not just {{user}}. WeyPhone previously did NO macro
 * substitution anywhere in its send path, so any macro embedded in a character's rav.js prompt,
 * their charper.js personality text, scanned World Info content, a stored memory, or the
 * `[TETHERED VIEW]` framing text itself reached the model as a literal unresolved `{{...}}`
 * string.
 *
 * `replaceCharacterCard` is always passed as `false` — ST's real `substituteParams` only supports
 * pulling `{{description}}`/`{{personality}}`/`{{scenario}}`/etc. from whichever character is
 * CURRENTLY ACTIVE in the main ST window (`characters[this_chid]`), with no way to point it at an
 * arbitrary character by name. WeyPhone's own conversation character is very often NOT the main
 * window's active character (that's the whole point of tethered mode), so enabling this would
 * silently inject the wrong character's card fields. `{{user}}`/`{{char}}` still resolve
 * correctly regardless, via the explicit `userName`/`charName` overrides below — those don't
 * depend on `replaceCharacterCard` at all. A handful of rarer macros
 * (`{{description}}`/`{{personality}}`/`{{persona}}`/`{{mesExamples}}`) go unresolved as a
 * result — accepted, since WeyPhone already assembles those fields itself via
 * `resolveCharacterPrompt`/`charper.js`, not via this macro.
 * @param {{substituteParams: Function, content: string, userName: string, charName: string}} options
 * @returns {string}
 */
export function applyMacroSubstitution({ substituteParams, content, userName, charName }) {
    if (!content) return '';
    return substituteParams(content, userName, charName, undefined, undefined, false, {});
}

/**
 * Extracts the raw text from a ConnectionManagerRequestService.sendRequest result — the provider
 * response shape varies (plain string vs. an object with a `content` field), so every call site
 * that sends a message needs this same normalization.
 * @param {string | {content?: string} | null | undefined} result
 * @returns {string}
 */
export function extractResponseText(result) {
    return typeof result === 'string' ? result : (result?.content ?? '');
}

/**
 * @param {{connectionProfileId: string}} settings WeyPhone settings
 * @param {string} activeProfileId extensionSettings.connectionManager.selectedProfile
 */
export function resolveProfileId(settings, activeProfileId) {
    return settings.connectionProfileId || activeProfileId || '';
}

/**
 * @param {{sendRequest: (profileId: string, messages: any[]) => Promise<any>, profileId: string, messages: any[]}} options
 */
export async function sendMessage({ sendRequest, profileId, messages }) {
    if (!profileId) {
        throw new Error('No Connection Profile available (none selected in WeyPhone settings and none active in SillyTavern)');
    }
    return sendRequest(profileId, messages);
}
