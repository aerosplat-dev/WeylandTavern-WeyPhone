import { MODULE_NAME, getSettings } from './lib/config.js';
import { EXCLUDED_CHARACTER_NAMES } from './lib/characters.js';
import { resolveMasterPrompt, resolvePostHistoryInstructions, resolvePersonalityText, applySpecialCase } from './lib/promptResolution.js';
import { resolveWorldInfoTethered, resolveWorldInfoUntethered } from './lib/worldInfo.js';
import { createConversation, getConversation, appendMessage, editMessage, deleteMessage, deleteMessages, deleteConversation, getAllConversationSummaries, genTimestamp, discardTrailingReply, createMemory, editMemory, deleteMemory, setMemoryPinned, getPinnedMemories, setMemorySettings, countExchangesSince, getMemoryWindow, getLastGeneratedMemory, setTetheredSettings, getThreadsFor } from './lib/storage.js';
import { buildSystemPrompt, buildGroupSystemPrompt, buildMessages, resolveProfileId, resolveModelOverride, sendMessage, reconstructHistoryAsPhoneFormat, applyMacroSubstitution, joinNonEmptySections, extractResponseText } from './lib/generation.js';
import { createPanelMarkup, renderMessagesScreen, renderContactsScreen, renderConversationScreen, renderMessages, renderPanelAvatar, setRegenerateMenuItemsEnabled, renderMemoryScreen, populateConnectionProfileOptions, setTetheredToggleState, renderAppGridScreen, renderPhoneAppScreen, renderTwitterFollowingScreen, renderTwitterProfileScreen, renderTwitterFeedScreen, renderHousingScreen, setRegistrarToggleState } from './lib/panel.js';
import { formatRelativeTime, formatClockTime } from './lib/formatTime.js';
import { withTypingState } from './lib/generationTracking.js';
import { buildPortraitMap, buildPsaPortraitMap } from './lib/portraits.js';
import { formatParticipantNames } from './lib/participants.js';
import { parseReply, parseGroupReply } from './lib/messageParsing.js';
import { locatePhoneScopes, stripPhoneScopes } from './lib/hijackParsing.js';
import { shouldProcessHijackMessage, evaluateScope, planScopeCapture } from './lib/hijackRouting.js';
import { findMostRecentAssistantMessage } from './lib/hijackManual.js';
import { TEXTING_MODE_INSTRUCTIONS } from './lib/textingModeInstructions.js';
import { buildMemoryGenerationMessages, joinMemoriesForInjection, sendMemoryRequest } from './lib/memoryGeneration.js';
import { isMainRoleplayActive, resolveMainActiveLtmEntries, resolveMainHistorySlice, formatMainHistoryTranscript, buildTetheredViewBlock, convertMainChatToMessages, buildScanHistoryWithExtraText } from './lib/tetheredContext.js';
import { resolveMainChatAnchor } from './lib/mainChatAnchor.js';
import { buildMainChatInjectionPlan, planTetherExtensionPromptOps } from './lib/mainChatInjection.js';
import { PHONE_APP_PROMPTS } from './lib/phoneAppPrompts.js';
import { getPhoneAppContent, setPhoneAppContent } from './lib/phoneApps.js';
import { parsePhoneAppOutput } from './lib/phoneAppFormatting.js';
import { parseTwitterPosts } from './lib/twitterParsing.js';
import { PSA_ACCOUNTS } from './lib/twitterPrompts.js';
import { WEYLAND_ROSTER, TWITTER_ONLY_ROSTER } from './lib/weylandRoster.js';
import { buildTwitterPrompt } from './lib/twitterPrompts.js';
import { buildCastRoster } from './lib/castRoster.js';
import { resolveSubbotPersonality } from './lib/subbotContent.js';
import { parseNicknameTags, validateNicknamePools, BUILT_IN_USER_NICKNAMES } from './lib/nicknames.js';
// Root-relative (leading "/"), NOT relative to this file's own location — quick-reply-ext is a
// bundled core-adjacent extension that always lives at this fixed, SillyTavern-convention-dictated
// URL (public/scripts/extensions/quick-reply-ext/), regardless of where WeyPhone itself is
// installed. A relative specifier here (e.g. '../../quick-reply-ext/...') would resolve differently
// depending on how many directory levels WeyPhone's own install sits under /scripts/extensions/ —
// confirmed broken for a bundled-style install (public/scripts/extensions/Weyland-WeyPhone/, no
// "third-party" segment), which has one fewer level than a third-party install and would resolve
// one directory too high. This import is never exercised by the Node test suite (index.js is only
// ever loaded by the real browser via SillyTavern's own <script type="module"> injection), so a
// browser-only absolute path is safe here.
import { ravs } from '/scripts/extensions/quick-reply-ext/src/rav.js';
import { charPer } from '/scripts/extensions/quick-reply-ext/src/charper.js';
// Core SillyTavern global (public/scripts/openai.js). Absolute browser path, same convention as the
// quick-reply-ext imports above — never exercised by the Node test suite (index.js is browser-only).
// Used only to force streaming off when Hijack is enabled (the parser needs a fully settled mes),
// mirroring Weyland-Formatter's own precedent against this same shared global.
import { oai_settings } from '/scripts/openai.js';
// Not yet consumed by this task's own code — imported here per the Task 6 brief as the real
// (non-mirror) subbot content source a later task (7/8) will read from when rendering an actual
// subbot conversation. Kept as a plain import for now rather than adding a currently-dead call site.
import strings from '/scripts/extensions/quick-reply-ext/src/strings.js';

// One of the 11 data-view values showScreen() sets on #wp-panel:
// 'home' | 'contacts' | 'conversation' | 'memory' | 'messages' | 'threads' | 'phone-app' |
// 'twitter-feed' | 'twitter-following' | 'twitter-profile' | 'housing'
let currentView = 'home';
let currentConversationId = null;
let currentPhoneApp = null; // 'chronicle' | 'discord' | 'yikyak' | null
let currentTwitterProfileCharacter = null;
let currentThreadsFilter = null; // participants string[] — set when entering the 'threads' view
let groupSelectionMode = false; // true while the New Message screen is in group-selection mode
// Single-slot undo cache for the manual "Undo Last Capture" tool (Task 2) — populated by
// runHijackCaptureForMessage on every successful capture (automatic or manual), cleared by Undo.
// Session-only (an in-memory object, like currentView/currentConversationId) — resets on reload,
// which is acceptable since object-identity-based removal wouldn't survive a reload anyway.
let lastCaptureSnapshot = null;
let groupSelectionNames = []; // entryNames checked so far in group selection mode
let contactSearchQuery = ''; // raw text currently in #wp-contact-search-input

// Desktop-only per-view panel sizes the user has manually resized to, via the SAME drag handles
// initPanelResize always used — recorded on drag-end (see endResize there), applied on entering
// that view again (see showScreen below), so resizing while on one app never bleeds into another's
// size. Session-only (an in-memory Map, like currentView/currentConversationId above) — resets on
// page reload, same as every other piece of UI state tracked this way in this file.
//
// 'home' deliberately never participates: it's permanently locked to HOME_PANEL_SIZE below (see
// showScreen), not remembered or resizable-and-kept the way every other view is.
const viewPanelSizes = new Map();
const HOME_PANEL_SIZE = { width: 360, height: 466 };

const PHONE_APP_LABELS = { chronicle: 'The Chronicle', discord: 'Discord', yikyak: 'Yik Yak' };
const phoneAppGeneratingIds = new Set(); // tracks which app keys currently have a generation in flight

// Cast roster discovery runs once per browser session (see the jQuery(async () => {...}) init
// block at the bottom of this file) — cached here so every later call (opening "New Message",
// composing a group) reuses the same in-memory result rather than re-fetching/re-scanning.
// A Promise (not a plain array) so callers that run before the initial fetch resolves still get
// the real result once it's ready, instead of racing ahead with an empty list.
let castRosterPromise = null;

// SillyTavern's own internal extension-prompt position enum (public/script.js's
// extension_prompt_types) — not exposed as named constants on context, so mirrored here with the
// same numeric values, confirmed against the real source during this feature's design.
const EXTENSION_PROMPT_POSITION_IN_PROMPT = 0;
const EXTENSION_PROMPT_POSITION_IN_CHAT = 1;
const EXTENSION_PROMPT_POSITION_NONE = -1;
// SillyTavern's own internal extension-prompt role enum (public/script.js's extension_prompt_roles)
// — same rationale as the position constants above: mirrored here since it's not exposed as named
// constants on context. SYSTEM stays the caution block's role (it lives in the persistent,
// already-trusted system-prompt-adjacent slot); USER is for each group's actual texted content, so
// it reads as {{user}} casually relaying something rather than a foreign mid-conversation system
// intrusion — see this feature's injection-framing-fix design doc.
const EXTENSION_PROMPT_ROLE_SYSTEM = 0;
const EXTENSION_PROMPT_ROLE_USER = 1;
const WEYPHONE_TETHER_CAUTION_KEY = 'weyphone_tether_caution';

// Tracks which extension-prompt keys THIS interceptor set on the previous turn, so a key that's no
// longer part of this turn's computed plan (e.g. a conversation was untethered, or its content was
// summarized into a memory with a different anchor) gets explicitly cleared rather than lingering
// with stale content indefinitely — extension_prompts is a plain global keyed by these strings and
// nothing else clears them on our behalf between turns.
let weyPhoneTetherExtensionPromptKeys = new Set();

// Populated (keyed by entryName) as soon as castRosterPromise resolves — a synchronously-readable
// snapshot for the many buildPortraitMap call sites below, which run synchronously inside render
// functions and can't themselves await the roster fetch. Empty until the first resolution; every
// buildPortraitMap call site degrades gracefully to its own name-derived guess for any name not
// (yet) present here, same as before this override existed.
let castRosterPortraitSlugs = {};

// Synchronously-readable snapshot of the FULL resolved roster (not just portrait slugs) — populated
// the moment castRosterPromise resolves, same lifecycle as castRosterPortraitSlugs above. The
// MESSAGE_RECEIVED hijack handler must be fully synchronous (it can't await, or Weyland-Formatter's
// own later-registered handler could read chat[messageId].mes before the strip lands), so it reads
// this snapshot instead of awaiting getCastRoster(). Empty until first resolution — a hijack-bearing
// message arriving before the fetch completes is a graceful no-op (nothing resolves, block untouched).
let castRosterEntries = [];

/**
 * Fetches cast.weybooru.com's live character catalog and cross-references it against the Weyland
 * lorebook (via context.loadWorldInfo) and charPer.js (already imported in this file) to build the
 * complete subbot/full-bot contact roster. Real I/O lives here; buildCastRoster itself (imported
 * above) is pure and independently unit-tested — see lib/castRoster.js.
 * @param {ReturnType<typeof SillyTavern.getContext>} context
 * @returns {Promise<Array<{fullName: string, entryName: string, macroKey: string | null, hasFullBot: boolean, hasSubbot: boolean, portraitSlug: string}>>}
 */
async function fetchCastRoster(context) {
    const response = await fetch('https://cast.weybooru.com/data/data.json');
    const data = await response.json();
    const characterEntry = (data.values || []).find(([key]) => key === 'character');
    const weybooruCharacters = characterEntry ? characterEntry[1] : {};

    const weylandBook = await context.loadWorldInfo('Weyland');
    const weylandEntries = weylandBook && weylandBook.entries ? Object.values(weylandBook.entries) : [];

    return buildCastRoster({
        weybooruCharacters,
        weylandEntries,
        charPerKeys: [...charPer.keys()],
        excludedEntryNames: EXCLUDED_CHARACTER_NAMES,
        // Loona and Kressa have real full-bots (charPer.js) but are tagged "No Subbot" in
        // weybooru's own data, so the normal discovery loop above never finds them. They're
        // wanted back as ordinary 1-on-1 contacts (greyed out/unselectable in Group Chat mode,
        // since they have no subbot content) — see the milestone-9-revision design spec. Aethel
        // has the same "No Subbot" gap but is deliberately NOT included here per explicit
        // direction (reserved for a different, unrelated future use elsewhere in the platform).
        manualFullBotOnlyNames: ['Loona', 'Kressa'],
    });
}

/**
 * Returns the cached cast roster, fetching it on first call only. Never throws — a fetch/parse
 * failure resolves to an empty array (logged via this module's own log()) so a network hiccup
 * degrades to "no contacts found" rather than breaking the whole extension.
 * @returns {Promise<Array<{fullName: string, entryName: string, macroKey: string, hasFullBot: boolean, portraitSlug: string}>>}
 */
function getCastRoster() {
    if (!castRosterPromise) {
        const context = SillyTavern.getContext();
        castRosterPromise = fetchCastRoster(context).catch(error => {
            log('Cast roster discovery failed:', error);
            return [];
        }).then(roster => {
            for (const contact of roster) castRosterPortraitSlugs[contact.entryName] = contact.portraitSlug;
            castRosterEntries = roster;
            return roster;
        });
    }
    return castRosterPromise;
}
// Flavor-app generation inherits the main roleplay's REAL system prompt (see runFlavorAppGeneration
// below), which mandates the platform's own multi-section <analysis> block before any actual reply
// content — unlike a normal WeyPhone texting turn, this isn't optional or skippable output, so the
// completion budget has to cover the analysis block AND the app content itself. runFlavorAppGeneration
// reads the user's live main-chat response-length setting (context.chatCompletionSettings.openai_max_tokens)
// instead, so the budget always matches what a real roleplay turn gets; this is only the fallback for
// the (not normally reachable) case where that setting is unset/unreadable.
const DEFAULT_PHONE_APP_MAX_TOKENS = 5000;
// Unlike a WeyPhone conversation's own tetheredHistoryCap (per-conversation, user-configurable,
// defaults to uncapped), flavor-app generation had NO cap at all on how much of the main
// roleplay's real history it includes as literal message history — every refresh sent the ENTIRE
// chat, unbounded, regardless of how long the roleplay had grown. Confirmed live: with a real
// 113-message main chat, this alone pushed a single generation to ~80,000 tokens and past
// HelixMind's own ceiling, failing every flavor-app refresh outright ("Input exceeds maximum token
// limit"). Capped to the most recent messages via the same resolveMainHistorySlice machinery
// Messages already uses, rather than truly uncapped.
const FLAVOR_APP_HISTORY_CAP = 50;
let editingMessageIndex = -1;
let editingMemoryId = null;
let selectMode = false;
const selectedMessageIndices = new Set();
const generatingConversationIds = new Set();
// Separate, deliberately invisible tracking for the background memory-summarization job — never
// touches generatingConversationIds, never shows a typing indicator, never disables Regenerate.
const memoryGeneratingConversationIds = new Set();

// WeyPhone has no user-facing max-tokens setting yet (milestone 1), so this is a fixed default
// passed to ConnectionManagerRequestService.sendRequest's required maxTokens argument. 1024 is
// still just a placeholder chosen to avoid visibly truncating conversational replies mid-
// sentence — not a final tuned value; replace once a real user-facing setting exists.
const DEFAULT_MAX_TOKENS = 1024;
// Memory entries are meant to be short (2-4 sentences) — a much smaller cap than regular replies.
const DEFAULT_MEMORY_MAX_TOKENS = 256;

/**
 * Resolves the character record generateReply/generateMemory need for a WeyPhone conversation —
 * a plain context.characters lookup by name.
 * @param {{characters: Array<{name: string}>}} context
 * @param {string} charName
 * @returns {{name: string, avatar: string|null} | undefined}
 */
function resolveConversationCharacter(context, charName) {
    return context.characters.find(c => c.name === charName);
}

/**
 * True if entryName has a real charPer.js entry (i.e. is eligible for the full-bot generation
 * path) — used to decide, for a SOLO conversation only, whether to use resolveCharacterPrompt's
 * existing full-bot path or the new subbot path below. Group conversations never call this; they
 * always use the subbot path for every participant (see Task 9).
 * @param {string} entryName
 * @returns {boolean}
 */
function hasFullBotEntry(entryName) {
    return charPer.has(entryName);
}

/**
 * Builds the same {systemPrompt, postHistory, personalityText, descriptionText} shape
 * resolveCharacterPrompt produces, but sourced from the subbot content pipeline
 * (lib/subbotContent.js reading quick-reply-ext/src/strings.js) instead of charPer.js/a real
 * character card — used for any conversation participant with no full-bot entry. `macroKey` comes
 * from the cast roster entry matched during discovery (lib/castRoster.js).
 * @param {ReturnType<typeof SillyTavern.getContext>} context
 * @param {string} macroKey
 * @returns {Promise<{systemPrompt: string, postHistory: string, personalityText: string, descriptionText: string}>}
 */
async function resolveSubbotPrompt(context, macroKey) {
    const promptChoice = context.variables.global.get('PromptChoice') || 'Current Prompt';
    const ravEntry = resolveMasterPrompt(ravs, promptChoice);
    const htmlEnabled = context.variables.global.get('HTML!') === 'Enabled';
    const rpFocus = context.variables.global.get('RPFocus') || '';
    const postHistory = resolvePostHistoryInstructions(ravEntry, { htmlEnabled, rpFocus });
    const personalityText = resolveSubbotPersonality(strings, macroKey);
    return {
        systemPrompt: ravEntry.teg,
        postHistory,
        personalityText,
        descriptionText: '',
    };
}

function log(...args) {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    if (settings.debug) {
        console.debug(`[${MODULE_NAME}]`, ...args);
    }
}

async function resolveCharacterPrompt(context, character) {
    const promptChoice = context.variables.global.get('PromptChoice') || 'Current Prompt';
    const ravEntry = resolveMasterPrompt(ravs, promptChoice);
    const htmlEnabled = context.variables.global.get('HTML!') === 'Enabled';
    const rpFocus = context.variables.global.get('RPFocus') || '';
    const postHistory = resolvePostHistoryInstructions(ravEntry, { htmlEnabled, rpFocus });

    const personalityConfig = charPer.get(character.name);
    if (!personalityConfig) {
        throw new Error(`No personality data found for "${character.name}" in charper.js`);
    }
    const basePersonality = resolvePersonalityText(personalityConfig);
    const personalityText = applySpecialCase(character.name, basePersonality, {});

    return {
        systemPrompt: ravEntry.teg,
        postHistory,
        personalityText,
        descriptionText: character.description ?? '',
    };
}

async function resolveWorldInfo(context, history) {
    const personaLorebookName = context.powerUserSettings?.persona_description_lorebook || '';
    return resolveWorldInfoUntethered({
        loadWorldInfo: context.loadWorldInfo,
        history,
        personaLorebookName,
    });
}

// Assembles the [TETHERED VIEW] block from the CURRENTLY active main roleplay, read live at
// generation time (no caching, no snapshot-on-toggle) — if the user switches which main chat is
// open between two WeyPhone sends, the next tethered reply reflects whatever is active NOW.
// Returns '' (not an error) whenever there's nothing to tether to, mirroring
// resolveMainActiveLtmEntries's own "no book bound yet" behavior — this function must never throw,
// since generateReply has no separate error path for "tethered assembly failed" vs "the whole
// reply failed."
async function buildTetheredContext(context, conversation) {
    if (!conversation.tethered) return '';
    if (!isMainRoleplayActive({ characterId: context.characterId, groupId: context.groupId })) return '';

    const worldInfo = await resolveWorldInfoTetheredForMainChat(context);

    const ltmSettings = context.extensionSettings['Weyland-LTM'];
    const lastLtmMessageId = ltmSettings?.__chatState?.[context.chatId]?.lastLtmMessageId ?? -1;
    const ltmEntries = await resolveMainActiveLtmEntries({
        loadWorldInfo: context.loadWorldInfo,
        chatMetadata: context.chatMetadata,
        chatId: context.chatId,
    });

    const historySlice = resolveMainHistorySlice({
        chat: context.chat,
        lastLtmMessageId,
        historyCap: conversation.tetheredHistoryCap,
    });
    const historyTranscript = formatMainHistoryTranscript(historySlice);

    return buildTetheredViewBlock({ worldInfoText: worldInfo, ltmEntries, historyTranscript });
}

// Scans World Info against the MAIN chat's own history (not WeyPhone's texting history) — this is
// the one-line fix to what tethered mode has actually meant since milestone 1: it already used
// the real getWorldInfoPrompt engine, but scanned it against the wrong conversation.
//
// Passes context.chatMetadata through to resolveWorldInfoTethered so it can snapshot/restore
// chatMetadata.timedWorldInfo tightly around the scan — see lib/worldInfo.js for why this is
// needed: a real (non-dry-run) WI scan against a synthetic history still writes real sticky/
// cooldown bookkeeping onto the shared main-chat chatMetadata object.
//
// `extraScanText` (Task 9) is optional extra text — e.g. a phone app's own fixed prompt text —
// appended as one more synthetic entry to a brand-new scan array via
// buildScanHistoryWithExtraText, so it gets a chance to trigger real WI retrieval alongside the
// real chat history, exactly mirroring how the real !Phone command's own fixed prompt text
// already does this. Never mutates mainHistory or context.chat — see buildScanHistoryWithExtraText.
async function resolveWorldInfoTetheredForMainChat(context, extraScanText) {
    try {
        const mainHistory = convertMainChatToMessages(context.chat);
        const scanHistory = buildScanHistoryWithExtraText(mainHistory, extraScanText);
        const result = await resolveWorldInfoTethered({
            getWorldInfoPrompt: context.getWorldInfoPrompt,
            history: scanHistory,
            maxContext: context.maxContext ?? 4096,
            chatMetadata: context.chatMetadata,
        });
        return [result.worldInfoBefore, result.worldInfoAfter].filter(Boolean).join('\n\n');
    } catch {
        return '';
    }
}

function updateRegenerateEnabled(conversation) {
    const menu = document.getElementById('wp-regenerate-menu');
    if (!menu) return;
    const isGenerating = generatingConversationIds.has(currentConversationId);
    const messages = conversation.messages;
    // A conversation ending on an unanswered user message (e.g. the last generation attempt
    // failed before any reply was ever appended) has nothing for discardTrailingReply to trim,
    // but there's still a real, unanswered attempt worth retrying — handleRegenerate below
    // special-cases this same condition to skip straight to generateReply.
    const endsOnPendingUserMessage = messages.length > 0 && messages[messages.length - 1].role === 'user';
    let cutIndex = messages.length;
    while (cutIndex > 0 && messages[cutIndex - 1].role === 'assistant') cutIndex--;
    const hasTrailingReplyToDiscard = cutIndex > 0 && cutIndex < messages.length;
    const hasRegeneratable = endsOnPendingUserMessage || hasTrailingReplyToDiscard;
    setRegenerateMenuItemsEnabled(menu, { canRegenerate: hasRegeneratable && !isGenerating, hasMessages: messages.length > 0 });
}

function getSelectState() {
    return { active: selectMode, selectedIndices: selectedMessageIndices };
}

function rerenderConversationMessages() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const conversation = getConversation(settings, currentConversationId);
    if (!conversation) return;
    const isTyping = generatingConversationIds.has(currentConversationId);
    const isGroup = conversation.participants.length > 1;
    const groupPortraitMap = isGroup ? buildPortraitMap(context.characters, conversation.participants, context.getThumbnailUrl, castRosterPortraitSlugs) : {};
    renderMessages(document.getElementById('wp-messages'), conversation.messages, editingMessageIndex, isTyping, getSelectState(), { isGroup, portraitMap: groupPortraitMap });
    updateRegenerateEnabled(conversation);
}

// Re-renders the conversation view for `conversationId` only if the panel is still showing that
// exact conversation. Callers invoke this after an await (e.g. generateReply's own generation
// wait), by which point the user may have navigated away or deleted the conversation — so
// #wp-messages may no longer exist, or may belong to a different conversation entirely. Both cases
// are guarded here, making this a no-op rather than rendering into the wrong screen.
function rerenderIfStillViewing(conversationId, messages) {
    if (currentView !== 'conversation' || currentConversationId !== conversationId) return;
    const messagesEl = document.getElementById('wp-messages');
    if (!messagesEl) return;
    const isTyping = generatingConversationIds.has(conversationId);
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const conversation = getConversation(settings, conversationId);
    const isGroup = Boolean(conversation) && conversation.participants.length > 1;
    const groupPortraitMap = isGroup ? buildPortraitMap(context.characters, conversation.participants, context.getThumbnailUrl, castRosterPortraitSlugs) : {};
    renderMessages(messagesEl, messages, editingMessageIndex, isTyping, getSelectState(), { isGroup, portraitMap: groupPortraitMap });
    if (conversation) updateRegenerateEnabled(conversation);
}

// Toggles between the normal #wp-input-row and the #wp-select-actions bar, and (while active)
// keeps the selected-count label and Delete button's disabled state in sync. Called after every
// selection change and on entering/exiting select mode.
function updateSelectModeUI() {
    const inputRow = document.getElementById('wp-input-row');
    const selectActions = document.getElementById('wp-select-actions');
    if (inputRow) inputRow.hidden = selectMode;
    if (selectActions) selectActions.hidden = !selectMode;
    if (selectMode) {
        const countEl = document.getElementById('wp-select-count');
        const deleteBtn = document.getElementById('wp-select-delete');
        if (countEl) countEl.textContent = `${selectedMessageIndices.size} selected`;
        if (deleteBtn) deleteBtn.disabled = selectedMessageIndices.size === 0;
    }
    rerenderConversationMessages();
}

// Shared by showScreen('messages') and refreshVisibleScreen()'s messages branch — builds the
// conversation list's typing-decorated summaries and charName->portrait map, then renders.
function renderMessagesScreenNow(context, settings) {
    const screenBody = document.getElementById('wp-screen-body');
    if (!screenBody) return;
    const summaries = withTypingState(getAllConversationSummaries(settings), generatingConversationIds);
    const allParticipantNames = summaries.flatMap(summary => summary.participants);
    const portraitMap = buildPortraitMap(context.characters, allParticipantNames, context.getThumbnailUrl, castRosterPortraitSlugs);
    renderMessagesScreen(screenBody, summaries, formatRelativeTime, portraitMap);
}

// Shared by showScreen('threads') and refreshVisibleScreen()'s threads branch — builds the filtered
// thread list's typing-decorated summaries and charName->portrait map, then renders. Returns the
// portraitMap (unlike renderMessagesScreenNow) so showScreen can reuse it for the panel avatar.
function renderThreadsScreenNow(context, settings) {
    const screenBody = document.getElementById('wp-screen-body');
    if (!screenBody) return null;
    const summaries = withTypingState(getThreadsFor(settings, currentThreadsFilter ?? []), generatingConversationIds);
    const portraitMap = buildPortraitMap(context.characters, currentThreadsFilter ?? [], context.getThumbnailUrl, castRosterPortraitSlugs);
    renderMessagesScreen(screenBody, summaries, formatRelativeTime, portraitMap);
    return portraitMap;
}

// Shared core of runPhoneAppGeneration/runTwitterGeneration — both run (or re-run) a flavor app's
// generation entirely read-only against the main roleplay's real context: no mutation of
// context.chat anywhere in this function or anything it calls (every context.chat access below is
// a READ). It builds a request from data it reads (character fields, World Info text, a NEW array
// from convertMainChatToMessages) and sends it via ConnectionManagerRequestService, the same path
// WeyPhone's own texting Messages app already uses.
//
// This read-only design deliberately replaces a prior milestone's push/quiet-generate/pop
// mechanism, which caused a real incident: a synthetic message got permanently saved to a user's
// real chat file when SillyTavern's own autosave fired mid-generation, before the pop could run.
// There is no live-array window to race here at all — context.chat itself is never touched.
//
// trackingSet.add()/rerender() MUST stay inside this try block — this project's established
// stuck-lock bug class (a tracking-Set mutation placed before try, leaking a stuck entry if
// anything before try throws) applies here exactly the same way it does to
// generatingConversationIds/memoryGeneratingConversationIds elsewhere in this file.
//
// Callers parameterize only what actually differs between the phone-app and Twitter variants:
//   - trackingSet / trackingKey: the in-flight Set and its key (also reused as the content cache
//     key passed to setPhoneAppContent).
//   - rerender(): re-renders the currently-visible screen this generation is for.
//   - buildPromptText(): returns the user-message/WI-scan prompt string, or null to abort silently
//     after the caller has already surfaced its own error toast (Twitter's missing-roster case).
//   - parse(rawText): returns { content, usable } — the parsed payload plus whether it's non-empty.
//   - errorLabel: console.error label for the catch block.
async function runFlavorAppGeneration({ trackingSet, trackingKey, rerender, buildPromptText, parse, errorLabel }) {
    if (trackingSet.has(trackingKey)) return;
    const context = SillyTavern.getContext();
    if (!isMainRoleplayActive({ characterId: context.characterId, groupId: context.groupId })) {
        toastr.info('No active roleplay to pull content from right now.', 'WeyPhone');
        return;
    }

    try {
        trackingSet.add(trackingKey);
        rerender();

        const settings = getSettings(context.extensionSettings);
        const mainCharacter = context.characters[context.characterId];
        if (!mainCharacter) {
            toastr.info('No active roleplay to pull content from right now.', 'WeyPhone');
            return;
        }

        const promptText = buildPromptText();
        if (promptText === null) return; // buildPromptText already surfaced its own error toast

        const resolved = await resolveCharacterPrompt(context, mainCharacter);
        const worldInfoAfter = await resolveWorldInfoTetheredForMainChat(context, promptText);
        // Capped to the most recent messages (see FLAVOR_APP_HISTORY_CAP above) — the WI scan
        // itself (resolveWorldInfoTetheredForMainChat, just above) still sees the FULL history,
        // since that's self-limited by World Info's own entry budget already; only the raw
        // message-history payload sent as literal conversation turns needs bounding here.
        const historySlice = resolveMainHistorySlice({
            chat: context.chat,
            lastLtmMessageId: -1,
            historyCap: FLAVOR_APP_HISTORY_CAP,
        });
        const mainHistory = convertMainChatToMessages(historySlice);

        const systemPromptText = buildSystemPrompt({
            systemPrompt: resolved.systemPrompt,
            worldInfoBefore: '',
            descriptionText: resolved.descriptionText,
            personalityText: resolved.personalityText,
            scenarioText: '',
            worldInfoAfter,
        });

        const messages = buildMessages({
            systemPromptText,
            history: mainHistory,
            userMessage: promptText,
        });

        // Same real-macro resolution as generateReply's system prompt and generateMemory's
        // opening message — resolves {{user}}, {{getvar::...}}, etc. in both the system prompt
        // (which may carry macros via resolved.systemPrompt/personalityText) and the final user
        // message (promptText, which can embed real {{user}}/{{getvar::MCY-2}} tokens in its roster
        // content). Guarded against double-substituting the same string in the (not normally
        // reachable) case where buildMessages produced only one message total.
        const userName = context.name1 || 'User';
        messages[0].content = applyMacroSubstitution({
            substituteParams: context.substituteParams,
            content: messages[0].content,
            userName,
            charName: mainCharacter.name,
        });
        const lastMessage = messages[messages.length - 1];
        if (lastMessage !== messages[0]) {
            lastMessage.content = applyMacroSubstitution({
                substituteParams: context.substituteParams,
                content: lastMessage.content,
                userName,
                charName: mainCharacter.name,
            });
        }

        const activeProfileId = context.extensionSettings.connectionManager?.selectedProfile ?? '';
        const profileId = resolveProfileId(settings, activeProfileId);
        // Same budget the main roleplay itself generates with (context.chatCompletionSettings is
        // the live oai_settings object) — falls back to DEFAULT_PHONE_APP_MAX_TOKENS only if that
        // setting is ever unreadable, so this stays in lockstep with the user's own response-length
        // slider rather than drifting out of sync with a second hardcoded number.
        const maxTokens = context.chatCompletionSettings?.openai_max_tokens || DEFAULT_PHONE_APP_MAX_TOKENS;
        // Same live-model override generateReply uses (see its own call site's comment for the full
        // rationale): a Connection Profile's `model` field is a snapshot from whenever it was last
        // saved, not whatever's actually live/selected in SillyTavern's main chat completion settings
        // right now. Flavor apps are meant to track the live main-chat model exactly like Messages
        // does — omitting this was a real bug (flavor-app generation silently sent a stale/possibly
        // invalid saved model, causing provider-side request failures the Messages path never hit
        // since it already had this override). An explicit settings.modelId (WeyPhone's own
        // extension settings panel) overrides even this live-model tracking — see
        // resolveModelOverride's own docstring.
        const liveModel = context.getChatCompletionModel?.();
        const modelOverride = resolveModelOverride(settings, liveModel);
        const overridePayload = modelOverride ? { model: modelOverride } : undefined;
        const result = await sendMessage({
            sendRequest: (id, msgs) => context.ConnectionManagerRequestService.sendRequest(id, msgs, maxTokens, undefined, overridePayload),
            profileId,
            messages,
        });

        const rawText = extractResponseText(result);
        const { content, usable } = parse(rawText);
        if (!usable) {
            toastr.warning('The model did not return usable content this time.', 'WeyPhone');
            return;
        }

        setPhoneAppContent(settings, context.chatId, trackingKey, {
            content,
            generatedAt: Date.now(),
            chatMessageCountAtGeneration: context.chat.length,
        });
        context.saveSettingsDebounced();
    } catch (error) {
        console.error(`[${MODULE_NAME}] ${errorLabel}:`, error);
        toastr.error(error.message, 'WeyPhone');
    } finally {
        trackingSet.delete(trackingKey);
        rerender();
    }
}

function runPhoneAppGeneration(appKey) {
    return runFlavorAppGeneration({
        trackingSet: phoneAppGeneratingIds,
        trackingKey: appKey,
        rerender: () => rerenderPhoneAppScreenIfVisible(appKey),
        buildPromptText: () => PHONE_APP_PROMPTS[appKey],
        parse: (rawText) => {
            const parsed = parsePhoneAppOutput(rawText);
            return { content: parsed, usable: parsed.sections.length > 0 };
        },
        errorLabel: 'Phone app generation failed',
    });
}

// Re-renders the "New Message" contact list screen against the current in-memory group-selection
// and search state — guarded the same way as rerenderPhoneAppScreenIfVisible (the user may
// navigate away, or the async getCastRoster() fetch may resolve, after this was called from an
// event that's no longer relevant).
//
// renderContactsScreen replaces #wp-screen-body's ENTIRE innerHTML on every call, which destroys
// and recreates #wp-contact-search-input even though this runs on every keystroke (the 'input'
// listener below calls this on every character typed). Removing a focused element from the DOM
// blurs it, so without the explicit focus/caret restore here, typing more than one character would
// silently stop reaching the input after the first re-render — same class of bug as the old tag
// composer's #wp-to-input had (see this file's git history), fixed the same way here.
async function rerenderContactsScreen() {
    if (currentView !== 'contacts') return;
    const screenBody = document.getElementById('wp-screen-body');
    if (!screenBody) return;
    const roster = await getCastRoster();
    if (currentView !== 'contacts') return; // user may have navigated away while awaiting the roster
    const priorInput = document.getElementById('wp-contact-search-input');
    const hadFocus = !!priorInput && document.activeElement === priorInput;
    const priorSelectionStart = hadFocus ? priorInput.selectionStart : null;
    // #wp-contact-list is destroyed and recreated on every re-render too (same as the search
    // input above) — toggling a checkbox in group-selection mode triggers a re-render just like
    // typing does, so without restoring scrollTop here, checking a contact snaps the list back to
    // the top every time instead of staying where the user was scrolled to.
    const priorList = document.getElementById('wp-contact-list');
    const priorScrollTop = priorList ? priorList.scrollTop : 0;
    renderContactsScreen(screenBody, {
        roster,
        groupMode: groupSelectionMode,
        selectedEntryNames: groupSelectionNames,
        searchQuery: contactSearchQuery,
    });
    if (hadFocus) {
        const newInput = document.getElementById('wp-contact-search-input');
        if (newInput) {
            newInput.focus();
            const caretPos = priorSelectionStart ?? newInput.value.length;
            newInput.setSelectionRange(caretPos, caretPos);
        }
    }
    const newList = document.getElementById('wp-contact-list');
    if (newList) newList.scrollTop = priorScrollTop;
}

// Re-renders the currently-visible phone-app screen if the user is actually looking at the app
// this generation was for — mirrors rerenderIfStillViewing's guard for the same reason (the user
// may have navigated away during the generation wait).
function rerenderPhoneAppScreenIfVisible(appKey) {
    if (currentView !== 'phone-app' || currentPhoneApp !== appKey) return;
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const screenBody = document.getElementById('wp-screen-body');
    if (!screenBody) return;
    const entry = getPhoneAppContent(settings, context.chatId, appKey);
    renderPhoneAppScreen(screenBody, {
        appLabel: PHONE_APP_LABELS[appKey],
        entry,
        isGenerating: phoneAppGeneratingIds.has(appKey),
        formatRelativeTime,
    });
}

// Composite cache keys for Twitter — lib/phoneApps.js's getPhoneAppContent/setPhoneAppContent
// already take an opaque appKey string, so 'twitter' (feed) and 'twitter:profile:<Name>' (one
// per character) work with zero changes to that module. Each caches/goes-stale independently.
function twitterCacheKey(mode, characterName) {
    return mode === 'feed' ? 'twitter' : `twitter:profile:${characterName}`;
}

const twitterGeneratingKeys = new Set();

// A Twitter profile's subject is a roster character, a TWITTER_ONLY_ROSTER character (non-student
// accounts — see that array's own docstring for why they're kept separate from WEYLAND_ROSTER), or
// a PSA/business account (also on the Following list, as of the PSA-profile feature) — all are just
// {name, handle, ...} objects, so one name-keyed lookup across all three covers every case.
function findTwitterProfileSubject(name) {
    return WEYLAND_ROSTER.find(c => c.name === name) ?? TWITTER_ONLY_ROSTER.find(c => c.name === name) ?? PSA_ACCOUNTS.find(a => a.name === name);
}

// Every PSA/business account portrait is a fixed local asset (see lib/portraits.js's
// buildPsaPortraitMap) — cheap to build in full every time rather than filtering to just the
// names actually in view, and this guarantees a PSA account's local asset always wins over any
// (wrong) weybooru-CDN guess buildPortraitMap would otherwise attempt for that same name.
function buildTwitterPortraitMap(context, charNames) {
    return { ...buildPortraitMap(context.characters, charNames, context.getThumbnailUrl, castRosterPortraitSlugs), ...buildPsaPortraitMap(PSA_ACCOUNTS) };
}

/**
 * Twitter's equivalent of runPhoneAppGeneration, generalized for its two modes (main feed, or one
 * profile subject's page — a roster character or a PSA/business account). Shares
 * runFlavorAppGeneration's read-only mechanism and never-mutates-context.chat guarantee — the only
 * Twitter-specific pieces are building the prompt dynamically via buildTwitterPrompt (instead of a
 * static PHONE_APP_PROMPTS[appKey] lookup), parsing with parseTwitterPosts, and using a composite
 * cache key.
 * @param {'feed' | 'profile'} mode
 * @param {string} [subjectName] required when mode === 'profile'
 */
function runTwitterGeneration(mode, subjectName) {
    const cacheKey = twitterCacheKey(mode, subjectName);
    return runFlavorAppGeneration({
        trackingSet: twitterGeneratingKeys,
        trackingKey: cacheKey,
        rerender: () => rerenderTwitterScreenIfVisible(mode, subjectName),
        buildPromptText: () => {
            if (mode === 'profile') {
                const subject = findTwitterProfileSubject(subjectName);
                if (!subject) {
                    toastr.error(`No account found for "${subjectName}".`, 'WeyPhone');
                    return null;
                }
                return buildTwitterPrompt({ mode: 'profile', character: subject });
            }
            return buildTwitterPrompt({ mode: 'feed' });
        },
        parse: (rawText) => {
            const parsed = parseTwitterPosts(rawText, { roster: [...WEYLAND_ROSTER, ...TWITTER_ONLY_ROSTER], psaAccounts: PSA_ACCOUNTS });
            return { content: parsed, usable: parsed.posts.length > 0 };
        },
        errorLabel: 'Twitter generation failed',
    });
}

function rerenderTwitterScreenIfVisible(mode, subjectName) {
    const expectedView = mode === 'feed' ? 'twitter-feed' : 'twitter-profile';
    if (currentView !== expectedView) return;
    if (mode === 'profile' && currentTwitterProfileCharacter !== subjectName) return;
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const screenBody = document.getElementById('wp-screen-body');
    if (!screenBody) return;
    const cacheKey = twitterCacheKey(mode, subjectName);
    const entry = getPhoneAppContent(settings, context.chatId, cacheKey);
    const isGenerating = twitterGeneratingKeys.has(cacheKey);
    if (mode === 'feed') {
        const authorNames = (entry?.content?.posts ?? []).map(p => p.authorName);
        const portraitMap = buildTwitterPortraitMap(context, authorNames);
        renderTwitterFeedScreen(screenBody, { entry, isGenerating, formatRelativeTime, portraitMap });
    } else {
        renderTwitterProfileScreen(screenBody, {
            character: findTwitterProfileSubject(subjectName),
            portraitMap: buildTwitterPortraitMap(context, [subjectName]),
            entry,
            isGenerating,
            formatRelativeTime,
        });
    }
}

// Re-renders whichever screen is currently visible, reflecting the latest generatingConversationIds
// state — called whenever that set changes (a generation starts, finishes, or errors). This is how
// a conversation's typing state updates live on the Home list even when a DIFFERENT conversation's
// generation is the one that just started/finished, and how the Conversation view picks up its own
// typing bubble without a full showScreen() reload.
function refreshVisibleScreen() {
    if (currentView === 'messages') {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        renderMessagesScreenNow(context, settings);
        return;
    }
    if (currentView === 'threads') {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        renderThreadsScreenNow(context, settings);
        return;
    }
    if (currentView === 'conversation' && currentConversationId) {
        rerenderConversationMessages();
    }
}

// True only when `conversationId` is the conversation currently shown in the conversation view AND
// its message list is scrolled to (within 4px of) the bottom — the exact "user is watching new
// arrivals" condition under which an appended assistant message should NOT count as unread.
function isConversationOpenAtBottom(conversationId) {
    if (currentView !== 'conversation' || currentConversationId !== conversationId) return false;
    const el = document.getElementById('wp-messages');
    if (!el) return false;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 4;
}

// Generic unread accrual for an assistant-message append: if the user is actively watching the
// bottom of this exact thread, it's already "read" (clear to 0); otherwise add the increment. Call
// this AFTER any re-render of the conversation view (a re-render force-scrolls to the bottom, so the
// at-bottom check reflects the final state). Not Hijack-specific — every assistant-append site uses it.
function accrueUnread(settings, conversationId, incrementCount) {
    const conversation = getConversation(settings, conversationId);
    if (!conversation) return;
    if (isConversationOpenAtBottom(conversationId)) {
        conversation.unreadCount = 0;
    } else {
        conversation.unreadCount = (conversation.unreadCount ?? 0) + incrementCount;
    }
}

// Recomputes the SUM of unreadCount across all conversations and paints it on the toggle-button
// badge and (if the home grid is showing) the Messages tile badge; re-renders the Messages list if
// it's the visible view so per-row counts stay live.
function refreshUnreadBadges() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const total = Object.values(settings.conversations).reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
    const label = total > 99 ? '99+' : String(total);
    for (const id of ['wp-toggle-unread-badge', 'wp-messages-tile-unread-badge']) {
        const badge = document.getElementById(id);
        if (!badge) continue;
        badge.textContent = label;
        badge.hidden = total === 0;
    }
    if (currentView === 'messages') renderMessagesScreenNow(context, settings);
}

// Clears a thread's unread badge once the user has it open AND scrolled to the bottom.
function clearUnreadIfAtBottom(conversationId) {
    if (!isConversationOpenAtBottom(conversationId)) return;
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const conversation = getConversation(settings, conversationId);
    if (!conversation || (conversation.unreadCount ?? 0) === 0) return;
    conversation.unreadCount = 0;
    context.saveSettingsDebounced();
    refreshUnreadBadges();
}

// Re-renders the Memory view (list + settings shell, repopulated) if it's currently visible —
// called after any memory CRUD action or settings change.
function rerenderMemoryScreen() {
    if (currentView !== 'memory' || !currentConversationId) return;
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const conversation = getConversation(settings, currentConversationId);
    if (!conversation) return;
    const screenBody = document.getElementById('wp-screen-body');
    if (!screenBody) return;
    const isGenerating = memoryGeneratingConversationIds.has(currentConversationId);
    const hasPendingExchanges = getMemoryWindow(conversation).messages.length > 0;
    const hasGeneratedMemory = !!getLastGeneratedMemory(conversation);
    renderMemoryScreen(screenBody, conversation.memories || [], editingMemoryId, {
        isGenerating,
        canGenerateNow: hasPendingExchanges,
        canRegenerateLast: hasGeneratedMemory,
        tethered: conversation.tethered,
        tetheredHistoryCap: conversation.tetheredHistoryCap,
    });
    const profiles = context.ConnectionManagerRequestService.getSupportedProfiles();
    populateConnectionProfileOptions(document.getElementById('wp-memory-profile-select'), profiles, conversation.memoryConnectionProfileId || '');
    document.getElementById('wp-memory-threshold-input').value = conversation.memoryThreshold || 100;
    document.getElementById('wp-memory-primary-model-input').value = conversation.memoryPrimaryModel || '';
    document.getElementById('wp-memory-backup-model-input').value = conversation.memoryBackupModel || '';
}

// Background memory-summarization job. Silent (no toastr) when auto-triggered by generateReply's
// threshold check, per the design spec's original "no UI indicator" requirement — but a manual
// trigger (Generate Now / Regenerate Last, both user-initiated clicks) passes `silent: false` to
// get explicit success/failure feedback, since a user who just clicked a button expects to see
// something happen. Never participates in the typing indicator or Regenerate's disabled state
// either way — those stay tied exclusively to generatingConversationIds.
//
// `forcedWindow`/`replaceMemoryId` support "Regenerate last memory": re-run generation over an
// EXISTING memory's original sourceRange and overwrite its content in place, rather than
// summarizing new territory. This deliberately does not touch lastMemoryMessageIndex — the
// window being regenerated was already summarized once, so the next-memory trigger boundary
// shouldn't move just because a past memory got redone.
//
// generatingConversationIds.add()/refreshVisibleScreen()-style pattern applies here too: the
// memoryGeneratingConversationIds.add() call MUST stay inside this try block — this bug class
// (a tracking-set mutation placed before try, leaking a stuck entry if anything before try
// throws) has already recurred three times in this project via a plan's own example code
// (milestones 2, 3, 4's final/task reviews). Keep it as the first statement inside try.
async function generateMemory(conversationId, conversation, context, settings, options = {}) {
    const { silent = true, forcedWindow = null, replaceMemoryId = null } = options;
    if (memoryGeneratingConversationIds.has(conversationId)) return;
    // Memory generation stays full-bot-solo-only for this milestone (matches Task 8's original
    // scope — only generateReply's solo-conversation path branches on hasFullBotEntry). This used
    // to rely entirely on resolveConversationCharacter/charPer.get returning nothing for a
    // subbot-only conversation's first participant — which is correct for a PURE-subbot
    // conversation, but silently wrong for a MIXED group whose first participant happens to be a
    // full-bot character (e.g. participants: ["Belle", "Blake"]): resolveConversationCharacter
    // would find Belle's real record and charPer.get would find her real config, so neither old
    // guard fired, and a Belle+Blake group thread would get a memory framed entirely around
    // Belle's persona alone, ignoring the group. Explicit length check makes the real boundary
    // (groups don't get memory generation at all yet) correct regardless of which participant
    // happens to be first or whether they have a full-bot.
    if (conversation.participants.length > 1) return;
    const character = resolveConversationCharacter(context, conversation.participants[0]);
    if (!character) return;
    const personalityConfig = charPer.get(character.name);
    if (!personalityConfig) return;

    try {
        memoryGeneratingConversationIds.add(conversationId);
        rerenderMemoryScreen();
        const window = forcedWindow ?? getMemoryWindow(conversation);
        if (window.messages.length === 0) {
            if (!silent) toastr.info('Nothing new to summarize since the last memory.', 'WeyPhone');
            return;
        }

        const personalityText = applySpecialCase(character.name, resolvePersonalityText(personalityConfig), {});
        const userName = context.name1 || 'User';
        const messages = buildMemoryGenerationMessages({
            charName: character.name,
            personalityText,
            windowMessages: window.messages,
            userName,
            formatClockTime,
        });
        // Same real-macro resolution as generateReply's system prompt — personalityText can
        // itself contain macros (it comes from the same charper.js source as the main prompt).
        messages[0].content = applyMacroSubstitution({
            substituteParams: context.substituteParams,
            content: messages[0].content,
            userName,
            charName: character.name,
        });

        const activeProfileId = context.extensionSettings.connectionManager?.selectedProfile ?? '';
        const profileId = resolveProfileId({ connectionProfileId: conversation.memoryConnectionProfileId }, activeProfileId);
        const result = await sendMemoryRequest({
            sendRequest: (id, msgs, model) => context.ConnectionManagerRequestService.sendRequest(
                id, msgs, DEFAULT_MEMORY_MAX_TOKENS, undefined, model ? { model } : {},
            ),
            profileId,
            messages,
            primaryModel: conversation.memoryPrimaryModel,
            backupModel: conversation.memoryBackupModel,
        });

        const memoryText = extractResponseText(result);
        if (memoryText.trim()) {
            if (replaceMemoryId) {
                editMemory(settings, conversationId, replaceMemoryId, memoryText.trim());
            } else {
                createMemory(settings, conversationId, memoryText.trim(), {
                    sourceRange: { from: window.start, to: window.end },
                    mainChatAnchor: resolveMainChatAnchor({
                        bidirectionalTetheringEnabled: settings.bidirectionalTetheringEnabled,
                        characterId: context.characterId,
                        groupId: context.groupId,
                        chatLength: context.chat?.length,
                    }),
                });
                conversation.lastMemoryMessageIndex = window.end;
            }
            context.saveSettingsDebounced();
            if (!silent) toastr.success(replaceMemoryId ? 'Memory regenerated.' : 'Memory created.', 'WeyPhone');
        } else if (!silent) {
            toastr.warning('The model returned an empty memory.', 'WeyPhone');
        }
    } catch (error) {
        console.error(`[${MODULE_NAME}] Memory generation failed:`, error);
        if (!silent) toastr.error(error.message, 'WeyPhone');
    } finally {
        memoryGeneratingConversationIds.delete(conversationId);
        rerenderMemoryScreen();
    }
}

// Shared by handleSend (after appending the user's new message) and handleRegenerate (after
// discardTrailingReply leaves the conversation ending on the message to resend) — resolves the
// prompt, builds the request (including the always-texting instructions, phone-format history,
// and any pinned memories), sends it, and stores each extracted message from the reply.
async function generateReply(conversationId, conversation, context, settings) {
    const isGroup = conversation.participants.length > 1;
    const entryName = conversation.participants[0]; // solo conversation: exactly one participant; group: representative fallback only (see entryNameForMacros below)

    // generatingConversationIds.add()/refreshVisibleScreen() MUST stay inside this try block —
    // placing them before `try` has leaked a permanently-stuck "generating" conversation twice
    // before (milestone 2's final review, milestone 3's Task 4) whenever the pre-try code threw,
    // since the finally below would never run to clean up the set. Keep the add/refresh as the
    // first statements inside try, not above it.
    try {
        generatingConversationIds.add(conversationId);
        refreshVisibleScreen();
        // Group conversations (2+ participants) ALWAYS use subbot content for every participant,
        // never a full-bot character.system_prompt/personality — see buildGroupSystemPrompt's own
        // docstring in lib/generation.js for why. Solo conversations keep the existing Task 8
        // hasFullBotEntry branch, unchanged.
        let resolved;
        let participantPrompts;
        if (isGroup) {
            const roster = await getCastRoster();
            participantPrompts = await Promise.all(conversation.participants.map(async (name) => {
                const rosterEntry = roster.find(c => c.entryName === name);
                const macroKey = rosterEntry ? rosterEntry.macroKey : null;
                return { entryName: name, personalityText: macroKey ? resolveSubbotPersonality(strings, macroKey) : '' };
            }));
            // Base prompt + post-history-instructions are shared platform-wide content (not
            // per-participant), so they're resolved the same way resolveSubbotPrompt/
            // resolveCharacterPrompt do, just without a per-character personality/description
            // (those live in participantPrompts above instead, one per roster line).
            const promptChoice = context.variables.global.get('PromptChoice') || 'Current Prompt';
            const ravEntry = resolveMasterPrompt(ravs, promptChoice);
            const htmlEnabled = context.variables.global.get('HTML!') === 'Enabled';
            const rpFocus = context.variables.global.get('RPFocus') || '';
            const postHistory = resolvePostHistoryInstructions(ravEntry, { htmlEnabled, rpFocus });
            resolved = { systemPrompt: ravEntry.teg, postHistory, descriptionText: '', personalityText: '' };
        } else if (hasFullBotEntry(entryName)) {
            const character = resolveConversationCharacter(context, entryName);
            if (!character) {
                toastr.error(`Could not find character "${entryName}" for this conversation.`, 'WeyPhone');
                return;
            }
            resolved = await resolveCharacterPrompt(context, character);
        } else {
            const roster = await getCastRoster();
            const rosterEntry = roster.find(c => c.entryName === entryName);
            if (!rosterEntry) {
                toastr.error(`Could not find subbot data for "${entryName}".`, 'WeyPhone');
                return;
            }
            resolved = await resolveSubbotPrompt(context, rosterEntry.macroKey);
        }
        // Memories are purely additive, matching the real platform's own Weyland-LTM behavior
        // (confirmed by reading its demoteExcessLTMs: pin/unpin only toggles a World Info entry's
        // constant/vectorized flags, it never touches the chat array) — raw history is never
        // trimmed just because a memory now also covers that ground.
        const historyForScan = conversation.messages.slice(0, -1);
        // Tethered mode REPLACES WeyPhone's own untethered world info with the active main
        // roleplay's world info (resolved inside buildTetheredContext below, as part of its own
        // [TETHERED VIEW] block) — it does not add to it. Running both scans unconditionally (as
        // this used to do) fed the model two separate, overlapping passes over the same shared
        // "Weyland" lorebook in one prompt — once scanned against this texting conversation, once
        // against the main chat's real history — duplicating instructional content in a way that
        // reads as exactly the kind of repeated override attempt a stricter model is trained to
        // refuse. Falls back to the untethered scan when tethered but nothing is actually active
        // to tether to (mirrors buildTetheredContext's own isMainRoleplayActive guard), so a
        // conversation never silently ends up with zero world info.
        const effectivelyTethered = conversation.tethered &&
            isMainRoleplayActive({ characterId: context.characterId, groupId: context.groupId });
        const worldInfo = effectivelyTethered
            ? { worldInfoBefore: '', worldInfoAfter: '' }
            : await resolveWorldInfo(context, historyForScan);
        const pinnedMemories = getPinnedMemories(settings, conversationId);
        const memoryBlock = joinMemoriesForInjection(pinnedMemories);
        const tetheredBlock = await buildTetheredContext(context, conversation);
        const worldInfoAfterWithMemory = joinNonEmptySections([worldInfo.worldInfoAfter, memoryBlock, tetheredBlock]);
        // World info / pinned memories / the tethered [TETHERED VIEW] block are all resolved
        // against the CONVERSATION (historyForScan, conversationId, conversation itself) — none of
        // them depend on which participant is speaking, so group conversations keep exactly the
        // same worldInfo/memory/tethered content solo conversations get. buildGroupSystemPrompt's
        // own signature only takes {basePrompt, postHistory, participants} (no WI slots — see its
        // docstring/tests in lib/generation.js), so the WI/memory/tethered block is folded in here
        // instead, immediately after the roster+judgment-instruction core, mirroring where it sits
        // in the solo path's buildSystemPrompt ordering (main -> WIbefore -> ... -> WIafter).
        let systemPromptText;
        let entryNameForMacros;
        if (isGroup) {
            const groupCore = buildGroupSystemPrompt({ basePrompt: resolved.systemPrompt, postHistory: '', participants: participantPrompts });
            systemPromptText = joinNonEmptySections([groupCore, worldInfo.worldInfoBefore, worldInfoAfterWithMemory]);
            entryNameForMacros = conversation.participants[0]; // representative only — a group reply can name multiple speakers itself
        } else {
            systemPromptText = buildSystemPrompt({
                systemPrompt: resolved.systemPrompt,
                worldInfoBefore: worldInfo.worldInfoBefore,
                descriptionText: resolved.descriptionText,
                personalityText: resolved.personalityText,
                scenarioText: '',
                worldInfoAfter: worldInfoAfterWithMemory,
            });
            entryNameForMacros = entryName;
        }
        const fullSystemPromptText = joinNonEmptySections([systemPromptText, resolved.postHistory, TEXTING_MODE_INSTRUCTIONS]);

        const userName = context.name1 || 'User';
        // Resolves every macro in the fully-assembled prompt — {{user}}, {{char}}, {{time}},
        // {{date}}, dice rolls, etc. — via SillyTavern's own real macro engine. This covers the
        // character's base prompt, World Info, memories, and the [TETHERED VIEW] block all at
        // once, since they're already joined into one string by this point.
        const substitutedSystemPromptText = applyMacroSubstitution({
            substituteParams: context.substituteParams,
            content: fullSystemPromptText,
            userName,
            charName: entryNameForMacros,
        });
        const lastMessage = conversation.messages[conversation.messages.length - 1];
        const reconstructedHistory = reconstructHistoryAsPhoneFormat(historyForScan, { charName: entryNameForMacros, userName }, formatClockTime);
        const wrappedUserMessage = reconstructHistoryAsPhoneFormat([lastMessage], { charName: entryNameForMacros, userName }, formatClockTime)[0].content;

        const messages = buildMessages({
            systemPromptText: substitutedSystemPromptText,
            history: reconstructedHistory,
            userMessage: wrappedUserMessage,
        });

        const activeProfileId = context.extensionSettings.connectionManager?.selectedProfile ?? '';
        const profileId = resolveProfileId(settings, activeProfileId);
        // A Connection Profile's own `model` field is a snapshot from whenever it was last saved —
        // ConnectionManagerRequestService.sendRequest always sends that saved value, not whatever
        // model is actually live/selected in SillyTavern's main chat completion settings right now
        // (context.getChatCompletionModel()). Messages conversations are meant to always track the
        // live main-chat model, so it's passed as an overridePayload — sendRequest spreads this over the
        // profile's own defaults, letting api-url/auth/preset still come from the pinned profile
        // while the model itself stays live. Falls back to the profile's own (possibly stale) model
        // if the live model can't be resolved for any reason, rather than sending a broken override.
        // An explicit settings.modelId (WeyPhone's own extension settings panel — see settings.html)
        // overrides even this live-model tracking, letting a user deliberately generate WeyPhone
        // content with a different model than the main roleplay chat — see resolveModelOverride.
        const liveModel = context.getChatCompletionModel?.();
        const modelOverride = resolveModelOverride(settings, liveModel);
        const overridePayload = modelOverride ? { model: modelOverride } : undefined;
        const result = await sendMessage({
            sendRequest: (id, msgs) => context.ConnectionManagerRequestService.sendRequest(id, msgs, DEFAULT_MAX_TOKENS, undefined, overridePayload),
            profileId,
            messages,
        });

        const replyText = extractResponseText(result);
        const mainChatAnchor = resolveMainChatAnchor({
            bidirectionalTetheringEnabled: settings.bidirectionalTetheringEnabled,
            characterId: context.characterId,
            groupId: context.groupId,
            chatLength: context.chat?.length,
        });
        if (isGroup) {
            // Shares parseReply's own analysis-stripping/footer-stripping/fallback logic via
            // parseGroupReply, which additionally preserves each Incoming¦ line's speaker name
            // (see lib/messageParsing.js) — fixes a phantom-message risk (an Incoming¦-shaped
            // line inside the model's own <analysis> block being mistaken for a real message)
            // and a silent-data-loss risk (a format-breaking reply being dropped with no stored
            // message and no user-visible error) that the prior ad-hoc raw re-split here had.
            const { messages: groupMessages } = parseGroupReply(replyText);
            if (groupMessages.length === 0) {
                toastr.warning('The model did not return usable content this time.', 'WeyPhone');
                return;
            }
            for (const { speaker, content } of groupMessages) {
                appendMessage(settings, conversationId, {
                    role: 'assistant',
                    content,
                    speaker: speaker ?? entryNameForMacros,
                    timestamp: genTimestamp(),
                    mainChatAnchor,
                });
            }
        } else {
            const parsed = parseReply(replyText);
            if (parsed.messages.length === 0) {
                throw new Error('The model did not return any usable content.');
            }
            for (const messageText of parsed.messages) {
                appendMessage(settings, conversationId, { role: 'assistant', content: messageText, timestamp: genTimestamp(), mainChatAnchor });
            }
        }
        rerenderIfStillViewing(conversationId, conversation.messages);
        const assistantAppended = isGroup
            ? parseGroupReply(replyText).messages.length
            : parseReply(replyText).messages.length;
        accrueUnread(settings, conversationId, assistantAppended);
        refreshUnreadBadges();
        context.saveSettingsDebounced();

        const exchangeCount = countExchangesSince(conversation.messages, conversation.lastMemoryMessageIndex ?? 0);
        if (exchangeCount >= (conversation.memoryThreshold ?? 100)) {
            // Fire-and-forget — must not delay this function's own finally cleanup below.
            generateMemory(conversationId, conversation, context, settings);
        }
    } catch (error) {
        console.error(`[${MODULE_NAME}] Generation failed:`, error);
        toastr.error(error.message, 'WeyPhone');
    } finally {
        generatingConversationIds.delete(conversationId);
        refreshVisibleScreen();
    }
}

async function handleSend() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const input = document.getElementById('wp-input');
    const userMessage = input.value.trim();
    if (!userMessage || !currentConversationId) return;
    // Captured now, not re-read after the generation await below — currentConversationId can
    // change (or become null) while this function is awaiting, if the user navigates elsewhere.
    const conversationId = currentConversationId;
    if (generatingConversationIds.has(conversationId)) return;

    const conversation = getConversation(settings, conversationId);
    if (!conversation) return;

    input.value = '';
    const mainChatAnchor = resolveMainChatAnchor({
        bidirectionalTetheringEnabled: settings.bidirectionalTetheringEnabled,
        characterId: context.characterId,
        groupId: context.groupId,
        chatLength: context.chat?.length,
    });
    appendMessage(settings, conversationId, { role: 'user', content: userMessage, timestamp: genTimestamp(), mainChatAnchor });
    editingMessageIndex = -1;
    rerenderIfStillViewing(conversationId, conversation.messages);

    await generateReply(conversationId, conversation, context, settings);
}

async function handleRegenerate() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    if (!currentConversationId) return;
    const conversationId = currentConversationId;
    if (generatingConversationIds.has(conversationId)) return;

    const conversation = getConversation(settings, conversationId);
    if (!conversation) return;

    const discarded = discardTrailingReply(settings, conversationId);
    // discardTrailingReply only trims a TRAILING ASSISTANT run — it deliberately returns false
    // and does nothing when the conversation already ends on a user message (nothing to trim),
    // which is exactly the shape a failed generation leaves behind (the user's message got
    // appended, but no reply ever did). That's still a real, retriable attempt, not a no-op: fall
    // through to generateReply as-is rather than bailing, since generateReply already treats
    // conversation.messages' last entry as "the message to reply to" and never appends anything
    // itself.
    const endsOnPendingUserMessage = conversation.messages.length > 0 &&
        conversation.messages[conversation.messages.length - 1].role === 'user';
    if (!discarded && !endsOnPendingUserMessage) return;
    editingMessageIndex = -1;
    rerenderIfStillViewing(conversationId, conversation.messages);

    await generateReply(conversationId, conversation, context, settings);
}

function toggleRegenerateMenu() {
    const menu = document.getElementById('wp-regenerate-menu');
    if (!menu) return;
    menu.hidden = !menu.hidden;
}

function closeRegenerateMenu() {
    const menu = document.getElementById('wp-regenerate-menu');
    if (menu) menu.hidden = true;
}

function handleEnterSelectMode() {
    selectMode = true;
    selectedMessageIndices.clear();
    editingMessageIndex = -1;
    updateSelectModeUI();
}

function handleExitSelectMode() {
    selectMode = false;
    selectedMessageIndices.clear();
    updateSelectModeUI();
}

// Matches stock SillyTavern's own bulk-delete selection model exactly (see script.js's delegated
// `.mes` click handler under is_delete_mode): clicking a message is not an independent toggle —
// it clears any prior selection and selects that message plus everything after it, through the
// end of the conversation. There is no way to select an out-of-order/discontiguous set of
// messages, and no way to select anything before the clicked message; only a fresh anchor click
// (or Cancel) changes the selection.
function handleSelectFromIndex(index) {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const conversation = getConversation(settings, currentConversationId);
    if (!conversation) return;
    selectedMessageIndices.clear();
    for (let i = index; i < conversation.messages.length; i++) {
        selectedMessageIndices.add(i);
    }
    updateSelectModeUI();
}

function handleBulkDeleteMessages() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    if (!currentConversationId || selectedMessageIndices.size === 0) return;
    deleteMessages(settings, currentConversationId, selectedMessageIndices);
    context.saveSettingsDebounced();
    selectMode = false;
    selectedMessageIndices.clear();
    updateSelectModeUI();
}

function handleAddMemory() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const textarea = document.getElementById('wp-memory-add-input');
    if (!textarea || !currentConversationId) return;
    const content = textarea.value.trim();
    if (!content) return;
    createMemory(settings, currentConversationId, content, {
        pinned: true,
        sourceRange: null,
        mainChatAnchor: resolveMainChatAnchor({
            bidirectionalTetheringEnabled: settings.bidirectionalTetheringEnabled,
            characterId: context.characterId,
            groupId: context.groupId,
            chatLength: context.chat?.length,
        }),
    });
    context.saveSettingsDebounced();
    rerenderMemoryScreen();
}

function handleToggleMemoryPin(memoryId, pinned) {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    setMemoryPinned(settings, currentConversationId, memoryId, pinned);
    context.saveSettingsDebounced();
    rerenderMemoryScreen();
}

function handleConfirmMemoryEdit(memoryId) {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const textarea = document.querySelector('.wp-memory-edit-textarea');
    if (!textarea) return;
    editMemory(settings, currentConversationId, memoryId, textarea.value);
    context.saveSettingsDebounced();
    editingMemoryId = null;
    rerenderMemoryScreen();
}

async function handleGenerateMemoryNow() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    if (!currentConversationId) return;
    const conversationId = currentConversationId;
    const conversation = getConversation(settings, conversationId);
    if (!conversation) return;
    await generateMemory(conversationId, conversation, context, settings, { silent: false });
}

async function handleRegenerateLastMemory() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    if (!currentConversationId) return;
    const conversationId = currentConversationId;
    const conversation = getConversation(settings, conversationId);
    if (!conversation) return;
    const lastMemory = getLastGeneratedMemory(conversation);
    if (!lastMemory) {
        toastr.info('No auto-generated memory to regenerate yet.', 'WeyPhone');
        return;
    }
    const { from, to } = lastMemory.sourceRange;
    const forcedWindow = { start: from, end: to, messages: conversation.messages.slice(from, to) };
    await generateMemory(conversationId, conversation, context, settings, {
        silent: false,
        forcedWindow,
        replaceMemoryId: lastMemory.id,
    });
}

function handleDeleteMemory(memoryId) {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    deleteMemory(settings, currentConversationId, memoryId);
    context.saveSettingsDebounced();
    editingMemoryId = null;
    rerenderMemoryScreen();
}

function handleStartConversation(participants) {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const conversation = createConversation(settings, participants);
    context.saveSettingsDebounced();
    currentConversationId = conversation.id;
    showScreen('conversation');
}

// "Start New Thread" — creates a fresh conversation with the SAME participants as the one currently
// open, WITHOUT touching the existing thread's messages at all (createConversation always makes a
// brand-new record; nothing here deletes or modifies the current conversation).
function handleStartNewThread() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const conversation = getConversation(settings, currentConversationId);
    if (!conversation) return;
    const newConversation = createConversation(settings, conversation.participants);
    context.saveSettingsDebounced();
    currentConversationId = newConversation.id;
    showScreen('conversation');
}

// "Switch Threads" — navigates to a filtered thread list (via the SAME renderMessagesScreen used
// by the Messages screen, just fed a differently-filtered summaries array) for whichever character
// the currently open conversation belongs to.
function handleSwitchThreads() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const conversation = getConversation(settings, currentConversationId);
    if (!conversation) return;
    currentThreadsFilter = conversation.participants;
    showScreen('threads');
}

function handleDeleteConversation(id) {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    deleteConversation(settings, id);
    context.saveSettingsDebounced();
    if (currentConversationId === id) {
        currentConversationId = null;
    }
    if (currentView === 'threads') {
        const remaining = getThreadsFor(settings, currentThreadsFilter ?? []);
        showScreen(remaining.length === 0 ? 'messages' : 'threads');
        return;
    }
    showScreen('messages');
}

function handleConfirmEdit(bubbleEl) {
    const index = Number(bubbleEl.dataset.index);
    const textarea = bubbleEl.querySelector('.wp-message-edit-textarea');
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    editMessage(settings, currentConversationId, index, textarea.value);
    context.saveSettingsDebounced();
    editingMessageIndex = -1;
    rerenderConversationMessages();
}

function handleDeleteMessage(bubbleEl) {
    const index = Number(bubbleEl.dataset.index);
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    deleteMessage(settings, currentConversationId, index);
    context.saveSettingsDebounced();
    editingMessageIndex = -1;
    rerenderConversationMessages();
}

function handleScreenBodyClick(event) {
    // While bulk-deleting, this delegated listener handles exactly three things — cancel, delete,
    // and toggling a bubble's selection — and nothing else (no edit, no regenerate, no nav) should
    // be reachable, so this returns unconditionally rather than falling through to the branches below.
    if (selectMode) {
        const selectCancelBtn = event.target.closest('#wp-select-cancel');
        if (selectCancelBtn) {
            handleExitSelectMode();
            return;
        }
        const selectDeleteBtn = event.target.closest('#wp-select-delete');
        if (selectDeleteBtn) {
            if (!selectDeleteBtn.disabled) handleBulkDeleteMessages();
            return;
        }
        const selectableBubble = event.target.closest('.wp-message');
        if (selectableBubble && selectableBubble.dataset.index !== undefined) {
            handleSelectFromIndex(Number(selectableBubble.dataset.index));
        }
        return;
    }
    const appTile = event.target.closest('.wp-app-tile');
    if (appTile) {
        if (appTile.classList.contains('wp-app-tile-disabled')) {
            toastr.info('This app is only available when there\'s an active roleplay chat open.', 'WeyPhone');
            return;
        }
        const appKey = appTile.dataset.app;
        if (appKey === 'messages') {
            showScreen('messages');
        } else if (appKey === 'twitter') {
            showScreen('twitter-feed');
        } else if (appKey === 'housing') {
            showScreen('housing');
        } else {
            currentPhoneApp = appKey;
            showScreen('phone-app');
        }
        return;
    }

    const followingLinkBtn = event.target.closest('#wp-twitter-following-link');
    if (followingLinkBtn) {
        showScreen('twitter-following');
        return;
    }

    const followingItem = event.target.closest('.wp-twitter-following-item');
    if (followingItem) {
        currentTwitterProfileCharacter = followingItem.dataset.name;
        showScreen('twitter-profile');
        return;
    }
    // A feed post's avatar or name/handle header (lib/panel.js's twitterPostCardMarkup) — same
    // navigation as a Following-list item, just reached from a different screen.
    const postAuthorLink = event.target.closest('.wp-twitter-post-author-link');
    if (postAuthorLink) {
        currentTwitterProfileCharacter = postAuthorLink.dataset.name;
        showScreen('twitter-profile');
        return;
    }
    const phoneAppRefreshBtn = event.target.closest('#wp-phone-app-refresh-button');
    if (phoneAppRefreshBtn && !phoneAppRefreshBtn.disabled) {
        if (currentView === 'twitter-feed') {
            runTwitterGeneration('feed');
        } else if (currentView === 'twitter-profile' && currentTwitterProfileCharacter) {
            runTwitterGeneration('profile', currentTwitterProfileCharacter);
        } else if (currentPhoneApp) {
            runPhoneAppGeneration(currentPhoneApp);
        }
        return;
    }
    const regenerateButton = event.target.closest('#wp-regenerate-button');
    if (regenerateButton) {
        if (!regenerateButton.disabled) toggleRegenerateMenu();
        return;
    }
    const regenerateMenuItem = event.target.closest('.wp-popup-menu-item[data-action="regenerate"]');
    if (regenerateMenuItem) {
        closeRegenerateMenu();
        handleRegenerate();
        return;
    }
    const memoryMenuItem = event.target.closest('.wp-popup-menu-item[data-action="memory"]');
    if (memoryMenuItem) {
        closeRegenerateMenu();
        editingMemoryId = null;
        showScreen('memory');
        return;
    }
    const selectMenuItem = event.target.closest('.wp-popup-menu-item[data-action="select"]');
    if (selectMenuItem) {
        closeRegenerateMenu();
        handleEnterSelectMode();
        return;
    }
    const newThreadMenuItem = event.target.closest('.wp-popup-menu-item[data-action="new-thread"]');
    if (newThreadMenuItem) {
        closeRegenerateMenu();
        handleStartNewThread();
        return;
    }
    const switchThreadsMenuItem = event.target.closest('.wp-popup-menu-item[data-action="switch-threads"]');
    if (switchThreadsMenuItem) {
        closeRegenerateMenu();
        handleSwitchThreads();
        return;
    }
    const memoryAddBtn = event.target.closest('#wp-memory-add-button');
    if (memoryAddBtn) {
        handleAddMemory();
        return;
    }
    const memoryGenerateNowBtn = event.target.closest('#wp-memory-generate-now-button');
    if (memoryGenerateNowBtn) {
        if (!memoryGenerateNowBtn.disabled) handleGenerateMemoryNow();
        return;
    }
    const memoryRegenerateLastBtn = event.target.closest('#wp-memory-regenerate-last-button');
    if (memoryRegenerateLastBtn) {
        if (!memoryRegenerateLastBtn.disabled) handleRegenerateLastMemory();
        return;
    }
    const memoryPinBtn = event.target.closest('.wp-memory-pin-btn');
    if (memoryPinBtn) {
        handleToggleMemoryPin(memoryPinBtn.dataset.id, !memoryPinBtn.classList.contains('wp-memory-pinned'));
        return;
    }
    const memoryEditBtn = event.target.closest('.wp-memory-edit-btn');
    if (memoryEditBtn) {
        editingMemoryId = memoryEditBtn.dataset.id;
        rerenderMemoryScreen();
        return;
    }
    const memoryEditConfirm = event.target.closest('.wp-memory-edit-confirm');
    if (memoryEditConfirm) {
        handleConfirmMemoryEdit(memoryEditConfirm.dataset.id);
        return;
    }
    const memoryEditCancel = event.target.closest('.wp-memory-edit-cancel');
    if (memoryEditCancel) {
        editingMemoryId = null;
        rerenderMemoryScreen();
        return;
    }
    const memoryDeleteBtn = event.target.closest('.wp-memory-delete-btn');
    if (memoryDeleteBtn) {
        handleDeleteMemory(memoryDeleteBtn.dataset.id);
        return;
    }
    if (event.target.closest('#wp-send-button')) {
        handleSend();
        return;
    }
    const deleteConvoBtn = event.target.closest('.wp-list-item-delete');
    if (deleteConvoBtn) {
        handleDeleteConversation(deleteConvoBtn.dataset.id);
        return;
    }
    const conversationItem = event.target.closest('.wp-conversation-item');
    if (conversationItem) {
        currentConversationId = conversationItem.dataset.id;
        showScreen('conversation');
        return;
    }
    if (event.target.closest('#wp-group-toggle-button')) {
        groupSelectionMode = !groupSelectionMode;
        groupSelectionNames = [];
        rerenderContactsScreen();
        return;
    }
    if (event.target.closest('#wp-group-send-button') && groupSelectionNames.length > 0) {
        handleStartConversation([...groupSelectionNames]);
        return;
    }
    const contactRow = event.target.closest('.wp-contact-row');
    if (contactRow) {
        const entryName = contactRow.dataset.contactFor;
        if (!groupSelectionMode) {
            handleStartConversation([entryName]);
            return;
        }
        if (contactRow.classList.contains('wp-contact-row-disabled')) return;
        groupSelectionNames = groupSelectionNames.includes(entryName)
            ? groupSelectionNames.filter(name => name !== entryName)
            : [...groupSelectionNames, entryName];
        rerenderContactsScreen();
        return;
    }
    const editBtn = event.target.closest('.wp-message-edit-btn');
    if (editBtn) {
        editingMessageIndex = Number(editBtn.closest('.wp-message').dataset.index);
        rerenderConversationMessages();
        return;
    }
    const confirmBtn = event.target.closest('.wp-message-edit-confirm');
    if (confirmBtn) {
        handleConfirmEdit(confirmBtn.closest('.wp-message'));
        return;
    }
    const deleteMsgBtn = event.target.closest('.wp-message-edit-delete');
    if (deleteMsgBtn) {
        handleDeleteMessage(deleteMsgBtn.closest('.wp-message'));
        return;
    }
    const cancelBtn = event.target.closest('.wp-message-edit-cancel');
    if (cancelBtn) {
        editingMessageIndex = -1;
        rerenderConversationMessages();
    }
}

const MEMORY_SETTINGS_FIELD_IDS = [
    'wp-memory-profile-select', 'wp-memory-threshold-input',
    'wp-memory-primary-model-input', 'wp-memory-backup-model-input',
    'wp-tethered-full-history-checkbox', 'wp-tethered-history-cap-input',
];

function handleScreenBodyChange(event) {
    if (!MEMORY_SETTINGS_FIELD_IDS.includes(event.target.id)) return;
    if (!currentConversationId) return;
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const profileId = document.getElementById('wp-memory-profile-select').value;
    const threshold = Number(document.getElementById('wp-memory-threshold-input').value) || 100;
    const primaryModel = document.getElementById('wp-memory-primary-model-input').value.trim();
    const backupModel = document.getElementById('wp-memory-backup-model-input').value.trim();
    setMemorySettings(settings, currentConversationId, {
        memoryConnectionProfileId: profileId,
        memoryThreshold: threshold,
        memoryPrimaryModel: primaryModel,
        memoryBackupModel: backupModel,
    });

    const useFullHistory = document.getElementById('wp-tethered-full-history-checkbox').checked;
    const historyCapInput = document.getElementById('wp-tethered-history-cap-input');
    historyCapInput.disabled = useFullHistory;
    const tetheredHistoryCap = useFullHistory ? null : (Number(historyCapInput.value) || 1);
    setTetheredSettings(settings, currentConversationId, { tetheredHistoryCap });

    context.saveSettingsDebounced();
}

function showScreen(view) {
    currentView = view;
    // Navigating anywhere (including re-entering the same conversation) exits select mode —
    // stale selections/half-finished bulk deletes shouldn't survive a screen change.
    selectMode = false;
    selectedMessageIndices.clear();
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const panel = document.getElementById('wp-panel');
    const title = document.getElementById('wp-panel-title');
    const screenBody = document.getElementById('wp-screen-body');
    panel.dataset.view = view;

    // Desktop-only panel sizing — skipped on mobile, where #wp-panel is already a fixed
    // full-screen sheet via CSS (matching the same 600px breakpoint as that CSS); an inline
    // width/height here would just fight that override, since inline styles always win over
    // stylesheet rules regardless of media query.
    //
    // 'home' is permanently locked to HOME_PANEL_SIZE, every single time it's entered — no memory,
    // not resizable-and-kept the way every other view is (initPanelResize's own drag handles still
    // let you drag it in the moment, it just always reverts on the next visit).
    //
    // Every other view applies whatever size was last recorded for IT SPECIFICALLY in
    // viewPanelSizes (see initPanelResize's endResize) — so resizing while on one app never bleeds
    // into another's size. 'housing' additionally gets a one-time default (800x600, so its
    // iframe — which just fills 100% of whatever the panel gives it, see style.css — renders at a
    // comfortable 4:3 the very first time it's opened in a session) when it has no recorded size
    // yet; every other view with no recorded size yet is simply left at whatever the panel
    // currently is.
    if (window.innerWidth > 600) {
        if (view === 'home') {
            panel.style.width = `${HOME_PANEL_SIZE.width}px`;
            panel.style.height = `${HOME_PANEL_SIZE.height}px`;
        } else if (viewPanelSizes.has(view)) {
            const size = viewPanelSizes.get(view);
            panel.style.width = `${size.width}px`;
            panel.style.height = `${size.height}px`;
        } else if (view === 'housing') {
            const headerHeight = document.getElementById('wp-panel-header').getBoundingClientRect().height;
            panel.style.width = `${Math.min(800, window.innerWidth * 0.9)}px`;
            panel.style.height = `${Math.min(600 + headerHeight, window.innerHeight * 0.9)}px`;
        }
    }

    if (view === 'home') {
        title.textContent = 'Home';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        const flavorAppsEnabled = isMainRoleplayActive({ characterId: context.characterId, groupId: context.groupId });
        const messagesUnreadTotal = Object.values(settings.conversations).reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
        renderAppGridScreen(screenBody, { flavorAppsEnabled, messagesUnreadTotal });
        return;
    }

    if (view === 'housing') {
        title.textContent = 'Housing Directory';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderHousingScreen(screenBody, { registrarEnabled: settings.housingRegistrarEnabled });
        const registrarCheckbox = document.getElementById('wp-registrar-checkbox');
        if (registrarCheckbox) setRegistrarToggleState(registrarCheckbox, settings.housingRegistrarEnabled);
        return;
    }

    if (view === 'messages') {
        title.textContent = 'Messages';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderMessagesScreenNow(context, settings);
        return;
    }

    if (view === 'threads') {
        title.textContent = `${formatParticipantNames(currentThreadsFilter ?? [])} Threads`;
        const portraitMap = renderThreadsScreenNow(context, settings);
        const threadParticipants = currentThreadsFilter ?? [];
        const threadPortraits = threadParticipants.map(name => portraitMap?.[name]);
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), threadParticipants.length > 1 ? threadPortraits : threadPortraits[0]);
        return;
    }

    if (view === 'phone-app') {
        if (!currentPhoneApp) {
            showScreen('home');
            return;
        }
        title.textContent = PHONE_APP_LABELS[currentPhoneApp];
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        rerenderPhoneAppScreenIfVisible(currentPhoneApp);
        return;
    }

    if (view === 'twitter-feed') {
        title.textContent = 'Twitter';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        rerenderTwitterScreenIfVisible('feed');
        return;
    }

    if (view === 'twitter-following') {
        title.textContent = 'Following';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        const portraitMap = buildTwitterPortraitMap(context, [...WEYLAND_ROSTER, ...TWITTER_ONLY_ROSTER].map(c => c.name));
        // Sorted alphabetically by display name across ALL categories combined (roster characters,
        // non-student Twitter-only accounts, PSA/business accounts) — a real Twitter Following list
        // has no notion of "category," so it shouldn't visually cluster into one here either.
        const followingRoster = [...WEYLAND_ROSTER, ...TWITTER_ONLY_ROSTER, ...PSA_ACCOUNTS]
            .sort((a, b) => a.name.localeCompare(b.name));
        renderTwitterFollowingScreen(screenBody, { roster: followingRoster, portraitMap });
        return;
    }

    if (view === 'twitter-profile') {
        if (!currentTwitterProfileCharacter) {
            showScreen('twitter-following');
            return;
        }
        title.textContent = currentTwitterProfileCharacter;
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        rerenderTwitterScreenIfVisible('profile', currentTwitterProfileCharacter);
        return;
    }

    if (view === 'contacts') {
        title.textContent = 'New Message';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        groupSelectionMode = false;
        groupSelectionNames = [];
        contactSearchQuery = '';
        rerenderContactsScreen();
        return;
    }

    if (view === 'memory') {
        const conversation = getConversation(settings, currentConversationId);
        if (!conversation) {
            showScreen('messages');
            return;
        }
        title.textContent = 'Memory';
        const portraitMap = buildPortraitMap(context.characters, conversation.participants, context.getThumbnailUrl, castRosterPortraitSlugs);
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), portraitMap[conversation.participants[0]]);
        rerenderMemoryScreen();
        return;
    }

    // view === 'conversation'
    const conversation = getConversation(settings, currentConversationId);
    if (!conversation) {
        showScreen('messages');
        return;
    }
    title.textContent = formatParticipantNames(conversation.participants);
    const portraitMap = buildPortraitMap(context.characters, conversation.participants, context.getThumbnailUrl, castRosterPortraitSlugs);
    const conversationPortraits = conversation.participants.map(name => portraitMap[name]);
    renderPanelAvatar(document.getElementById('wp-panel-avatar'), conversation.participants.length > 1 ? conversationPortraits : conversationPortraits[0]);
    renderConversationScreen(screenBody);
    editingMessageIndex = -1;
    const isTyping = generatingConversationIds.has(currentConversationId);
    const isGroup = conversation.participants.length > 1;
    const groupPortraitMap = isGroup ? portraitMap : {};
    renderMessages(document.getElementById('wp-messages'), conversation.messages, editingMessageIndex, isTyping, getSelectState(), { isGroup, portraitMap: groupPortraitMap });
    updateRegenerateEnabled(conversation);
    // Route the tethered checkbox's checked AND disabled state through the shared helper, so
    // entering the conversation view freshly re-verifies the disabled state against the
    // currently-active main roleplay rather than assuming the last CHAT_CHANGED left it correct.
    updateTetheredToggleAvailability();
    // Opening a short thread auto-scrolls to the bottom (renderMessages does this), so a freshly
    // opened, fully-visible thread clears its unread immediately; a long thread opened NOT at the
    // bottom stays badged until the user scrolls down (handled by the scroll listener in initPanel).
    clearUnreadIfAtBottom(currentConversationId);
}

// SillyTavern's mobile CSS sets `body { position: fixed; overflow: hidden; }`, which breaks
// position:fixed children appended directly to <body> (confirmed against a known, already-fixed
// issue in the sibling EchoText extension, which hit this exact bug). This is why the portal used
// to be mounted as a sibling of <body> (a child of <html>) instead of a descendant of it. That
// escaped the broken-containing-block issue, but created a DIFFERENT bug: any sibling of <body>
// with a non-negative z-index automatically outranks EVERYTHING inside <body> regardless of
// magnitude, since position:fixed <body> is its own opaque stacking-context unit — so SillyTavern
// core's own toasts (#toast-container, z-index 999999) could never paint above WeyPhone's panel on
// mobile no matter how high toastr's own z-index was, proven empirically (a z-index sweep from 1
// to 2000000 on the portal made zero difference — the comparison was never happening at that
// level). Mounting inside <body> instead puts the portal back into the SAME stacking context as
// toastr's own container, where z-index comparisons actually apply — the portal's own z-index
// (below) is now deliberately kept under toastr's 999999 so toasts always win.
//
// This trades one platform-specific risk for another: the ORIGINAL position:fixed-inside-
// position:fixed body bug this portal exists to route around was iOS-Safari-specific (see the
// matching comment in Weyland-EchoText/index.js, "iOS PORTAL — escape SillyTavern's body {
// position: fixed }") and has not been re-verified on a real iOS device since this change. If
// WeyPhone's mobile positioning ever breaks specifically on iOS after this change, this is the
// first place to look — revert to document.documentElement.appendChild(portal) and accept the
// toast-behind-panel visual issue as the lesser regression until a real fix for both is found.
const WP_PORTAL_ID = 'wp-portal';

function ensurePortal() {
    let portal = document.getElementById(WP_PORTAL_ID);
    if (!portal) {
        portal = document.createElement('div');
        portal.id = WP_PORTAL_ID;
        portal.style.cssText = 'position:fixed; top:0; left:0; width:100dvw; height:100dvh; z-index:999998; pointer-events:none;';
        document.body.appendChild(portal);
    }
    return portal;
}

// The mobile toggle-button position needs to clear SillyTavern's own top bar (#top-bar), whose
// rendered height varies by theme/font-size/content and isn't something CSS alone can know. Read
// it at runtime and expose it as a CSS custom property the mobile media query positions against
// (see style.css). Re-measured on resize since mobile browser chrome (address bar collapsing,
// etc.) can change the layout without a full reload.
function updateTopBarOffset() {
    const topBar = document.getElementById('top-bar');
    const bottom = topBar ? topBar.getBoundingClientRect().bottom : 0;
    document.documentElement.style.setProperty('--wp-topbar-bottom', `${Math.max(bottom, 0)}px`);
}

// Desktop-only drag-to-move for the panel, via its own header. Mobile's full-screen sheet has no
// use for this (its own media query pins top/left/right/bottom unconditionally, which this drag
// handler must never fight with) — gated behind the same 601px breakpoint the mobile media query
// uses on the other side, checked fresh on every drag start so a mid-session window resize across
// the boundary is respected without needing a page reload.
function initPanelDrag(panel, headerEl) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startRight = 0;
    let startTop = 0;

    headerEl.addEventListener('pointerdown', (event) => {
        if (!window.matchMedia('(min-width: 601px)').matches) return;
        // Don't start a drag from an interactive child (buttons, the tethered toggle, etc.) —
        // only the header's own empty space should initiate a move.
        if (event.target.closest('button, input, label, a')) return;
        dragging = true;
        startX = event.clientX;
        startY = event.clientY;
        const rect = panel.getBoundingClientRect();
        const portalRect = panel.offsetParent.getBoundingClientRect();
        startRight = portalRect.right - rect.right;
        startTop = rect.top - portalRect.top;
        headerEl.setPointerCapture(event.pointerId);
        event.preventDefault();
    });

    headerEl.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        const deltaX = event.clientX - startX;
        const deltaY = event.clientY - startY;
        panel.style.right = `${Math.max(0, startRight - deltaX)}px`;
        panel.style.top = `${Math.max(0, startTop + deltaY)}px`;
    });

    const endDrag = () => { dragging = false; };
    headerEl.addEventListener('pointerup', endDrag);
    headerEl.addEventListener('pointercancel', endDrag);

    // A desktop drag can leave inline style.top/style.right on the panel, and native CSS
    // `resize: both` can leave inline style.width/style.height. If the browser window is then
    // resized down across the mobile breakpoint while the panel is still open, those inline
    // styles would win the cascade over the mobile media query's own top/left/right/bottom/
    // width/height rules (inline styles always beat stylesheet rules, media query or not),
    // visually conflicting with the full-screen sheet layout. Clear them the moment we cross
    // into mobile width so the mobile rules take over cleanly.
    const mobileQuery = window.matchMedia('(max-width: 600px)');
    const clearInlinePositionOnMobile = (event) => {
        if (event.matches) {
            panel.style.removeProperty('top');
            panel.style.removeProperty('right');
            panel.style.removeProperty('width');
            panel.style.removeProperty('height');
        }
    };
    if (mobileQuery.addEventListener) {
        mobileQuery.addEventListener('change', clearInlinePositionOnMobile);
    } else {
        // Safari <14 fallback.
        mobileQuery.addListener(clearInlinePositionOnMobile);
    }
}

// Desktop-only 8-direction custom resize, replacing native CSS `resize: both` (which only offered
// a single browser-fixed bottom-right handle that grows in document-flow terms — but this panel is
// positioned via `right`, not `left`, so growing width via native resize pushed the LEFT edge
// outward while the right edge stayed pinned, reading as "grows toward the left" and fighting the
// cursor instead of tracking it). Each of the 8 handle elements below lets its own edge/corner
// track the cursor directly, with the OPPOSITE edge staying fixed — standard desktop window-
// manager resize behavior. No matchMedia guard is needed here the way initPanelDrag needs one on
// its own always-visible header: the 8 handle elements are display:none below the 601px breakpoint
// (see style.css), and a hidden element never receives pointer events, so this is inert on mobile
// by construction.
function initPanelResize(panel) {
    const MIN_WIDTH = 280;
    const MIN_HEIGHT = 320;
    let resizingDir = null;
    let startX = 0;
    let startY = 0;
    let startTop = 0;
    let startRight = 0;
    let startWidth = 0;
    let startHeight = 0;
    // Separate max ceiling per edge — EVERY direction has an implicit opposite edge that must
    // stay within the viewport, not just 'e'/'n':
    //   - 'e' keeps the left edge fixed (by construction, see pointermove below); growth is
    //     bounded by startRight+startWidth so the panel's own right edge can't be pushed past the
    //     right side of the viewport.
    //   - 'w' keeps the right edge fixed; growth is bounded by (viewport width - startRight) so
    //     the panel's LEFT edge can't be pushed past the left side of the viewport. (An earlier
    //     version of this fix wrongly gave 'w' only the flat viewport-relative ceiling with no
    //     left-edge protection at all — reproducible off-screen bug: drag the panel toward the
    //     right first via the header, then an extreme 'w' resize pushes the panel's left edge to a
    //     negative x-coordinate, off the left side of the screen entirely.)
    //   - 'n' keeps the bottom edge fixed; growth is bounded by startTop+startHeight so the top
    //     edge can't go past the top of the viewport.
    //   - 's' keeps the top edge fixed; growth is bounded by (viewport height - startTop) so the
    //     BOTTOM edge can't be pushed past the bottom of the viewport (same class of bug as 'w'
    //     above, mirrored on the vertical axis — reproducible from the panel's own default
    //     position with no prior drag needed, since its default top offset already leaves less
    //     than 90vh of room below it).
    let maxWidthForE = 0;
    let maxWidthForW = 0;
    let maxHeightForN = 0;
    let maxHeightForS = 0;

    panel.querySelectorAll('.wp-resize-handle').forEach((handle) => {
        const dir = handle.dataset.dir;

        handle.addEventListener('pointerdown', (event) => {
            resizingDir = dir;
            startX = event.clientX;
            startY = event.clientY;
            const rect = panel.getBoundingClientRect();
            const portalRect = panel.offsetParent.getBoundingClientRect();
            startTop = rect.top - portalRect.top;
            startRight = portalRect.right - rect.right;
            startWidth = rect.width;
            startHeight = rect.height;
            // See the declaration comment above for why each direction needs its own cap, not a
            // shared one — every direction has an implicit opposite edge that must stay on-screen.
            maxWidthForE = Math.min(window.innerWidth * 0.9, startRight + startWidth);
            maxWidthForW = Math.min(window.innerWidth * 0.9, window.innerWidth - startRight);
            maxHeightForN = Math.min(window.innerHeight * 0.9, startTop + startHeight);
            maxHeightForS = Math.min(window.innerHeight * 0.9, window.innerHeight - startTop);
            handle.setPointerCapture(event.pointerId);
            event.preventDefault();
            // Stop this from also being seen as a header drag-to-move if a handle ever visually
            // overlaps the header (the north handle sits right at the header's top edge). This is
            // likely unreachable in practice since the handles are DOM siblings of the header, not
            // descendants, so bubbling could never reach the header's own listener anyway — the
            // real protection there is z-index stacking (the handle paints on top and receives the
            // pointerdown first). Kept as harmless defensive code in case that DOM relationship
            // ever changes.
            event.stopPropagation();
        });

        handle.addEventListener('pointermove', (event) => {
            if (resizingDir !== dir) return;
            const deltaX = event.clientX - startX;
            const deltaY = event.clientY - startY;
            let newTop = startTop;
            let newRight = startRight;
            let newWidth = startWidth;
            let newHeight = startHeight;

            // Each edge tracks the cursor directly; the opposite edge/corner stays fixed. See the
            // task brief this function was built from for the full derivation — summary: for 'e'/'n'
            // (the edges where the far side is expressed via a separate top/right offset rather
            // than being implicit), the offset must move by however much the size ACTUALLY changed
            // (post-clamp), not by the raw cursor delta, so the fixed opposite edge stays truly
            // fixed even when a resize hits the min/max clamp.
            if (dir.includes('e')) {
                newWidth = Math.min(Math.max(startWidth + deltaX, MIN_WIDTH), maxWidthForE);
                newRight = startRight - (newWidth - startWidth);
            }
            if (dir.includes('w')) {
                newWidth = Math.min(Math.max(startWidth - deltaX, MIN_WIDTH), maxWidthForW);
            }
            if (dir.includes('n')) {
                newHeight = Math.min(Math.max(startHeight - deltaY, MIN_HEIGHT), maxHeightForN);
                newTop = startTop - (newHeight - startHeight);
            }
            if (dir.includes('s')) {
                newHeight = Math.min(Math.max(startHeight + deltaY, MIN_HEIGHT), maxHeightForS);
            }

            panel.style.top = `${Math.max(0, newTop)}px`;
            panel.style.right = `${Math.max(0, newRight)}px`;
            panel.style.width = `${newWidth}px`;
            panel.style.height = `${newHeight}px`;
        });

        const endResize = () => {
            if (resizingDir !== dir) return;
            resizingDir = null;
            // 'home' is permanently locked (see showScreen) — recording a size for it here would
            // just be dead data, since showScreen always overwrites it back to HOME_PANEL_SIZE the
            // next time 'home' is entered anyway. Every other view remembers whatever it was just
            // resized to, independent of every other view's own remembered size.
            if (currentView !== 'home') {
                const rect = panel.getBoundingClientRect();
                viewPanelSizes.set(currentView, { width: rect.width, height: rect.height });
            }
        };
        handle.addEventListener('pointerup', endResize);
        handle.addEventListener('pointercancel', endResize);
    });
}

// Re-evaluates whether a main roleplay is currently active and syncs the tethered toggle's
// disabled state accordingly — called once on load and again every time SillyTavern's own
// CHAT_CHANGED event fires, so switching characters/chats in the main window updates the toggle
// live without requiring the WeyPhone panel to be closed and reopened.
function updateTetheredToggleAvailability() {
    const checkbox = document.getElementById('wp-tethered-checkbox');
    if (!checkbox) return;
    const context = SillyTavern.getContext();
    const active = isMainRoleplayActive({ characterId: context.characterId, groupId: context.groupId });
    let checked = checkbox.checked;
    if (currentConversationId) {
        const settings = getSettings(context.extensionSettings);
        const conversation = getConversation(settings, currentConversationId);
        if (conversation) {
            checked = conversation.tethered;
        }
    }
    setTetheredToggleState(checkbox, { checked, disabled: !active });
}

// Re-renders the Home app grid (recomputing which flavor tiles should be enabled/disabled) if
// it's currently the visible screen — called on the same CHAT_CHANGED event as
// updateTetheredToggleAvailability, so activating/deactivating a main roleplay chat updates the
// grid live. Previously only showScreen('home') itself recomputed flavorAppsEnabled, so the grid
// stayed stuck at whatever it was when the panel was last opened until it was closed and reopened.
function refreshHomeScreenAvailability() {
    if (currentView !== 'home') return;
    showScreen('home');
}

function initPanel() {
    ensurePortal().insertAdjacentHTML('beforeend', createPanelMarkup());

    updateTopBarOffset();
    window.addEventListener('resize', updateTopBarOffset);

    const toggleButton = document.getElementById('wp-toggle-button');
    const panel = document.getElementById('wp-panel');
    const closeButton = document.getElementById('wp-panel-close');
    const homeButton = document.getElementById('wp-home-button');
    const backButton = document.getElementById('wp-back-button');
    const composeButton = document.getElementById('wp-compose-button');

    initPanelDrag(panel, document.getElementById('wp-panel-header'));
    initPanelResize(panel);

    // On narrow/mobile viewports the panel becomes a full-screen sheet (see style.css) and can
    // visually cover the toggle button, so open/close state is tracked explicitly here rather
    // than relying on the toggle button always being reachable to close it again.
    function setPanelOpen(open) {
        panel.classList.toggle('wp-open', open);
        toggleButton.classList.toggle('wp-panel-open', open);
        if (open) {
            showScreen('home');
        }
    }

    toggleButton.addEventListener('click', () => setPanelOpen(!panel.classList.contains('wp-open')));
    closeButton.addEventListener('click', () => setPanelOpen(false));
    homeButton.addEventListener('click', () => showScreen('home'));
    backButton.addEventListener('click', () => {
        if (currentView === 'twitter-following') {
            showScreen('twitter-feed');
        } else if (currentView === 'twitter-profile') {
            showScreen('twitter-following');
        } else if (currentView === 'contacts' || currentView === 'conversation') {
            // Both "New Message" (contacts) and an open chat always return to the top-level Messages
            // overview — simplest, most predictable target, and matches the existing precedent
            // elsewhere in showScreen (e.g. `if (!conversation) { showScreen('messages'); return; }`
            // for a conversation that no longer exists). There's no "which screen did the user
            // actually arrive from" tracking in this codebase today (e.g. threads vs. messages), so
            // this doesn't attempt to reconstruct that — it's a deliberate simplification, not an
            // oversight.
            showScreen('messages');
        } else {
            showScreen('conversation');
        }
    });
    composeButton.addEventListener('click', () => showScreen('contacts'));

    // Delegated fallback-swap for '.wp-avatar' images (see avatarMarkup in lib/panel.js) — 'error'
    // events don't bubble, so this must be attached with `capture: true` to still catch it via
    // delegation on the whole panel (avatars render both inside #wp-screen-body, which is
    // replaced wholesale on navigation, and in the persistent #wp-panel-avatar header slot).
    panel.addEventListener('error', (event) => {
        const img = event.target;
        if (!(img instanceof HTMLImageElement) || !img.classList.contains('wp-avatar')) return;
        const fallbackUrl = img.dataset.fallbackUrl;
        if (!fallbackUrl) return;
        delete img.dataset.fallbackUrl;
        img.src = fallbackUrl;
    }, true);

    // 'scroll' events don't bubble either, so this must also be attached with `capture: true` to
    // catch it via delegation on the stable #wp-panel, since #wp-messages is rebuilt on every
    // conversation open (a direct listener on it would be lost on the next re-render).
    panel.addEventListener('scroll', (event) => {
        if (!(event.target instanceof HTMLElement) || event.target.id !== 'wp-messages') return;
        if (currentView !== 'conversation' || !currentConversationId) return;
        clearUnreadIfAtBottom(currentConversationId);
    }, true);

    document.getElementById('wp-tethered-checkbox').addEventListener('change', (event) => {
        if (!currentConversationId) return;
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        setTetheredSettings(settings, currentConversationId, { tethered: event.target.checked });
        context.saveSettingsDebounced();
    });

    // Rebuilds the Housing iframe's own src with/without ?registrar=true — the map page gates its
    // whole community-character feature behind that query param at load time (see
    // renderHousingScreen's docstring), so there's no in-page API to flip it after the fact; the
    // only way to change it is to reload the iframe with a different src.
    document.getElementById('wp-registrar-checkbox').addEventListener('change', (event) => {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        settings.housingRegistrarEnabled = event.target.checked;
        context.saveSettingsDebounced();
        if (currentView === 'housing') {
            renderHousingScreen(document.getElementById('wp-screen-body'), { registrarEnabled: settings.housingRegistrarEnabled });
        }
    });

    updateTetheredToggleAvailability();
    const context = SillyTavern.getContext();
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, updateTetheredToggleAvailability);
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, refreshHomeScreenAvailability);
    context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, weyPhoneHijackHandler);

    // Closes the Regenerate popup menu on any click outside it — the menu's own toggle/item
    // clicks are handled inside handleScreenBodyClick above and are excluded here since they
    // land inside #wp-regenerate-wrapper.
    document.addEventListener('click', (event) => {
        const menu = document.getElementById('wp-regenerate-menu');
        if (!menu || menu.hidden) return;
        if (event.target.closest('#wp-regenerate-wrapper')) return;
        menu.hidden = true;
    });

    // Screen content is fully replaced on every navigation (see showScreen), so listeners are
    // delegated on the stable #wp-screen-body container rather than attached to elements that
    // get destroyed and recreated.
    const screenBody = document.getElementById('wp-screen-body');
    screenBody.addEventListener('click', handleScreenBodyClick);
    screenBody.addEventListener('change', handleScreenBodyChange);
    screenBody.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.target.id === 'wp-input') {
            handleSend();
        }
    });
    screenBody.addEventListener('input', (event) => {
        if (event.target.id !== 'wp-contact-search-input') return;
        contactSearchQuery = event.target.value;
        rerenderContactsScreen();
    });

    refreshUnreadBadges();
}

/**
 * Renders WeyPhone's own drawer into SillyTavern's native extension settings panel
 * (#extensions_settings2 — the same standard location Weyland-Proofreader uses, NOT a custom
 * WeyPhone-built modal), so users can point WeyPhone's own generation at a different Connection
 * Profile and/or model than whatever the main roleplay chat is currently using, entirely
 * independent of it. Both fields are read by resolveProfileId/resolveModelOverride at every
 * WeyPhone generation call site (Messages, The Chronicle, Discord, Yik Yak, Twitter) — left blank,
 * WeyPhone keeps tracking the main chat's active profile/model exactly as it already did.
 */
async function initExtensionSettingsPanel() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const template = await context.renderExtensionTemplateAsync('third-party/Weyland-WeyPhone', 'settings');
    const container = document.getElementById('extensions_settings2');
    if (!container) return;
    container.insertAdjacentHTML('beforeend', template);

    const debugCheckbox = document.getElementById('wp-settings-debug-checkbox');
    debugCheckbox.checked = settings.debug;
    debugCheckbox.addEventListener('input', () => {
        settings.debug = debugCheckbox.checked;
        context.saveSettingsDebounced();
    });

    const bidirectionalTetheringCheckbox = document.getElementById('wp-settings-bidirectional-tethering-checkbox');
    bidirectionalTetheringCheckbox.checked = settings.bidirectionalTetheringEnabled;
    bidirectionalTetheringCheckbox.addEventListener('input', () => {
        settings.bidirectionalTetheringEnabled = bidirectionalTetheringCheckbox.checked;
        context.saveSettingsDebounced();
    });

    const hijackCheckbox = document.getElementById('wp-settings-hijack-checkbox');
    hijackCheckbox.checked = settings.hijackEnabled;
    hijackCheckbox.addEventListener('input', () => {
        settings.hijackEnabled = hijackCheckbox.checked;
        // One-time force ONLY when turning ON — the parser needs a fully settled chat[messageId].mes,
        // so streaming must be off. Mirrors Weyland-Formatter's own force (its index.js ~line 686).
        // Turning Hijack OFF touches nothing (no persistent snap-back listener — that's Formatter's
        // separate mechanism, out of scope here).
        if (settings.hijackEnabled) {
            oai_settings.stream_openai = false;
            $('#stream_toggle').prop('checked', false);
        }
        context.saveSettingsDebounced();
    });

    const modelInput = document.getElementById('wp-settings-model-input');
    modelInput.value = settings.modelId;
    modelInput.addEventListener('input', () => {
        settings.modelId = modelInput.value.trim();
        context.saveSettingsDebounced();
    });

    try {
        context.ConnectionManagerRequestService.handleDropdown(
            '#wp-settings-profile-select',
            settings.connectionProfileId,
            (profile) => {
                settings.connectionProfileId = profile?.id ?? '';
                context.saveSettingsDebounced();
            },
        );
    } catch (error) {
        log('Connection Manager not available for the WeyPhone settings panel:', error);
    }

    const nicknamesButton = document.getElementById('wp-settings-nicknames-button');
    if (nicknamesButton) {
        nicknamesButton.addEventListener('click', () => renderNicknameConfigFrame());
    }

    const captureLastButton = document.getElementById('wp-settings-capture-last-button');
    const undoCaptureButton = document.getElementById('wp-settings-undo-capture-button');
    if (captureLastButton) captureLastButton.addEventListener('click', handleCaptureLastMessage);
    if (undoCaptureButton) undoCaptureButton.addEventListener('click', handleUndoLastCapture);
    refreshCaptureToolsAvailability();
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, refreshCaptureToolsAvailability);
}

/**
 * Builds and shows the floating Configure-Nicknames frame OUTSIDE #wp-portal (its own DOM/z-index
 * context, z-index 1000000). Left section: a comma/Enter-committed tag-chip editor for
 * userNicknames. Right section: one text field per roster contact for characterNicknames. Validates
 * via validateNicknamePools on Save; on conflict shows an error and does NOT persist.
 */
function renderNicknameConfigFrame() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    document.getElementById('wp-nickname-config-overlay')?.remove();

    // Working copies — only committed to settings on a successful Save.
    let userNicknames = [...settings.userNicknames];
    const characterNicknames = { ...settings.characterNicknames };

    const overlay = document.createElement('div');
    overlay.id = 'wp-nickname-config-overlay';
    const frame = document.createElement('div');
    frame.className = 'wp-nick-frame';
    overlay.appendChild(frame);

    const title = document.createElement('h3');
    title.textContent = 'Configure Nicknames';
    frame.appendChild(title);

    // --- userNicknames tag-chip editor ---
    const userHeading = document.createElement('h4');
    userHeading.textContent = 'Names characters call you';
    frame.appendChild(userHeading);
    const chips = document.createElement('div');
    chips.className = 'wp-nick-chips';
    frame.appendChild(chips);

    const chipInput = document.createElement('input');
    chipInput.className = 'wp-nick-chip-input';
    chipInput.type = 'text';
    chipInput.placeholder = 'Type a name, then comma or Enter…';

    const renderChips = () => {
        chips.querySelectorAll('.wp-nick-chip').forEach(el => el.remove());
        for (const name of userNicknames) {
            const chip = document.createElement('span');
            chip.className = 'wp-nick-chip';
            const label = document.createElement('span');
            label.textContent = name;
            chip.append(label);
            const isBuiltIn = BUILT_IN_USER_NICKNAMES.some(builtIn => builtIn.toLowerCase() === name.toLowerCase());
            if (!isBuiltIn) {
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.textContent = '×';
                remove.addEventListener('click', () => {
                    userNicknames = userNicknames.filter(n => n !== name);
                    renderChips();
                });
                chip.append(remove);
            }
            chips.insertBefore(chip, chipInput);
        }
    };
    chips.appendChild(chipInput);

    const commitInput = () => {
        for (const tag of parseNicknameTags(chipInput.value)) {
            if (!userNicknames.some(n => n.toLowerCase() === tag.toLowerCase())) userNicknames.push(tag);
        }
        chipInput.value = '';
        renderChips();
    };
    chipInput.addEventListener('keydown', (e) => {
        if (e.key === ',' || e.key === 'Enter') { e.preventDefault(); commitInput(); }
    });
    chipInput.addEventListener('blur', commitInput);
    renderChips();

    // --- characterNicknames per-contact fields ---
    const charHeading = document.createElement('h4');
    charHeading.textContent = 'Custom name per contact';
    frame.appendChild(charHeading);
    for (const entry of castRosterEntries) {
        const row = document.createElement('div');
        row.className = 'wp-nick-char-row';
        const label = document.createElement('label');
        label.textContent = entry.fullName || entry.entryName;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'text_pole';
        input.value = characterNicknames[entry.entryName] || '';
        input.placeholder = 'optional';
        input.addEventListener('input', () => {
            const v = input.value.trim();
            if (v) characterNicknames[entry.entryName] = v;
            else delete characterNicknames[entry.entryName];
        });
        row.append(label, input);
        frame.appendChild(row);
    }

    const errorEl = document.createElement('div');
    errorEl.className = 'wp-nick-error';
    frame.appendChild(errorEl);

    const actions = document.createElement('div');
    actions.className = 'wp-nick-actions';
    const cancelBtn = document.createElement('input');
    cancelBtn.className = 'menu_button';
    cancelBtn.type = 'button';
    cancelBtn.value = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());
    const saveBtn = document.createElement('input');
    saveBtn.className = 'menu_button';
    saveBtn.type = 'button';
    saveBtn.value = 'Save';
    saveBtn.addEventListener('click', () => {
        commitInput();
        const { valid, conflicts } = validateNicknamePools(userNicknames, characterNicknames);
        if (!valid) {
            errorEl.textContent = `These names are used for both you and a character: ${conflicts.join(', ')}. Make each unique.`;
            return;
        }
        settings.userNicknames = userNicknames;
        settings.characterNicknames = characterNicknames;
        context.saveSettingsDebounced();
        overlay.remove();
    });
    actions.append(cancelBtn, saveBtn);
    frame.appendChild(actions);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    chipInput.focus();
}

/**
 * SillyTavern's generic pre-generation hook (registered via manifest.json's generate_interceptor
 * field, called automatically before every main-chat prompt assembly — see this feature's design
 * doc for the confirmed mechanism). Computes the current bi-directional-tethering injection plan
 * fresh from live settings state and calls context.setExtensionPrompt for the shared caution block
 * plus each depth-positioned group. Ephemeral only: never touches context.chat, never saves
 * anything — turning the experimental setting off, or simply reloading/switching the chat, makes
 * all of this vanish completely.
 */
async function weyPhoneMainChatInterceptor() {
    try {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        // Never early-return before reconciliation: when the feature is off or no main roleplay is
        // active, we compute an EMPTY plan and still run planTetherExtensionPromptOps, which then
        // emits clear ops for anything a prior generation injected. Early-returning here (as an
        // earlier version did) skipped that cleanup, so turning the setting off mid-chat left stale
        // tethered blocks bleeding into every subsequent generation until a full page reload.
        const active = settings.bidirectionalTetheringEnabled &&
            isMainRoleplayActive({ characterId: context.characterId, groupId: context.groupId });

        let plan = { cautionBlock: null, groups: [] };
        if (active) {
            const tetheredConversations = Object.values(settings.conversations).filter(c => c.tethered);
            const userName = context.name1 || 'User';
            plan = buildMainChatInjectionPlan({
                tetheredConversations,
                currentMainChatLength: context.chat?.length ?? 0,
                userName,
                formatClockTime,
            });
        }

        const { ops, nextKeys } = planTetherExtensionPromptOps(plan, weyPhoneTetherExtensionPromptKeys, {
            cautionKey: WEYPHONE_TETHER_CAUTION_KEY,
            positionInPrompt: EXTENSION_PROMPT_POSITION_IN_PROMPT,
            positionInChat: EXTENSION_PROMPT_POSITION_IN_CHAT,
            positionNone: EXTENSION_PROMPT_POSITION_NONE,
            roleSystem: EXTENSION_PROMPT_ROLE_SYSTEM,
            roleUser: EXTENSION_PROMPT_ROLE_USER,
        });
        for (const op of ops) {
            // scan (5th positional arg) explicitly false; role is the 6th positional arg in
            // SillyTavern's real setExtensionPrompt signature (key, value, position, depth, scan,
            // role, filter).
            context.setExtensionPrompt(op.key, op.content, op.position, op.depth, false, op.role);
        }
        weyPhoneTetherExtensionPromptKeys = nextKeys;
    } catch (error) {
        log('Bi-directional tether injection failed:', error);
    }
}
globalThis.weyPhoneMainChatInterceptor = weyPhoneMainChatInterceptor;

/**
 * The shared per-message capture pipeline: locate scopes -> evaluate -> plan -> append -> strip.
 * Used by BOTH the live MESSAGE_RECEIVED handler (weyPhoneHijackHandler below) and the manual
 * "Capture Last Message" button (handleCaptureLastMessage below) — this is the single write site
 * that also populates lastCaptureSnapshot (the Undo cache, see Task 2), so both paths populate the
 * same cache rather than needing separate write sites. Fully synchronous, same reasoning as the
 * handler this was extracted from: it must strip a captured phone block out of chat[messageId].mes
 * BEFORE Weyland-Formatter's own later-registered MESSAGE_RECEIVED handler reads that same field
 * (WeyPhone loading_order 150 < Formatter's 400) when called from the live path. Does NOT itself
 * call context.updateMessageBlock/context.saveChat for the source message — the live
 * MESSAGE_RECEIVED path relies on ST's own native post-event render/save (unchanged from before
 * this refactor); the manual button path (which fires with no such pipeline about to run) does
 * that explicitly at its own call site instead.
 * @param {ReturnType<typeof SillyTavern.getContext>} context
 * @param {ReturnType<typeof getSettings>} settings
 * @param {number} messageId
 * @returns {boolean} true if anything was captured (i.e. message.mes was stripped)
 */
function runHijackCaptureForMessage(context, settings, messageId) {
    const chat = context.chat;
    const message = chat?.[messageId];
    if (!shouldProcessHijackMessage(message)) return false;

    const scopes = locatePhoneScopes(message.mes);
    if (!scopes.length) return false;

    const ctx = {
        userName: context.name1 || 'User',
        userNicknames: settings.userNicknames,
        castRoster: castRosterEntries,
        characterNicknames: settings.characterNicknames,
    };

    const preCaptureText = message.mes;
    const affectedConversations = [];

    // Each scope is evaluated, routed, and captured/skipped completely independently.
    const capturedScopes = [];
    const toastParticipantSets = [];
    for (const scope of scopes) {
        const decision = evaluateScope(scope, ctx);
        if (!decision.captured) continue;
        const plan = planScopeCapture(scope, decision, ctx, settings);
        if (!plan.captured) continue;

        let conversation = plan.existingConversationId
            ? getConversation(settings, plan.existingConversationId)
            : null;
        const wasNewlyCreated = !conversation;
        if (!conversation) {
            conversation = createConversation(settings, plan.participants);
            // Brand-new hijacked threads start tethered so they round-trip into the roleplay on
            // the very next generation without a manual step.
            setTetheredSettings(settings, conversation.id, { tethered: true });
        }
        const appendedMessages = [];
        for (const msg of plan.messages) {
            const stored = {
                role: msg.role,
                content: msg.content,
                ...(msg.speaker ? { speaker: msg.speaker } : {}),
                timestamp: genTimestamp(),
            };
            appendMessage(settings, conversation.id, stored);
            appendedMessages.push(stored);
        }
        accrueUnread(settings, conversation.id, plan.unreadIncrement);
        capturedScopes.push(scope);
        toastParticipantSets.push(plan.participants);
        affectedConversations.push({ conversationId: conversation.id, appendedMessages, wasNewlyCreated });
    }

    if (!capturedScopes.length) return false;

    // Strip only the captured scopes' lines out of the roleplay message. Uncaptured scopes and
    // narrative are left untouched.
    message.mes = stripPhoneScopes(message.mes, capturedScopes);

    // Single-slot undo cache — overwritten on every successful capture (automatic or manual), not
    // a history stack. Stores the message OBJECT REFERENCES that were appended (matched by
    // identity on Undo, not by count/index) and whether each conversation was newly created.
    lastCaptureSnapshot = { messageId, preCaptureText, affectedConversations };

    context.saveSettingsDebounced();
    refreshUnreadBadges();
    refreshVisibleScreen();
    for (const participants of toastParticipantSets) {
        toastr.info(`New message from ${formatParticipantNames(participants)}`, 'WeyPhone');
    }
    return true;
}

/**
 * SillyTavern MESSAGE_RECEIVED handler (registered in initPanel). Fully synchronous by design —
 * see runHijackCaptureForMessage's doc comment. Gated on BOTH experimental flags; delegates its
 * actual work to the shared pipeline.
 * @param {number} messageId
 */
function weyPhoneHijackHandler(messageId) {
    try {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        if (!settings.hijackEnabled || !settings.bidirectionalTetheringEnabled) return;
        runHijackCaptureForMessage(context, settings, messageId);
    } catch (error) {
        console.error(`[${MODULE_NAME}] Hijack capture failed:`, error);
    }
}

/**
 * "Capture Last Message" button handler (extension-settings panel). Manually re-runs capture
 * against the most recent assistant-authored message in the active roleplay chat, without needing
 * a fresh generation — recovers from cases where the live MESSAGE_RECEIVED handler didn't fire
 * (e.g. a swipe anomaly) and lets a user re-run capture after adjusting nickname configuration.
 * Per spec, enablement is ONLY "no active roleplay" / "no assistant message found" (see
 * refreshCaptureToolsAvailability) — deliberately NOT gated on hijackEnabled or
 * bidirectionalTetheringEnabled the way the live automatic handler is, since this manual tool
 * exists specifically to work even when the automatic path (which those flags gate) failed or is
 * off. Unlike the live handler, this path explicitly re-renders/saves the source chat message
 * afterward, since no native post-MESSAGE_RECEIVED pipeline is about to do that for it.
 */
function handleCaptureLastMessage() {
    try {
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        const messageId = findMostRecentAssistantMessage(context.chat);
        if (messageId === null) {
            toastr.info('No assistant message found in the active chat to capture from.', 'WeyPhone');
            return;
        }
        const captured = runHijackCaptureForMessage(context, settings, messageId);
        if (!captured) {
            toastr.info('Nothing recognized to capture in the most recent message.', 'WeyPhone');
            return;
        }
        const message = context.chat[messageId];
        context.updateMessageBlock(messageId, message);
        context.saveChat();
        refreshCaptureToolsAvailability();
        toastr.success('Captured into WeyPhone.', 'WeyPhone');
    } catch (error) {
        console.error(`[${MODULE_NAME}] Manual capture failed:`, error);
        toastr.error(error.message, 'WeyPhone');
    }
}

/**
 * Enables/disables both capture-tool buttons per the spec's gating: Capture Last Message is
 * greyed out with no active main-chat roleplay OR no assistant message to capture from; Undo
 * Last Capture is greyed out with no active main-chat roleplay OR an empty undo cache. Called on
 * init and on every CHAT_CHANGED (mirrors updateTetheredToggleAvailability's own trigger, index.js
 * ~line 2207-2209), plus explicitly after every successful capture/undo.
 */
function refreshCaptureToolsAvailability() {
    const captureLastButton = document.getElementById('wp-settings-capture-last-button');
    const undoCaptureButton = document.getElementById('wp-settings-undo-capture-button');
    if (!captureLastButton && !undoCaptureButton) return;
    const context = SillyTavern.getContext();
    const roleplayActive = isMainRoleplayActive({ characterId: context.characterId, groupId: context.groupId });
    if (captureLastButton) {
        captureLastButton.disabled = !roleplayActive || findMostRecentAssistantMessage(context.chat) === null;
    }
    if (undoCaptureButton) {
        undoCaptureButton.disabled = !roleplayActive || lastCaptureSnapshot === null;
    }
}

/**
 * Temporary stub for Task 2's real Undo implementation — kept as a no-op so index.js stays
 * loadable and the button wiring in initExtensionSettingsPanel has something to call until Task 2
 * lands. Removed in Task 2, Step 4.
 */
function handleUndoLastCapture() {
    toastr.info('Undo Last Capture is not implemented yet.', 'WeyPhone');
}

jQuery(async () => {
    initPanel();
    getCastRoster();
    initExtensionSettingsPanel();
    log('WeyPhone initialized');
});
