/**
 * Assembles WeyPhone's system prompt in the same section order the real chat-completion
 * pipeline uses (see preparePromptsForChatCompletion in openai.js): main, worldInfoBefore,
 * charDescription, charPersonality, scenario, worldInfoAfter. (dialogueExamples/chatHistory
 * are not part of the system prompt itself and are handled separately in buildMessages.)
 */
export function buildSystemPrompt({ systemPrompt, worldInfoBefore, descriptionText, personalityText, scenarioText, worldInfoAfter }) {
    const sections = [systemPrompt, worldInfoBefore, descriptionText, personalityText, scenarioText, worldInfoAfter]
        .filter(section => typeof section === 'string' && section.trim().length > 0);
    return sections.join('\n\n');
}

/**
 * Reformats stored conversation turns into bare Incoming¦/Outgoing¦ lines (no Phone¦/Texting¦
 * header — those only matter for initializing a fresh live reply's visual interface, not for
 * conditioning past turns) using each message's own real stored timestamp, never anything the
 * model itself emitted (which is discarded during parsing and would be untrustworthy free text
 * to re-parse anyway). Reinforces the phone-format style across a long conversation.
 * @param {Array<{role: 'user'|'assistant', content: string, timestamp?: number}>} history
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
        return { role: 'assistant', content: `Incoming¦${time}¦${charName}¦${entry.content}` };
    });
}

/**
 * @param {{systemPromptText: string, history: Array<{role: string, content: string}>, userMessage: string}} options
 */
export function buildMessages({ systemPromptText, history, userMessage }) {
    const messages = [{ role: 'system', content: systemPromptText }];
    for (const entry of history) {
        messages.push({ role: entry.role, content: entry.content });
    }
    messages.push({ role: 'user', content: userMessage });
    return messages;
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
