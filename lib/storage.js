/**
 * @param {{conversations: Record<string, {messages: any[], lastActive: number|null}>}} settings WeyPhone settings (see lib/config.js)
 * @param {string} charName
 */
export function getConversation(settings, charName) {
    if (!settings.conversations[charName]) {
        settings.conversations[charName] = { messages: [], lastActive: null };
    }
    return settings.conversations[charName];
}

/**
 * @param {{conversations: Record<string, {messages: any[], lastActive: number|null}>}} settings
 * @param {string} charName
 * @param {{role: string, content: string}} message
 */
export function appendMessage(settings, charName, message) {
    const conversation = getConversation(settings, charName);
    conversation.messages.push(message);
    conversation.lastActive = Date.now();
    return conversation;
}
