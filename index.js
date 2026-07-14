import { MODULE_NAME, getSettings } from './lib/config.js';
import { EXCLUDED_CHARACTER_NAMES, getSelectableCharacters } from './lib/characters.js';
import { resolveMasterPrompt, resolvePostHistoryInstructions, resolvePersonalityText, applySpecialCase } from './lib/promptResolution.js';
import { resolveWorldInfoTethered, resolveWorldInfoUntethered } from './lib/worldInfo.js';
import { createConversation, getConversation, appendMessage, editMessage, deleteMessage, deleteMessages, deleteConversation, getAllConversationSummaries, genTimestamp, discardTrailingReply, createMemory, editMemory, deleteMemory, setMemoryPinned, getPinnedMemories, setMemorySettings, countExchangesSince, getMemoryWindow, getLastGeneratedMemory, setTetheredSettings, findOrCreateDedicatedAppConversation } from './lib/storage.js';
import { buildSystemPrompt, buildMessages, resolveProfileId, sendMessage, reconstructHistoryAsPhoneFormat, applyMacroSubstitution } from './lib/generation.js';
import { createPanelMarkup, renderMessagesScreen, renderContactsScreen, renderConversationScreen, renderMessages, renderPanelAvatar, setRegenerateEnabled, renderMemoryScreen, populateConnectionProfileOptions, setTetheredToggleState, renderAppGridScreen, renderPhoneAppScreen, renderTwitterFollowingScreen, renderTwitterProfileScreen, renderTwitterFeedScreen, setModeToggleVisible } from './lib/panel.js';
import { formatRelativeTime, formatClockTime } from './lib/formatTime.js';
import { withTypingState } from './lib/generationTracking.js';
import { buildPortraitMap } from './lib/portraits.js';
import { parseReply } from './lib/messageParsing.js';
import { TEXTING_MODE_INSTRUCTIONS } from './lib/textingModeInstructions.js';
import { buildMemoryGenerationMessages, joinMemoriesForInjection, sendMemoryRequest } from './lib/memoryGeneration.js';
import { isMainRoleplayActive, resolveMainActiveLtmEntries, resolveMainHistorySlice, formatMainHistoryTranscript, buildTetheredViewBlock, convertMainChatToMessages, buildScanHistoryWithExtraText } from './lib/tetheredContext.js';
import { PHONE_APP_PROMPTS } from './lib/phoneAppPrompts.js';
import { getPhoneAppContent, setPhoneAppContent } from './lib/phoneApps.js';
import { parsePhoneAppOutput } from './lib/phoneAppFormatting.js';
import { parseTwitterPosts } from './lib/twitterParsing.js';
import { PSA_ACCOUNTS } from './lib/twitterPrompts.js';
import { WEYLAND_ROSTER } from './lib/weylandRoster.js';
import { buildTwitterPrompt } from './lib/twitterPrompts.js';
import { ravs } from '../../quick-reply-ext/src/rav.js';
import { charPer } from '../../quick-reply-ext/src/charper.js';

let currentView = 'home'; // 'home' | 'contacts' | 'conversation' | 'memory'
let currentConversationId = null;
let currentPhoneApp = null; // 'chronicle' | 'discord' | 'yikyak' | null
let currentTwitterProfileCharacter = null;
const PHONE_APP_LABELS = { chronicle: 'The Chronicle', discord: 'Discord', yikyak: 'Yik Yak' };
const phoneAppGeneratingIds = new Set(); // tracks which app keys currently have a generation in flight
const DEFAULT_PHONE_APP_MAX_TOKENS = 1024;
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
 * Resolves the character record generateReply/generateMemory need for a WeyPhone conversation.
 * For every normal conversation this is a real installed SillyTavern character (a plain
 * context.characters lookup by name). Aethel is a deliberate exception: she has no standalone
 * character card at all — her real personality/lore lives entirely as quick-reply-ext's own
 * charper.js data (charPer.get('Aethel')), the same Weybot-sandbox mechanism the platform already
 * uses to let Weybot roleplay as her without a real card. resolveCharacterPrompt reads
 * character.name (to look up prompt/personality content in charPer/ravs) and character.description
 * (defaulted to '' if absent, which is correct for Aethel — she has no real card to draw a
 * description from anyway) — it never needs any other field, and avatar resolution goes through
 * buildPortraitMap independently (already resilient to no local character match — see
 * lib/portraits.js), so a synthetic stub is safe everywhere a resolved character actually gets used
 * downstream of this function.
 * @param {{characters: Array<{name: string}>}} context
 * @param {string} charName
 * @returns {{name: string, avatar: string|null} | undefined}
 */
function resolveConversationCharacter(context, charName) {
    const found = context.characters.find(c => c.name === charName);
    if (found) return found;
    if (charName === 'Aethel' && charPer.has('Aethel')) return { name: 'Aethel', avatar: null };
    return undefined;
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
    const button = document.getElementById('wp-regenerate-button');
    if (!button) return;
    const isGenerating = generatingConversationIds.has(currentConversationId);
    const messages = conversation.messages;
    let cutIndex = messages.length;
    while (cutIndex > 0 && messages[cutIndex - 1].role === 'assistant') cutIndex--;
    const hasRegeneratable = cutIndex > 0 && cutIndex < messages.length;
    setRegenerateEnabled(button, hasRegeneratable && !isGenerating);
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
    renderMessages(document.getElementById('wp-messages'), conversation.messages, editingMessageIndex, isTyping, getSelectState());
    updateRegenerateEnabled(conversation);
}

// Re-renders the conversation view for `conversationId` only if the panel is still showing
// that exact conversation — the user may have navigated away (or deleted it) during the ~60s
// generation wait below, in which case #wp-messages either doesn't exist or belongs to a
// different conversation entirely.
function rerenderIfStillViewing(conversationId, messages) {
    if (currentView !== 'conversation' || currentConversationId !== conversationId) return;
    const messagesEl = document.getElementById('wp-messages');
    if (!messagesEl) return;
    const isTyping = generatingConversationIds.has(conversationId);
    renderMessages(messagesEl, messages, editingMessageIndex, isTyping, getSelectState());
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const conversation = getConversation(settings, conversationId);
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
    const charNames = summaries.map(summary => summary.charName);
    const portraitMap = buildPortraitMap(context.characters, charNames, context.getThumbnailUrl);
    renderMessagesScreen(screenBody, summaries, formatRelativeTime, portraitMap);
}

// Runs (or re-runs) a flavor app's generation entirely read-only against the main roleplay's real
// context — no mutation of context.chat anywhere in this function or anything it calls. This
// replaces the prior milestone attempt's push/quiet-generate/pop mechanism, which caused a real
// incident (a synthetic message got permanently saved to a user's real chat file when
// SillyTavern's own autosave fired mid-generation, before the pop could run) — see this plan's
// own "Why this plan exists" section. There is no live-array window to race here at all: this
// function builds a request from data it reads (character fields, World Info text, a NEW array
// from convertMainChatToMessages) and sends it via ConnectionManagerRequestService, the same path
// WeyPhone's own texting Messages app already uses — context.chat itself is never touched.
//
// phoneAppGeneratingIds.add()/rerenderPhoneAppScreenIfVisible() MUST stay inside this try block —
// this project's established stuck-lock bug class (a tracking-Set mutation placed before try)
// applies here exactly the same way it does to generatingConversationIds/
// memoryGeneratingConversationIds elsewhere in this file.
async function runPhoneAppGeneration(appKey) {
    if (phoneAppGeneratingIds.has(appKey)) return;
    const context = SillyTavern.getContext();
    if (!isMainRoleplayActive({ characterId: context.characterId, groupId: context.groupId })) {
        toastr.info('No active roleplay to pull content from right now.', 'WeyPhone');
        return;
    }

    try {
        phoneAppGeneratingIds.add(appKey);
        rerenderPhoneAppScreenIfVisible(appKey);

        const settings = getSettings(context.extensionSettings);
        const mainCharacter = context.characters[context.characterId];
        if (!mainCharacter) {
            toastr.info('No active roleplay to pull content from right now.', 'WeyPhone');
            return;
        }

        const resolved = await resolveCharacterPrompt(context, mainCharacter);
        const worldInfoAfter = await resolveWorldInfoTetheredForMainChat(context, PHONE_APP_PROMPTS[appKey]);
        const mainHistory = convertMainChatToMessages(context.chat);

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
            userMessage: PHONE_APP_PROMPTS[appKey],
        });

        // Same real-macro resolution as generateReply's system prompt and generateMemory's
        // opening message — resolves {{user}}, {{getvar::...}}, etc. in both the system prompt
        // (which may carry macros via resolved.systemPrompt/personalityText) and the final
        // user message (PHONE_APP_PROMPTS[appKey], which embeds real {{user}}/{{getvar::MCY-2}}
        // tokens in its roster content). Guarded against double-substituting the same string
        // twice in the (not normally reachable) case where buildMessages produced only one
        // message total.
        const userName = context.name1 || 'User';
        messages[0].content = applyMacroSubstitution({
            substituteParams: context.substituteParams,
            content: messages[0].content,
            userName,
            charName: mainCharacter.name,
        });
        if (messages.length > 1) {
            const lastMessage = messages[messages.length - 1];
            lastMessage.content = applyMacroSubstitution({
                substituteParams: context.substituteParams,
                content: lastMessage.content,
                userName,
                charName: mainCharacter.name,
            });
        }

        const activeProfileId = context.extensionSettings.connectionManager?.selectedProfile ?? '';
        const profileId = resolveProfileId(settings, activeProfileId);
        const result = await sendMessage({
            sendRequest: (id, msgs) => context.ConnectionManagerRequestService.sendRequest(id, msgs, DEFAULT_PHONE_APP_MAX_TOKENS),
            profileId,
            messages,
        });

        const rawText = typeof result === 'string' ? result : (result?.content ?? '');
        const parsed = parsePhoneAppOutput(rawText);
        if (parsed.sections.length === 0) {
            toastr.warning('The model did not return usable content this time.', 'WeyPhone');
            return;
        }

        setPhoneAppContent(settings, context.chatId, appKey, {
            content: parsed,
            generatedAt: Date.now(),
            chatMessageCountAtGeneration: context.chat.length,
        });
        context.saveSettingsDebounced();
    } catch (error) {
        console.error(`[${MODULE_NAME}] Phone app generation failed:`, error);
        toastr.error(error.message, 'WeyPhone');
    } finally {
        phoneAppGeneratingIds.delete(appKey);
        rerenderPhoneAppScreenIfVisible(appKey);
    }
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

/**
 * Twitter's equivalent of runPhoneAppGeneration, generalized for its two modes (main feed, or one
 * character's profile). Same read-only mechanism, same never-mutates-context.chat guarantee —
 * this function's only new piece versus runPhoneAppGeneration is building the prompt dynamically
 * via buildTwitterPrompt instead of a static PHONE_APP_PROMPTS[appKey] lookup, and using a
 * composite cache key. Every context.chat access below is a READ ONLY — verify this explicitly in
 * review, matching the standing invariant.
 * @param {'feed' | 'profile'} mode
 * @param {string} [characterName] required when mode === 'profile'
 */
async function runTwitterGeneration(mode, characterName) {
    const cacheKey = twitterCacheKey(mode, characterName);
    if (twitterGeneratingKeys.has(cacheKey)) return;
    const context = SillyTavern.getContext();
    if (!isMainRoleplayActive({ characterId: context.characterId, groupId: context.groupId })) {
        toastr.info('No active roleplay to pull content from right now.', 'WeyPhone');
        return;
    }

    try {
        twitterGeneratingKeys.add(cacheKey);
        rerenderTwitterScreenIfVisible(mode, characterName);

        const settings = getSettings(context.extensionSettings);
        const mainCharacter = context.characters[context.characterId];
        if (!mainCharacter) {
            toastr.info('No active roleplay to pull content from right now.', 'WeyPhone');
            return;
        }

        let promptText;
        if (mode === 'profile') {
            const rosterEntry = WEYLAND_ROSTER.find(c => c.name === characterName);
            if (!rosterEntry) {
                toastr.error(`No roster entry found for "${characterName}".`, 'WeyPhone');
                return;
            }
            promptText = buildTwitterPrompt({ mode: 'profile', character: rosterEntry });
        } else {
            promptText = buildTwitterPrompt({ mode: 'feed' });
        }

        const resolved = await resolveCharacterPrompt(context, mainCharacter);
        const worldInfoAfter = await resolveWorldInfoTetheredForMainChat(context, promptText);
        const mainHistory = convertMainChatToMessages(context.chat);

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
        const result = await sendMessage({
            sendRequest: (id, msgs) => context.ConnectionManagerRequestService.sendRequest(id, msgs, DEFAULT_PHONE_APP_MAX_TOKENS),
            profileId,
            messages,
        });

        const rawText = typeof result === 'string' ? result : (result?.content ?? '');
        const parsed = parseTwitterPosts(rawText, { roster: WEYLAND_ROSTER, psaAccounts: PSA_ACCOUNTS });
        if (parsed.posts.length === 0) {
            toastr.warning('The model did not return usable content this time.', 'WeyPhone');
            return;
        }

        setPhoneAppContent(settings, context.chatId, cacheKey, {
            content: parsed,
            generatedAt: Date.now(),
            chatMessageCountAtGeneration: context.chat.length,
        });
        context.saveSettingsDebounced();
    } catch (error) {
        console.error(`[${MODULE_NAME}] Twitter generation failed:`, error);
        toastr.error(error.message, 'WeyPhone');
    } finally {
        twitterGeneratingKeys.delete(cacheKey);
        rerenderTwitterScreenIfVisible(mode, characterName);
    }
}

function rerenderTwitterScreenIfVisible(mode, characterName) {
    const expectedView = mode === 'feed' ? 'twitter-feed' : 'twitter-profile';
    if (currentView !== expectedView) return;
    if (mode === 'profile' && currentTwitterProfileCharacter !== characterName) return;
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const screenBody = document.getElementById('wp-screen-body');
    if (!screenBody) return;
    const cacheKey = twitterCacheKey(mode, characterName);
    const entry = getPhoneAppContent(settings, context.chatId, cacheKey);
    const isGenerating = twitterGeneratingKeys.has(cacheKey);
    if (mode === 'feed') {
        const authorNames = (entry?.content?.posts ?? []).map(p => p.authorName);
        const portraitMap = buildPortraitMap(context.characters, authorNames, context.getThumbnailUrl);
        renderTwitterFeedScreen(screenBody, { entry, isGenerating, formatRelativeTime, portraitMap });
    } else {
        const rosterEntry = WEYLAND_ROSTER.find(c => c.name === characterName);
        renderTwitterProfileScreen(screenBody, {
            character: rosterEntry,
            portraitMap: buildPortraitMap(context.characters, [characterName], context.getThumbnailUrl),
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
    if (currentView === 'conversation' && currentConversationId) {
        rerenderConversationMessages();
    }
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
    const character = resolveConversationCharacter(context, conversation.charName);
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

        const memoryText = typeof result === 'string' ? result : (result?.content ?? '');
        if (memoryText.trim()) {
            if (replaceMemoryId) {
                editMemory(settings, conversationId, replaceMemoryId, memoryText.trim());
            } else {
                createMemory(settings, conversationId, memoryText.trim(), {
                    sourceRange: { from: window.start, to: window.end },
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
    const character = resolveConversationCharacter(context, conversation.charName);
    if (!character) {
        toastr.error(`Could not find character "${conversation.charName}" for this conversation.`, 'WeyPhone');
        return;
    }

    // generatingConversationIds.add()/refreshVisibleScreen() MUST stay inside this try block —
    // placing them before `try` has leaked a permanently-stuck "generating" conversation twice
    // before (milestone 2's final review, milestone 3's Task 4) whenever the pre-try code threw,
    // since the finally below would never run to clean up the set. Keep the add/refresh as the
    // first statements inside try, not above it.
    try {
        generatingConversationIds.add(conversationId);
        refreshVisibleScreen();
        const resolved = await resolveCharacterPrompt(context, character);
        // Memories are purely additive, matching the real platform's own Weyland-LTM behavior
        // (confirmed by reading its demoteExcessLTMs: pin/unpin only toggles a World Info entry's
        // constant/vectorized flags, it never touches the chat array) — raw history is never
        // trimmed just because a memory now also covers that ground.
        const historyForScan = conversation.messages.slice(0, -1);
        const worldInfo = await resolveWorldInfo(context, historyForScan);
        const pinnedMemories = getPinnedMemories(settings, conversationId);
        const memoryBlock = joinMemoriesForInjection(pinnedMemories);
        const tetheredBlock = await buildTetheredContext(context, conversation);
        const worldInfoAfterWithMemory = [worldInfo.worldInfoAfter, memoryBlock, tetheredBlock]
            .filter(section => typeof section === 'string' && section.trim().length > 0)
            .join('\n\n');
        const systemPromptText = buildSystemPrompt({
            systemPrompt: resolved.systemPrompt,
            worldInfoBefore: worldInfo.worldInfoBefore,
            descriptionText: resolved.descriptionText,
            personalityText: resolved.personalityText,
            scenarioText: '',
            worldInfoAfter: worldInfoAfterWithMemory,
        });
        const fullSystemPromptText = [systemPromptText, resolved.postHistory, TEXTING_MODE_INSTRUCTIONS]
            .filter(section => typeof section === 'string' && section.trim().length > 0)
            .join('\n\n');

        const userName = context.name1 || 'User';
        // Resolves every macro in the fully-assembled prompt — {{user}}, {{char}}, {{time}},
        // {{date}}, dice rolls, etc. — via SillyTavern's own real macro engine. This covers the
        // character's base prompt, World Info, memories, and the [TETHERED VIEW] block all at
        // once, since they're already joined into one string by this point.
        const substitutedSystemPromptText = applyMacroSubstitution({
            substituteParams: context.substituteParams,
            content: fullSystemPromptText,
            userName,
            charName: character.name,
        });
        const lastMessage = conversation.messages[conversation.messages.length - 1];
        const reconstructedHistory = reconstructHistoryAsPhoneFormat(historyForScan, { charName: character.name, userName }, formatClockTime);
        const wrappedUserMessage = reconstructHistoryAsPhoneFormat([lastMessage], { charName: character.name, userName }, formatClockTime)[0].content;

        const messages = buildMessages({
            systemPromptText: substitutedSystemPromptText,
            history: reconstructedHistory,
            userMessage: wrappedUserMessage,
        });

        const activeProfileId = context.extensionSettings.connectionManager?.selectedProfile ?? '';
        const profileId = resolveProfileId(settings, activeProfileId);
        const result = await sendMessage({
            sendRequest: (id, msgs) => context.ConnectionManagerRequestService.sendRequest(id, msgs, DEFAULT_MAX_TOKENS),
            profileId,
            messages,
        });

        const replyText = typeof result === 'string' ? result : (result?.content ?? '');
        const parsed = parseReply(replyText);
        if (parsed.messages.length === 0) {
            throw new Error('The model did not return any usable content.');
        }
        for (const messageText of parsed.messages) {
            appendMessage(settings, conversationId, { role: 'assistant', content: messageText, timestamp: genTimestamp() });
        }
        rerenderIfStillViewing(conversationId, conversation.messages);
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
    appendMessage(settings, conversationId, { role: 'user', content: userMessage, timestamp: genTimestamp() });
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
    if (!discarded) return;
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
    createMemory(settings, currentConversationId, content, { pinned: true, sourceRange: null });
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

function handleStartConversation(charName) {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const conversation = createConversation(settings, charName);
    context.saveSettingsDebounced();
    currentConversationId = conversation.id;
    showScreen('conversation');
}

function openAethelConversation() {
    const context = SillyTavern.getContext();
    // Aethel has no standalone SillyTavern character card at all — she's never findable via
    // context.characters, by design (see resolveConversationCharacter above). Her real
    // availability check is whether the platform's own quick-reply-ext charper.js data has her
    // (the same Weybot-sandbox mechanism that lets Weybot roleplay as her without a real card).
    if (!charPer.has('Aethel')) {
        toastr.error('Aethel\'s character data isn\'t available in this SillyTavern instance.', 'WeyPhone');
        return;
    }
    const settings = getSettings(context.extensionSettings);
    const conversation = findOrCreateDedicatedAppConversation(settings, 'Aethel', 'athel');
    context.saveSettingsDebounced();
    currentConversationId = conversation.id;
    showScreen('conversation');
}

function handleDeleteConversation(id) {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    deleteConversation(settings, id);
    context.saveSettingsDebounced();
    if (currentConversationId === id) {
        currentConversationId = null;
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
        } else if (appKey === 'athel') {
            openAethelConversation();
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
    const contactItem = event.target.closest('.wp-contact-item');
    if (contactItem) {
        handleStartConversation(contactItem.dataset.name);
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

    if (view === 'home') {
        title.textContent = 'Home';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        const flavorAppsEnabled = isMainRoleplayActive({ characterId: context.characterId, groupId: context.groupId });
        renderAppGridScreen(screenBody, { flavorAppsEnabled });
        return;
    }

    if (view === 'messages') {
        title.textContent = 'Messages';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        renderMessagesScreenNow(context, settings);
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

        // Staleness check: if the main chat has moved on since this app's content was cached,
        // automatically regenerate rather than requiring the user to notice and tap refresh.
        const entry = getPhoneAppContent(settings, context.chatId, currentPhoneApp);
        const isStale = entry && entry.chatMessageCountAtGeneration !== context.chat.length;
        if (isStale && !phoneAppGeneratingIds.has(currentPhoneApp)) {
            runPhoneAppGeneration(currentPhoneApp);
        }
        return;
    }

    if (view === 'twitter-feed') {
        title.textContent = 'Twitter';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        rerenderTwitterScreenIfVisible('feed');
        const entry = getPhoneAppContent(settings, context.chatId, twitterCacheKey('feed'));
        const isStale = entry && entry.chatMessageCountAtGeneration !== context.chat.length;
        if (isStale && !twitterGeneratingKeys.has(twitterCacheKey('feed'))) {
            runTwitterGeneration('feed');
        }
        return;
    }

    if (view === 'twitter-following') {
        title.textContent = 'Following';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        const portraitMap = buildPortraitMap(context.characters, WEYLAND_ROSTER.map(c => c.name), context.getThumbnailUrl);
        renderTwitterFollowingScreen(screenBody, { roster: WEYLAND_ROSTER, portraitMap });
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
        const cacheKey = twitterCacheKey('profile', currentTwitterProfileCharacter);
        const entry = getPhoneAppContent(settings, context.chatId, cacheKey);
        const isStale = entry && entry.chatMessageCountAtGeneration !== context.chat.length;
        if (isStale && !twitterGeneratingKeys.has(cacheKey)) {
            runTwitterGeneration('profile', currentTwitterProfileCharacter);
        }
        return;
    }

    if (view === 'contacts') {
        title.textContent = 'New Message';
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), null);
        const characters = getSelectableCharacters(context.characters, EXCLUDED_CHARACTER_NAMES);
        const portraitMap = buildPortraitMap(context.characters, characters.map(c => c.name), context.getThumbnailUrl);
        renderContactsScreen(screenBody, characters, portraitMap);
        return;
    }

    if (view === 'memory') {
        const conversation = getConversation(settings, currentConversationId);
        if (!conversation) {
            showScreen('messages');
            return;
        }
        title.textContent = 'Memory';
        const portraitMap = buildPortraitMap(context.characters, [conversation.charName], context.getThumbnailUrl);
        renderPanelAvatar(document.getElementById('wp-panel-avatar'), portraitMap[conversation.charName]);
        rerenderMemoryScreen();
        return;
    }

    // view === 'conversation'
    const conversation = getConversation(settings, currentConversationId);
    if (!conversation) {
        showScreen('messages');
        return;
    }
    title.textContent = conversation.charName;
    const portraitMap = buildPortraitMap(context.characters, [conversation.charName], context.getThumbnailUrl);
    renderPanelAvatar(document.getElementById('wp-panel-avatar'), portraitMap[conversation.charName]);
    renderConversationScreen(screenBody);
    editingMessageIndex = -1;
    const isTyping = generatingConversationIds.has(currentConversationId);
    renderMessages(document.getElementById('wp-messages'), conversation.messages, editingMessageIndex, isTyping, getSelectState());
    updateRegenerateEnabled(conversation);
    const tetheredCheckbox = document.getElementById('wp-tethered-checkbox');
    if (tetheredCheckbox) tetheredCheckbox.checked = conversation.tethered;
    const modeToggleLabel = document.getElementById('wp-mode-toggle');
    if (modeToggleLabel) setModeToggleVisible(modeToggleLabel, !conversation.isDedicatedApp);
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
    let isDedicatedApp = false;
    if (currentConversationId) {
        const settings = getSettings(context.extensionSettings);
        const conversation = getConversation(settings, currentConversationId);
        if (conversation) {
            checked = conversation.tethered;
            isDedicatedApp = !!conversation.isDedicatedApp;
        }
    }
    setTetheredToggleState(checkbox, { checked, disabled: !active });
    const modeToggleLabel = document.getElementById('wp-mode-toggle');
    if (modeToggleLabel) setModeToggleVisible(modeToggleLabel, !isDedicatedApp);
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
        } else {
            showScreen('conversation');
        }
    });
    composeButton.addEventListener('click', () => showScreen('contacts'));

    document.getElementById('wp-tethered-checkbox').addEventListener('change', (event) => {
        if (!currentConversationId) return;
        const context = SillyTavern.getContext();
        const settings = getSettings(context.extensionSettings);
        setTetheredSettings(settings, currentConversationId, { tethered: event.target.checked });
        context.saveSettingsDebounced();
    });

    updateTetheredToggleAvailability();
    const context = SillyTavern.getContext();
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, updateTetheredToggleAvailability);

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
}

jQuery(async () => {
    initPanel();
    log('WeyPhone initialized');
});
