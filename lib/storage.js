import { BUILT_IN_USER_NICKNAMES } from './nicknames.js';

/**
 * @typedef {Object} Conversation
 * @property {string} id
 * @property {string[]} participants entry names (see lib/castRoster.js) — length 1 for a
 *   single-contact conversation, length 2+ for a group chat.
 * @property {Array<{role: string, content: string, speaker?: string}>} messages `speaker` is the
 *   entry name of whichever participant sent an assistant message, set only in group
 *   conversations (participants.length > 1) — a solo conversation has only one possible speaker
 *   and doesn't need it.
 * @property {number} createdAt
 * @property {number} lastActive
 * @property {number} unreadCount count of assistant messages appended while this thread was not
 *   the currently-open-and-scrolled-to-bottom conversation (generic — Hijack is the first path
 *   that appends while unwatched, but any background-append path increments it the same way).
 * @property {string | null} roleplayChatId the SillyTavern chatId (context.chatId) this thread is
 *   tethered to; null whenever tethered is false. Scopes a tether to exactly one real roleplay chat
 *   file so the same character in two unrelated roleplays never merges into one thread.
 */

// HelixMind exposes both under these exact ids; "-thinking" enables reasoning effort, the plain
// id doesn't. Defaults chosen by the operator: thinking GLM 4.7 as primary, Gemini 3 Pro as the
// fallback if the primary model call fails.
export const DEFAULT_MEMORY_PRIMARY_MODEL = 'glm-4.7-thinking';
export const DEFAULT_MEMORY_BACKUP_MODEL = 'gemini-3-pro-preview';

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

// No collision-dedup guarantee here, unlike genTimestamp's explicit tie-breaking loop below —
// relies on Date.now() + 6 random base36 chars being astronomically unlikely to collide within a
// single settings object. Deliberately not hardened further; see genMemoryId for the same tradeoff.
function genId() {
    return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings WeyPhone settings (see lib/config.js)
 * @param {string[]} participants entry names — pass a single-element array for a solo conversation.
 * @returns {Conversation}
 */
export function createConversation(settings, participants) {
    const id = genId();
    const now = genTimestamp();
    const conversation = {
        id, participants: [...participants], messages: [], createdAt: now, lastActive: now,
        memories: [], memoryThreshold: 100, memoryConnectionProfileId: '', lastMemoryMessageIndex: 0,
        memoryPrimaryModel: DEFAULT_MEMORY_PRIMARY_MODEL, memoryBackupModel: DEFAULT_MEMORY_BACKUP_MODEL,
        tethered: false, tetheredHistoryCap: null, roleplayChatId: null, unreadCount: 0,
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
 * Deletes a single message in place via splice(). Safe as a plain splice (no batch-delete
 * reindexing hazard like deleteMessages below) because there's only ever one index to remove per
 * call — nothing else in this same call is relying on indices computed before the splice. Mutates
 * conversation.messages in place rather than reassigning it (unlike deleteMessages' filter-based
 * approach); no caller in this codebase holds a reference to the old messages array across a
 * delete, so either style is safe here — see getMemoryWindow's doc comment for the one place
 * array-reference stability actually matters, which this doesn't affect.
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

// Same collision-dedup tradeoff as genId above.
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
 * @property {number | null} mainChatAnchor
 */

/**
 * Creates a new memory on the conversation, pinned (injected) by default.
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {string} content
 * @param {{pinned?: boolean, sourceRange?: {from: number, to: number} | null, mainChatAnchor?: number | null}} [options]
 * @returns {Memory | undefined}
 */
export function createMemory(settings, id, content, { pinned = true, sourceRange = null, mainChatAnchor = null } = {}) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    if (!Array.isArray(conversation.memories)) conversation.memories = [];
    const memory = { id: genMemoryId(), content, createdAt: genTimestamp(), pinned, sourceRange, mainChatAnchor };
    conversation.memories.push(memory);
    return memory;
}

/**
 * Shared lookup used by editMemory/deleteMemory/setMemoryPinned. Standardized null-handling
 * convention: a missing/malformed (non-array) `conversation.memories` is treated as "no memories",
 * same result as the pre-extraction `(conversation.memories || []).find(...)` callers produced for
 * undefined/null, without risking a runtime error if memories were ever some other truthy non-array
 * value.
 * @param {Conversation} conversation
 * @param {string} memoryId
 * @returns {number} index of the matching memory, or -1 if not found
 */
function findMemoryIndex(conversation, memoryId) {
    if (!Array.isArray(conversation.memories)) return -1;
    return conversation.memories.findIndex(m => m.id === memoryId);
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
    const index = findMemoryIndex(conversation, memoryId);
    if (index === -1) return conversation;
    conversation.memories[index].content = newContent;
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
    const index = findMemoryIndex(conversation, memoryId);
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
    const index = findMemoryIndex(conversation, memoryId);
    if (index === -1) return conversation;
    conversation.memories[index].pinned = pinned;
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
 * Partial update — only the provided keys change. `tetheredHistoryCap` may be explicitly set to
 * `null` to clear an override back to the default "since last main-roleplay memory" behavior —
 * unlike the other setters in this file, `null` is a meaningful value here, not "leave unchanged",
 * so this checks `'tetheredHistoryCap' in options` rather than `typeof ... === 'number'`.
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {{tethered?: boolean, tetheredHistoryCap?: number|null, roleplayChatId?: string|null}} [options]
 * @returns {Conversation | undefined}
 */
export function setTetheredSettings(settings, id, { tethered, tetheredHistoryCap, roleplayChatId } = {}) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    if (typeof tethered === 'boolean') conversation.tethered = tethered;
    if (typeof tetheredHistoryCap === 'number' || tetheredHistoryCap === null) {
        conversation.tetheredHistoryCap = tetheredHistoryCap;
    }
    // roleplayChatId follows tetheredHistoryCap's convention: null is a meaningful value (clear the
    // scope back to "untethered"), so check presence-or-null rather than truthiness.
    if (typeof roleplayChatId === 'string' || roleplayChatId === null) {
        conversation.roleplayChatId = roleplayChatId;
    }
    return conversation;
}

/**
 * Backfills tethered-mode fields on conversations created before this milestone. Idempotent —
 * safe to call on every settings load, matches migrateMemoryFields's convention exactly.
 * @param {{conversations: Record<string, Conversation>}} settings
 */
export function migrateTetheredFields(settings) {
    for (const conversation of Object.values(settings.conversations)) {
        if (typeof conversation.tethered !== 'boolean') conversation.tethered = false;
        if (typeof conversation.tetheredHistoryCap !== 'number' && conversation.tetheredHistoryCap !== null) {
            conversation.tetheredHistoryCap = null;
        }
    }
}

/**
 * One-time force-untether of legacy tethered threads. A thread that predates this milestone has NO
 * `roleplayChatId` key at all; a post-migration thread ALWAYS has the key (null or a chatId), because
 * createConversation writes it. Keying on the missing key (NOT on `tethered === true`) is what makes
 * this idempotent: getSettings re-runs every migration on nearly every operation, so a `tethered`-keyed
 * reset would un-tether a legitimately-tethered thread on the very next getSettings call. There is no
 * way to recover which roleplay a legacy tether belonged to, so it is force-reset to untethered.
 * `tetheredHistoryCap` is left untouched. Idempotent — safe to call on every settings load.
 * @param {{conversations: Record<string, Conversation>}} settings
 */
export function migrateRoleplayChatIdField(settings) {
    for (const conversation of Object.values(settings.conversations)) {
        if (!('roleplayChatId' in conversation)) {
            if (conversation.tethered === true) conversation.tethered = false;
            conversation.roleplayChatId = null;
        }
    }
}

/**
 * Backfills the unreadCount field on conversations created before this milestone. Idempotent —
 * safe to call on every settings load, matches migrateTetheredFields's convention exactly.
 * @param {{conversations: Record<string, Conversation>}} settings
 */
export function migrateUnreadCountField(settings) {
    for (const conversation of Object.values(settings.conversations)) {
        if (typeof conversation.unreadCount !== 'number') conversation.unreadCount = 0;
    }
}

/**
 * Backfills the nickname pools on settings created before this milestone, and re-seeds the three
 * built-in {{user}} nicknames every load (they are non-removable by design). Idempotent — safe to
 * call on every settings load, matching migrateUnreadCountField's convention exactly. Operates on
 * top-level settings fields (not per-conversation), unlike the other migrate* functions.
 * @param {{userNicknames?: string[], characterNicknames?: Record<string, string>}} settings
 */
export function migrateNicknameFields(settings) {
    if (!Array.isArray(settings.userNicknames)) settings.userNicknames = [];
    const present = new Set(
        settings.userNicknames.filter(n => typeof n === 'string').map(n => n.toLowerCase()),
    );
    for (const builtin of BUILT_IN_USER_NICKNAMES) {
        if (!present.has(builtin.toLowerCase())) {
            settings.userNicknames.push(builtin);
            present.add(builtin.toLowerCase());
        }
    }
    if (typeof settings.characterNicknames !== 'object'
        || settings.characterNicknames === null
        || Array.isArray(settings.characterNicknames)) {
        settings.characterNicknames = {};
    }
}

/**
 * Backfills the participants field on conversations created before this milestone (which have
 * charName instead) — converts `charName: 'Blake'` into `participants: ['Blake']` and removes the
 * old field. Idempotent — a conversation that already has `participants` is left untouched, so
 * this is safe to call on every settings load, matching every other migrate* function's convention
 * in this file. Must run AFTER migrateLegacyConversations (which produces `participants` directly
 * for its own migrated shape already, so ordering only matters for conversations that already had
 * an `id` but still used the older `charName` field).
 * @param {{conversations: Record<string, Conversation>}} settings
 */
export function migrateParticipantsField(settings) {
    for (const conversation of Object.values(settings.conversations)) {
        if (Array.isArray(conversation.participants)) continue;
        if (typeof conversation.charName === 'string') {
            conversation.participants = [conversation.charName];
            delete conversation.charName;
        }
    }
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
 * @param {{conversations: Record<string, Conversation>}} settings
 */
export function migrateLegacyConversations(settings) {
    for (const [key, value] of Object.entries(settings.conversations)) {
        if (!value || typeof value !== 'object' || value.id) continue;
        delete settings.conversations[key];
        const id = genId();
        const lastActive = value.lastActive ?? genTimestamp();
        settings.conversations[id] = {
            id,
            participants: [key],
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
 * Shared summary-shape mapper used by getAllConversationSummaries/getThreadsFor — same fields,
 * same last-message-snippet derivation, same most-recent-first sort; callers differ only in which
 * conversations they include.
 * @param {Conversation[]} conversations
 * @param {(conversation: Conversation) => boolean} predicate
 * @returns {Array<{id: string, participants: string[], lastMessageSnippet: string, lastActive: number, unreadCount: number}>}
 */
function summarizeConversations(conversations, predicate = () => true) {
    return conversations
        .filter(predicate)
        .map(conversation => ({
            id: conversation.id,
            participants: conversation.participants,
            lastMessageSnippet: conversation.messages.length
                ? conversation.messages[conversation.messages.length - 1].content
                : '',
            lastActive: conversation.lastActive,
            unreadCount: conversation.unreadCount ?? 0,
        }))
        .sort((a, b) => b.lastActive - a.lastActive);
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings
 * @returns {Array<{id: string, participants: string[], lastMessageSnippet: string, lastActive: number, unreadCount: number}>}
 */
export function getAllConversationSummaries(settings) {
    return summarizeConversations(Object.values(settings.conversations));
}

/**
 * True if two participant lists contain exactly the same entry names, regardless of order.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {boolean}
 */
export function sameParticipants(a, b) {
    if (a.length !== b.length) return false;
    const setA = new Set(a);
    return b.every(name => setA.has(name));
}

/**
 * Finds the most-recently-active conversation with exactly this set of participants (order-
 * independent) — e.g. a solo Belle thread only matches ['Belle'], not ['Belle', 'Blake'].
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string[]} participants
 * @returns {Conversation | undefined}
 */
export function findMostRecentThread(settings, participants) {
    const matches = Object.values(settings.conversations).filter(c => sameParticipants(c.participants, participants));
    if (!matches.length) return undefined;
    return matches.reduce((latest, c) => c.lastActive > latest.lastActive ? c : latest);
}

/**
 * Finds the most-recently-active conversation that is BOTH tethered AND scoped to this exact
 * roleplayChatId AND has exactly this set of participants (order-independent). The roleplay-scoped
 * counterpart to findMostRecentThread — used by Hijack's routing and the tether uniqueness check so a
 * tether belongs to one specific roleplay chat, never merely "whatever character matches". A null/
 * undefined roleplayChatId never matches (strict ===), so this returns undefined when no roleplay is
 * active. Leaves findMostRecentThread's participants-only behavior intact for other callers.
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string[]} participants
 * @param {string | null} roleplayChatId
 * @returns {Conversation | undefined}
 */
export function findTetheredThreadForRoleplay(settings, participants, roleplayChatId) {
    const matches = Object.values(settings.conversations).filter(c =>
        c.tethered === true
        && c.roleplayChatId === roleplayChatId
        && sameParticipants(c.participants, participants));
    if (!matches.length) return undefined;
    return matches.reduce((latest, c) => c.lastActive > latest.lastActive ? c : latest);
}

/**
 * Lists ALL threads with exactly this set of participants, sorted most-recent-first — same
 * summary shape as getAllConversationSummaries, so the same renderMessagesScreen/click-handler
 * pipeline can render and interact with either list without any new UI code.
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string[]} participants
 * @returns {Array<{id: string, participants: string[], lastMessageSnippet: string, lastActive: number, unreadCount: number}>}
 */
export function getThreadsFor(settings, participants) {
    return summarizeConversations(Object.values(settings.conversations), conversation => sameParticipants(conversation.participants, participants));
}
