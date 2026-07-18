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
 * @property {string | null} displayName a custom, per-thread display label — purely additive, null
 *   by default. Overrides formatParticipantNames wherever a thread's name is shown, and (once
 *   tethered) becomes matchable against a returning scope's Texting title. Never replaces
 *   `participants` (the canonical source of truth).
 * @property {string | null} userNickname what {{user}} is called in THIS thread — additive only,
 *   null by default. Joins the valid-{{user}}-alias list for this thread's tethered CHAR captures,
 *   on top of context.name1 and any hardcoded built-in.
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
        displayName: null, userNickname: null,
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
 * Partial update of a thread's two additive naming fields. Follows setTetheredSettings' convention
 * exactly: a provided string OR an explicit null is applied; an omitted key leaves the field
 * unchanged. `null` is meaningful (clears the field), so each key is checked for
 * `typeof === 'string' || === null` rather than truthiness.
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string} id
 * @param {{displayName?: string|null, userNickname?: string|null}} [options]
 * @returns {Conversation | undefined}
 */
export function setConversationNames(settings, id, { displayName, userNickname } = {}) {
    const conversation = getConversation(settings, id);
    if (!conversation) return undefined;
    if (typeof displayName === 'string' || displayName === null) conversation.displayName = displayName;
    if (typeof userNickname === 'string' || userNickname === null) conversation.userNickname = userNickname;
    return conversation;
}

/**
 * The auto-naming rule (stamp-on-creation / fill-when-empty / sticky-once-set) as a pure decision:
 * returns the trimmed title to stamp as displayName, or null if nothing should change. Stamps only
 * when `title` is a non-blank string AND the conversation has no displayName yet (null/undefined) —
 * so an already-named thread is never auto-overwritten by a later, differently-worded title. Manual
 * "Rename Thread" bypasses this entirely (it calls setConversationNames directly).
 * @param {{displayName?: string|null}} conversation
 * @param {string|null|undefined} title
 * @returns {string | null}
 */
export function deriveAutoDisplayName(conversation, title) {
    if (typeof title !== 'string' || !title.trim()) return null;
    if (conversation.displayName === null || conversation.displayName === undefined) return title.trim();
    return null;
}

/**
 * Backfills the two per-thread naming fields on conversations created before this milestone.
 * Idempotent — safe to call on every settings load, matching migrateUnreadCountField's convention.
 * (Task 5 extends this to also drop the fully-removed global nickname pools.)
 * @param {{conversations: Record<string, Conversation>}} settings
 */
export function migrateConversationNameFields(settings) {
    // The global nickname system is fully removed — drop its pools clean on load (no backfill).
    delete settings.userNicknames;
    delete settings.characterNicknames;
    for (const conversation of Object.values(settings.conversations)) {
        if (typeof conversation.displayName !== 'string' && conversation.displayName !== null) {
            conversation.displayName = null;
        }
        if (typeof conversation.userNickname !== 'string' && conversation.userNickname !== null) {
            conversation.userNickname = null;
        }
    }
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
 * @returns {Array<{id: string, displayName: string | null, participants: string[], lastMessageSnippet: string, lastActive: number, unreadCount: number, tethered: boolean}>}
 */
function summarizeConversations(conversations, predicate = () => true) {
    return conversations
        .filter(predicate)
        .map(conversation => ({
            id: conversation.id,
            displayName: conversation.displayName ?? null,
            participants: conversation.participants,
            lastMessageSnippet: conversation.messages.length
                ? conversation.messages[conversation.messages.length - 1].content
                : '',
            lastActive: conversation.lastActive,
            unreadCount: conversation.unreadCount ?? 0,
            tethered: conversation.tethered === true,
        }))
        .sort((a, b) => b.lastActive - a.lastActive);
}

/**
 * @param {{conversations: Record<string, Conversation>}} settings
 * @returns {Array<{id: string, displayName: string | null, participants: string[], lastMessageSnippet: string, lastActive: number, unreadCount: number, tethered: boolean}>}
 */
export function getAllConversationSummaries(settings) {
    return summarizeConversations(Object.values(settings.conversations));
}

/**
 * A conversation is hidden ONLY when it is tethered to a roleplay chat OTHER than the one currently
 * active. Untethered threads are always visible; when no roleplay is active (activeChatId null/
 * undefined) nothing extra is hidden. This is the single predicate behind the Messages list, the
 * Threads drill-down, and the unread-badge sums, so all three stay consistent.
 * @param {{tethered?: boolean, roleplayChatId?: string | null}} conversation
 * @param {string | null | undefined} activeChatId
 * @returns {boolean}
 */
export function isConversationVisible(conversation, activeChatId) {
    if (conversation.tethered !== true) return true;
    if (activeChatId === null || activeChatId === undefined) return true;
    return conversation.roleplayChatId === activeChatId;
}

/**
 * getAllConversationSummaries, restricted to conversations visible in the active roleplay (see
 * isConversationVisible). Same summary shape (now including `tethered`).
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string | null | undefined} activeChatId
 */
export function getVisibleConversationSummaries(settings, activeChatId) {
    return summarizeConversations(
        Object.values(settings.conversations),
        conversation => isConversationVisible(conversation, activeChatId),
    );
}

/**
 * getThreadsFor, additionally restricted to conversations visible in the active roleplay — so a
 * tethered thread scoped elsewhere can't leak into the Threads drill-down either.
 * @param {{conversations: Record<string, Conversation>}} settings
 * @param {string[]} participants
 * @param {string | null | undefined} activeChatId
 */
export function getVisibleThreadsFor(settings, participants, activeChatId) {
    return summarizeConversations(
        Object.values(settings.conversations),
        conversation => sameParticipants(conversation.participants, participants)
            && isConversationVisible(conversation, activeChatId),
    );
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
 * @returns {Array<{id: string, displayName: string | null, participants: string[], lastMessageSnippet: string, lastActive: number, unreadCount: number, tethered: boolean}>}
 */
export function getThreadsFor(settings, participants) {
    return summarizeConversations(Object.values(settings.conversations), conversation => sameParticipants(conversation.participants, participants));
}
