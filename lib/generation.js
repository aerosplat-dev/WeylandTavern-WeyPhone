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
