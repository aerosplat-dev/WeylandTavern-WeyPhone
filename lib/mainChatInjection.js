// lib/mainChatInjection.js
import { reconstructHistoryAsPhoneFormat } from './generation.js';

/**
 * The shared, single-instance info-bleed caution — injected once per generation whenever there's
 * any tethered content to inject at all, never repeated per group (keeps token cost down).
 */
export const TETHER_CAUTION_BLOCK = `[TETHERED TEXTS — INFO-BLEED CAUTION]
{{user}} has been exchanging text messages with certain characters, shown below at the point in
this story where each exchange happened. ONLY {{user}} and the specific character(s) named in each
block below are aware of that block's content — any other character has no knowledge of it unless
told about it in-story. Do not have an uninvolved character reference, react to, or otherwise reveal
awareness of a text exchange they were not a part of.
[END TETHERED TEXTS CAUTION]`;

/**
 * Selects the injectable content for one tethered conversation: its pinned memories, plus the raw
 * messages since lastMemoryMessageIndex (the same "not yet summarized" boundary WeyPhone's own
 * memory system already tracks) — no separate cap, this selection is inherently bounded the same
 * way a memory-using conversation's own internal context already is.
 * @param {{memories?: Array<{pinned: boolean}>, messages: Array<any>, lastMemoryMessageIndex?: number}} conversation
 * @returns {{pinnedMemories: Array<any>, recentMessages: Array<any>}}
 */
export function selectInjectableContent(conversation) {
    const pinnedMemories = (conversation.memories || []).filter(m => m.pinned);
    const recentMessages = conversation.messages.slice(conversation.lastMemoryMessageIndex ?? 0);
    return { pinnedMemories, recentMessages };
}

/**
 * Converts a mainChatAnchor value into an IN_CHAT depth (messages back from the end of the main
 * chat) at injection time. A null anchor (unanchored — no main roleplay was active when the item
 * was created) falls back to depth 0 (immediately before the newest message) rather than being
 * dropped. Clamped at 0 so an anchor that's since become "newer than the current chat" (e.g. main
 * chat history was edited/trimmed after the anchor was recorded) never produces a negative depth.
 * @param {number | null} anchor
 * @param {number} currentMainChatLength
 * @returns {number}
 */
export function anchorToDepth(anchor, currentMainChatLength) {
    if (anchor === null || anchor === undefined) return 0;
    return Math.max(0, currentMainChatLength - anchor);
}

/**
 * Groups every tethered conversation's injectable items by the pair (conversationId, anchor) —
 * NOT anchor alone, since two different conversations sharing an anchor must still stay separate,
 * separately-labeled blocks (each names its own participant(s); merging conversations would blur
 * who the info-bleed caution's "specific character(s)" refers to).
 * @param {Array<{id: string, participants: string[], memories?: Array<any>, messages: Array<any>, lastMemoryMessageIndex?: number}>} tetheredConversations
 * @returns {Array<{conversationId: string, participants: string[], anchor: number | null, memories: Array<any>, messages: Array<any>}>}
 */
export function groupInjectableItemsByAnchor(tetheredConversations) {
    const groups = new Map();
    function groupFor(conversation, anchor) {
        const key = `${conversation.id}::${anchor}`;
        if (!groups.has(key)) {
            groups.set(key, {
                conversationId: conversation.id,
                participants: conversation.participants,
                anchor,
                memories: [],
                messages: [],
            });
        }
        return groups.get(key);
    }
    for (const conversation of tetheredConversations) {
        const { pinnedMemories, recentMessages } = selectInjectableContent(conversation);
        for (const memory of pinnedMemories) {
            groupFor(conversation, memory.mainChatAnchor ?? null).memories.push(memory);
        }
        for (const message of recentMessages) {
            groupFor(conversation, message.mainChatAnchor ?? null).messages.push(message);
        }
    }
    return [...groups.values()];
}

/**
 * Renders one group's memories + raw messages into the "[TEXT MESSAGES — participants]...[END TEXT
 * MESSAGES]" block. Memory content is tagged as "(a memory of an earlier exchange): ..." so the
 * model knows it's a compressed summary, not a verbatim transcript — memories render first
 * (they represent older, already-summarized content), then raw messages.
 * @param {{participants: string[], memories: Array<{content: string}>, messages: Array<any>}} group
 * @param {{userName: string, formatClockTime: (epochMs: number) => string}} options
 * @returns {string}
 */
function formatGroupBlock(group, { userName, formatClockTime }) {
    const participantLabel = group.participants.join(', ');
    const memoryLines = group.memories.map(m => `(a memory of an earlier exchange): ${m.content}`);
    const reconstructed = reconstructHistoryAsPhoneFormat(group.messages, { charName: participantLabel, userName }, formatClockTime);
    const messageLines = reconstructed.map(m => m.content);
    const body = [...memoryLines, ...messageLines].join('\n');
    return `[TEXT MESSAGES — ${participantLabel}]\n${body}\n[END TEXT MESSAGES]`;
}

/**
 * Builds the full injection plan for one main-chat generation: the shared caution block (null if
 * there's nothing to inject at all) plus one keyed, depth-positioned block per (conversation,
 * anchor) group. This is the only function index.js's generate_interceptor needs to call.
 * @param {{tetheredConversations: Array<any>, currentMainChatLength: number, userName: string, formatClockTime: (epochMs: number) => string}} options
 * @returns {{cautionBlock: string | null, groups: Array<{key: string, depth: number, content: string}>}}
 */
export function buildMainChatInjectionPlan({ tetheredConversations, currentMainChatLength, userName, formatClockTime }) {
    const groups = groupInjectableItemsByAnchor(tetheredConversations)
        .filter(g => g.memories.length > 0 || g.messages.length > 0);
    if (groups.length === 0) {
        return { cautionBlock: null, groups: [] };
    }
    const builtGroups = groups.map(g => ({
        key: `weyphone_tether_${g.conversationId}_${g.anchor === null ? 'unanchored' : g.anchor}`,
        depth: anchorToDepth(g.anchor, currentMainChatLength),
        content: formatGroupBlock(g, { userName, formatClockTime }),
    }));
    return { cautionBlock: TETHER_CAUTION_BLOCK, groups: builtGroups };
}
