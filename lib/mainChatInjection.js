// lib/mainChatInjection.js
import { reconstructHistoryAsPhoneFormat } from './generation.js';
import { formatParticipantNames } from './participants.js';

/**
 * The shared, single-instance info-bleed caution — injected once per generation whenever there's
 * any tethered content to inject at all, never repeated per group (keeps token cost down).
 */
export const TETHER_CAUTION_BLOCK = `[TETHERED TEXTS — INFO-BLEED CAUTION]
Some of {{user}}'s messages below may include a brief narrated aside (in asterisks) about
exchanging text messages with someone, followed by the actual texts. Treat these exactly like any
other text-messaging exchange in this story. ONLY {{user}} and whoever is named in that aside are
aware of that exchange — no other character has any knowledge of it unless told about it in-story.
Do not have an uninvolved character reference, react to, or otherwise reveal awareness of a text
exchange they weren't part of.
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
 * Renders one group's memories + raw messages as content for a role:USER extension-prompt message
 * (see index.js's weyPhoneMainChatInterceptor) — delivered this way, rather than as a bracketed
 * system-role block, so it reads to the model as {{user}} themselves casually relaying something,
 * not a foreign mid-conversation system intrusion (confirmed via live testing that a bare system
 * message in this position gets refused/called out by name, regardless of content).
 *
 * Leads with a single asterisk-narration line (the platform's own established story-narration
 * convention — the model already knows asterisk-wrapped text is narration) naming the
 * participant(s) via the shared formatParticipantNames helper (lib/participants.js — the same
 * "A & B"/"A, B & C" convention used for group-conversation naming elsewhere), then any pinned
 * memories wrapped in the REAL, CURRENT Weyland-LTM [MEMORY ENTRY]/[END MEMORY ENTRY] bracket
 * convention (confirmed via direct inspection of live Weyland-LTM code/data that current, non-legacy
 * LTM entries carry no separate explanatory preamble — just this bracket pair — so reusing it here
 * means the model isn't learning a new way to read memories), then the raw Incoming/Outgoing lines
 * unchanged. Memories render first (older, already-summarized content), then raw messages.
 * @param {{participants: string[], memories: Array<{content: string}>, messages: Array<any>}} group
 * @param {{userName: string, formatClockTime: (epochMs: number) => string}} options
 * @returns {string}
 */
function formatGroupBlock(group, { userName, formatClockTime }) {
    const participantLabel = formatParticipantNames(group.participants);
    const narration = `*I take a moment to exchange some text messages with ${participantLabel}.*`;
    const memoryLines = group.memories.map(m => `[MEMORY ENTRY]\n${m.content}\n[END MEMORY ENTRY]`);
    const reconstructed = reconstructHistoryAsPhoneFormat(group.messages, { charName: participantLabel, userName }, formatClockTime);
    const messageLines = reconstructed.map(m => m.content);
    return [narration, ...memoryLines, ...messageLines].join('\n');
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

/**
 * Reconciles an injection plan against the set of extension-prompt keys this feature set on the
 * previous generation, producing the exact ordered list of setExtensionPrompt operations to apply
 * this generation plus the new key set to remember. Crucially, EVERY previously-set key that is not
 * in the new plan is emitted as an explicit clear op — so an empty plan (feature turned off, or no
 * main roleplay active) fully tears down whatever was injected before, rather than leaving stale
 * blocks lingering in SillyTavern's extension_prompts. The caller stays free of the "which paths
 * skip cleanup" trap by never early-returning: it always runs this and applies whatever ops come
 * back (including, for an empty plan, only clears).
 * @param {{cautionBlock: string | null, groups: Array<{key: string, depth: number, content: string}>}} plan
 * @param {Set<string>} previousKeys keys set on the prior generation (weyPhoneTetherExtensionPromptKeys)
 * @param {{cautionKey: string, positionInPrompt: number, positionInChat: number, positionNone: number, roleSystem: number, roleUser: number}} positions
 * @returns {{ops: Array<{key: string, content: string, position: number, depth: number, role: number}>, nextKeys: Set<string>}}
 */
export function planTetherExtensionPromptOps(plan, previousKeys, { cautionKey, positionInPrompt, positionInChat, positionNone, roleSystem, roleUser }) {
    const ops = [];
    const nextKeys = new Set();
    if (plan.cautionBlock) {
        ops.push({ key: cautionKey, content: plan.cautionBlock, position: positionInPrompt, depth: 0, role: roleSystem });
        nextKeys.add(cautionKey);
    }
    for (const group of plan.groups) {
        ops.push({ key: group.key, content: group.content, position: positionInChat, depth: group.depth, role: roleUser });
        nextKeys.add(group.key);
    }
    for (const prev of previousKeys) {
        if (!nextKeys.has(prev)) {
            ops.push({ key: prev, content: '', position: positionNone, depth: 0, role: roleSystem });
        }
    }
    return { ops, nextKeys };
}
