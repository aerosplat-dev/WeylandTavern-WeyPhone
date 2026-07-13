/**
 * @typedef {Object} Conversation
 * @property {string} id
 * @property {string} charName
 * @property {Array<{role: string, content: string}>} messages
 * @property {number} createdAt
 * @property {number} lastActive
 */

// HelixMind exposes both under these exact ids; "-thinking" enables reasoning effort, the plain
// id doesn't. Defaults chosen by the operator: Gemini 3 Pro as primary, non-thinking GLM 4.7 as
// the fallback if the primary model call fails.
export const DEFAULT_MEMORY_PRIMARY_MODEL = 'gemini-3-pro-preview';
export const DEFAULT_MEMORY_BACKUP_MODEL = 'glm-4.7';

let lastTimestamp = 0;

export function genTimestamp() {
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
    const conversation = {
        id, charName, messages: [], createdAt: now, lastActive: now,
        memories: [], memoryThreshold: 100, memoryConnectionProfileId: '', lastMemoryMessageIndex: 0,
        memoryPrimaryModel: DEFAULT_MEMORY_PRIMARY_MODEL, memoryBackupModel: DEFAULT_MEMORY_BACKUP_MODEL,
    };
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
 * Bulk-deletes messages by index in one pass — a single filter against a Set of the original
 * indices, rather than repeated splice() calls (which would need careful descending-order
 * handling to avoid later indices shifting out from under earlier deletes).
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {Iterable<number>} indices
 * @returns {Conversation | undefined}
 */
export function deleteMessages(settings, id, indices) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    const toDelete = new Set(indices);
    if (toDelete.size === 0) return conversation;
    conversation.messages = conversation.messages.filter((_, index) => !toDelete.has(index));
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
 * Removes every trailing role:'assistant' message from the conversation, leaving it ending on
 * its most recent role:'user' message (left unchanged) — used by Regenerate to discard the last
 * exchange before resending. No-op (returns false) if the conversation doesn't exist, has no
 * trailing assistant messages to discard, or has no user message preceding the trailing run.
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @returns {boolean} true if anything was discarded
 */
export function discardTrailingReply(settings, id) {
    const conversation = getConversation(settings, id);
    if (!conversation) return false;
    const messages = conversation.messages;
    let cutIndex = messages.length;
    while (cutIndex > 0 && messages[cutIndex - 1].role === 'assistant') cutIndex--;
    if (cutIndex === messages.length) return false;
    if (cutIndex === 0) return false;
    messages.length = cutIndex;
    return true;
}

function genMemoryId() {
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @typedef {Object} Memory
 * @property {string} id
 * @property {string} content
 * @property {number} createdAt
 * @property {boolean} pinned
 * @property {{from: number, to: number} | null} sourceRange
 */

/**
 * Creates a new memory on the conversation, pinned (injected) by default.
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {string} content
 * @param {{pinned?: boolean, sourceRange?: {from: number, to: number} | null}} [options]
 * @returns {Memory | undefined}
 */
export function createMemory(settings, id, content, { pinned = true, sourceRange = null } = {}) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    if (!Array.isArray(conversation.memories)) conversation.memories = [];
    const memory = { id: genMemoryId(), content, createdAt: genTimestamp(), pinned, sourceRange };
    conversation.memories.push(memory);
    return memory;
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {string} memoryId
 * @param {string} newContent
 * @returns {Conversation | undefined}
 */
export function editMemory(settings, id, memoryId, newContent) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    const memory = (conversation.memories || []).find(m => m.id === memoryId);
    if (!memory) return conversation;
    memory.content = newContent;
    return conversation;
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {string} memoryId
 * @returns {Conversation | undefined}
 */
export function deleteMemory(settings, id, memoryId) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    if (!Array.isArray(conversation.memories)) return conversation;
    const index = conversation.memories.findIndex(m => m.id === memoryId);
    if (index === -1) return conversation;
    conversation.memories.splice(index, 1);
    return conversation;
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {string} memoryId
 * @param {boolean} pinned
 * @returns {Conversation | undefined}
 */
export function setMemoryPinned(settings, id, memoryId, pinned) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    const memory = (conversation.memories || []).find(m => m.id === memoryId);
    if (!memory) return conversation;
    memory.pinned = pinned;
    return conversation;
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @returns {Memory[]}
 */
export function getPinnedMemories(settings, id) {
    const conversation = getConversation(settings, id);
    if (!conversation || !Array.isArray(conversation.memories)) return [];
    return conversation.memories.filter(m => m.pinned);
}

/**
 * Partial update — only the provided keys change.
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {{memoryThreshold?: number, memoryConnectionProfileId?: string, memoryPrimaryModel?: string, memoryBackupModel?: string}} [options]
 * @returns {Conversation | undefined}
 */
export function setMemorySettings(settings, id, { memoryThreshold, memoryConnectionProfileId, memoryPrimaryModel, memoryBackupModel } = {}) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    if (typeof memoryThreshold === 'number') conversation.memoryThreshold = memoryThreshold;
    if (typeof memoryConnectionProfileId === 'string') conversation.memoryConnectionProfileId = memoryConnectionProfileId;
    if (typeof memoryPrimaryModel === 'string') conversation.memoryPrimaryModel = memoryPrimaryModel;
    if (typeof memoryBackupModel === 'string') conversation.memoryBackupModel = memoryBackupModel;
    return conversation;
}

/**
 * Most recently created memory that came from an LLM summarization pass (has a sourceRange) —
 * i.e. excludes manually user-authored memories, which have nothing to regenerate from. Used by
 * "Regenerate last memory" to find its target.
 * @param {Conversation} conversation
 * @returns {Memory | null}
 */
export function getLastGeneratedMemory(conversation) {
    const generated = (conversation.memories || []).filter(m => m.sourceRange);
    if (generated.length === 0) return null;
    return generated.reduce((latest, m) => (m.createdAt > latest.createdAt ? m : latest));
}

/**
 * @param {Array<{role: string, content: string}>} messages
 * @param {number} sinceIndex
 * @returns {number}
 */
export function countExchangesSince(messages, sinceIndex) {
    return messages.slice(sinceIndex).filter(m => m.role === 'user').length;
}

/**
 * Backfills memory-related fields on conversations created before this milestone. Idempotent —
 * safe to call on every settings load, matches migrateLegacyConversations's convention exactly.
 * @param {{conversations: Record<string, Conversation>}} settings
 */
export function migrateMemoryFields(settings) {
    for (const conversation of Object.values(settings.conversations)) {
        if (!Array.isArray(conversation.memories)) conversation.memories = [];
        if (typeof conversation.memoryThreshold !== 'number') conversation.memoryThreshold = 100;
        if (typeof conversation.memoryConnectionProfileId !== 'string') conversation.memoryConnectionProfileId = '';
        if (typeof conversation.lastMemoryMessageIndex !== 'number') conversation.lastMemoryMessageIndex = 0;
        if (typeof conversation.memoryPrimaryModel !== 'string') conversation.memoryPrimaryModel = DEFAULT_MEMORY_PRIMARY_MODEL;
        if (typeof conversation.memoryBackupModel !== 'string') conversation.memoryBackupModel = DEFAULT_MEMORY_BACKUP_MODEL;
    }
}

/**
 * Migrates milestone-1-era conversations (keyed directly by character name, no `id`/`charName`
 * fields) into the current ID-keyed shape, in place. Idempotent — entries that already have an
 * `id` are left untouched, so this is safe to call on every settings load.
 * @param {{conversations: Record<string, any>}} settings
 */
export function migrateLegacyConversations(settings) {
    for (const [key, value] of Object.entries(settings.conversations)) {
        if (!value || typeof value !== 'object' || value.id) continue;
        delete settings.conversations[key];
        const id = genId();
        const lastActive = value.lastActive ?? genTimestamp();
        settings.conversations[id] = {
            id,
            charName: key,
            messages: value.messages ?? [],
            createdAt: value.createdAt ?? lastActive,
            lastActive,
        };
    }
}

/**
 * Computes the [start, end) boundary of the next memory-summarization window for a conversation —
 * everything from its last-summarized point to its current end. Pure function: does not mutate
 * anything or read `Date.now()`, so the same conversation.messages/lastMemoryMessageIndex always
 * produces the same result regardless of what happens to the conversation later (this is exactly
 * the property that matters: index.js must capture this BEFORE an LLM call starts, not re-derive
 * it after, since messages.length can grow while a background memory-generation call is in flight
 * — see the fix this was extracted for).
 * @param {{messages: Array<{role: string, content: string}>, lastMemoryMessageIndex?: number}} conversation
 * @returns {{start: number, end: number, messages: Array<{role: string, content: string}>}}
 */
export function getMemoryWindow(conversation) {
    const start = conversation.lastMemoryMessageIndex ?? 0;
    const messages = conversation.messages.slice(start);
    const end = start + messages.length;
    return { start, end, messages };
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
