/**
 * @typedef {Object} Conversation
 * @property {string} id
 * @property {string} charName
 * @property {Array<{role: string, content: string}>} messages
 * @property {number} createdAt
 * @property {number} lastActive
 */

let lastTimestamp = 0;

function genTimestamp() {
    const now = Date.now();
    if (now > lastTimestamp) {
        lastTimestamp = now;
        return now;
    } else {
        lastTimestamp++;
        return lastTimestamp;
    }
}

function genId() {
    return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings WeyPhone settings (see lib/config.js)
 * @param {string} charName
 * @returns {Conversation}
 */
export function createConversation(settings, charName) {
    const id = genId();
    const now = genTimestamp();
    const conversation = { id, charName, messages: [], createdAt: now, lastActive: now };
    settings.conversations[id] = conversation;
    return conversation;
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @returns {Conversation | undefined}
 */
export function getConversation(settings, id) {
    return settings.conversations[id];
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {{role: string, content: string}} message
 * @returns {Conversation | undefined}
 */
export function appendMessage(settings, id, message) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    conversation.messages.push(message);
    conversation.lastActive = genTimestamp();
    return conversation;
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {number} messageIndex
 * @param {string} newContent
 * @returns {Conversation | undefined}
 */
export function editMessage(settings, id, messageIndex, newContent) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    const message = conversation.messages[messageIndex];
    if (!message) return conversation;
    message.content = newContent;
    return conversation;
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {number} messageIndex
 * @returns {Conversation | undefined}
 */
export function deleteMessage(settings, id, messageIndex) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    if (messageIndex < 0 || messageIndex >= conversation.messages.length) return conversation;
    conversation.messages.splice(messageIndex, 1);
    return conversation;
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 */
export function deleteConversation(settings, id) {
    delete settings.conversations[id];
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings
 * @returns {Array<{id: string, charName: string, lastMessageSnippet: string, lastActive: number}>}
 */
export function getAllConversationSummaries(settings) {
    return Object.values(settings.conversations)
        .map(conversation => ({
            id: conversation.id,
            charName: conversation.charName,
            lastMessageSnippet: conversation.messages.length
                ? conversation.messages[conversation.messages.length - 1].content
                : '',
            lastActive: conversation.lastActive,
        }))
        .sort((a, b) => b.lastActive - a.lastActive);
}
