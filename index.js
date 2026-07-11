import { MODULE_NAME, getSettings } from './lib/config.js';
import { EXCLUDED_CHARACTER_NAMES, getSelectableCharacters } from './lib/characters.js';
import { resolveMasterPrompt, resolvePostHistoryInstructions, resolvePersonalityText, applySpecialCase } from './lib/promptResolution.js';
import { resolveWorldInfoTethered, resolveWorldInfoUntethered } from './lib/worldInfo.js';
import { getConversation, appendMessage } from './lib/storage.js';
import { buildSystemPrompt, buildMessages, resolveProfileId, sendMessage } from './lib/generation.js';
import { createPanelMarkup, renderCharacterOptions, renderMessages } from './lib/panel.js';
import { ravs } from '../../quick-reply-ext/src/rav.js';
import { charPer } from '../../quick-reply-ext/src/charper.js';

let selectedCharacterName = null;
let tetheredMode = false;

// WeyPhone has no user-facing max-tokens setting yet (milestone 1), so this is a fixed default
// passed to ConnectionManagerRequestService.sendRequest's required maxTokens argument. 1024 is
// still just a placeholder chosen to avoid visibly truncating conversational replies mid-
// sentence — not a final tuned value; replace once a real user-facing setting exists.
const DEFAULT_MAX_TOKENS = 1024;

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
    if (tetheredMode) {
        return resolveWorldInfoTethered({
            getWorldInfoPrompt: context.getWorldInfoPrompt,
            history,
            maxContext: context.maxContext ?? 4096,
        });
    }
    const personaLorebookName = context.powerUserSettings?.persona_description_lorebook || '';
    return resolveWorldInfoUntethered({
        loadWorldInfo: context.loadWorldInfo,
        history,
        personaLorebookName,
    });
}

async function handleSend() {
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const input = document.getElementById('wp-input');
    const userMessage = input.value.trim();
    if (!userMessage || !selectedCharacterName) return;
    input.value = '';

    const character = context.characters.find(c => c.name === selectedCharacterName);
    if (!character) return;

    const conversation = getConversation(settings, selectedCharacterName);
    appendMessage(settings, selectedCharacterName, { role: 'user', content: userMessage });
    renderMessages(document.getElementById('wp-messages'), conversation.messages);

    try {
        const resolved = await resolveCharacterPrompt(context, character);
        const historyForScan = conversation.messages.slice(0, -1);
        const worldInfo = await resolveWorldInfo(context, historyForScan);
        const systemPromptText = buildSystemPrompt({
            systemPrompt: resolved.systemPrompt,
            worldInfoBefore: worldInfo.worldInfoBefore,
            descriptionText: resolved.descriptionText,
            personalityText: resolved.personalityText,
            scenarioText: '',
            worldInfoAfter: worldInfo.worldInfoAfter,
        });
        const fullSystemPromptText = [systemPromptText, resolved.postHistory]
            .filter(section => typeof section === 'string' && section.trim().length > 0)
            .join('\n\n');
        const messages = buildMessages({
            systemPromptText: fullSystemPromptText,
            history: historyForScan.map(m => ({ role: m.role, content: m.content })),
            userMessage,
        });

        const activeProfileId = context.extensionSettings.connectionManager?.selectedProfile ?? '';
        const profileId = resolveProfileId(settings, activeProfileId);
        const result = await sendMessage({
            sendRequest: (id, msgs) => context.ConnectionManagerRequestService.sendRequest(id, msgs, DEFAULT_MAX_TOKENS),
            profileId,
            messages,
        });

        const replyText = typeof result === 'string' ? result : (result?.content ?? '');
        appendMessage(settings, selectedCharacterName, { role: 'assistant', content: replyText });
        renderMessages(document.getElementById('wp-messages'), conversation.messages);
        context.saveSettingsDebounced();
    } catch (error) {
        console.error(`[${MODULE_NAME}] Generation failed:`, error);
        toastr.error(error.message, 'WeyPhone');
    }
}

function handleCharacterChange(event) {
    selectedCharacterName = event.target.value;
    const context = SillyTavern.getContext();
    const settings = getSettings(context.extensionSettings);
    const conversation = getConversation(settings, selectedCharacterName);
    renderMessages(document.getElementById('wp-messages'), conversation.messages);
}

// SillyTavern's mobile CSS sets `body { position: fixed; overflow: hidden; }`, which breaks
// position:fixed children appended directly to <body> (confirmed against a known, already-fixed
// issue in the sibling EchoText extension, which hit this exact bug). The fix — also matching
// EchoText's approach — is to mount our markup in a portal div that's a sibling of <body> (a
// child of <html>) instead, escaping body's broken containing-block behavior on mobile entirely.
// The portal itself has pointer-events:none so it never blocks clicks to the page underneath;
// #wp-toggle-button/#wp-panel re-enable pointer-events on themselves (see style.css).
const WP_PORTAL_ID = 'wp-portal';

function ensurePortal() {
    let portal = document.getElementById(WP_PORTAL_ID);
    if (!portal) {
        portal = document.createElement('div');
        portal.id = WP_PORTAL_ID;
        portal.style.cssText = 'position:fixed; top:0; left:0; width:100dvw; height:100dvh; z-index:2147483647; pointer-events:none;';
        document.documentElement.appendChild(portal);
    }
    return portal;
}

// The mobile toggle-button position needs to clear SillyTavern's own top bar (#top-bar), whose
// rendered height varies by theme/font-size/content and isn't something CSS alone can know. Read
// it at runtime and expose it as a CSS custom property the mobile media query positions against
// (see style.css). Re-measured on resize since mobile browser chrome (address bar collapsing,
// etc.) can change the layout without a full reload. Per user feedback (2026-07-11): the
// previous safe-area-only offset clipped into #top-bar's icon row.
function updateTopBarOffset() {
    const topBar = document.getElementById('top-bar');
    const bottom = topBar ? topBar.getBoundingClientRect().bottom : 0;
    document.documentElement.style.setProperty('--wp-topbar-bottom', `${Math.max(bottom, 0)}px`);
}

function initPanel() {
    const context = SillyTavern.getContext();
    ensurePortal().insertAdjacentHTML('beforeend', createPanelMarkup());

    updateTopBarOffset();
    window.addEventListener('resize', updateTopBarOffset);

    const toggleButton = document.getElementById('wp-toggle-button');
    const panel = document.getElementById('wp-panel');
    const closeButton = document.getElementById('wp-panel-close');

    // On narrow/mobile viewports the panel becomes a full-screen sheet (see style.css) and can
    // visually cover the toggle button, so open/close state is tracked explicitly here rather
    // than relying on the toggle button always being reachable to close it again.
    function setPanelOpen(open) {
        panel.classList.toggle('wp-open', open);
        toggleButton.classList.toggle('wp-panel-open', open);
    }

    toggleButton.addEventListener('click', () => setPanelOpen(!panel.classList.contains('wp-open')));
    closeButton.addEventListener('click', () => setPanelOpen(false));

    const characterSelect = document.getElementById('wp-character-select');
    characterSelect.addEventListener('change', handleCharacterChange);
    // context.characters is very likely still empty at this point — SillyTavern's own extension
    // activation (which runs this file) happens before its character list finishes loading, per
    // the CHARACTER_PAGE_LOADED/APP_READY event ordering observed in a live browser session.
    // Render whatever's available now (usually nothing), and refresh again once the app
    // confirms it's fully ready.
    refreshCharacterList(context);
    context.eventSource.on(context.event_types.APP_READY, () => refreshCharacterList(SillyTavern.getContext()));

    document.getElementById('wp-tethered-checkbox').addEventListener('change', (event) => {
        tetheredMode = event.target.checked;
    });

    document.getElementById('wp-send-button').addEventListener('click', handleSend);
    document.getElementById('wp-input').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') handleSend();
    });
}

function refreshCharacterList(context) {
    const characterSelect = document.getElementById('wp-character-select');
    const characters = getSelectableCharacters(context.characters, EXCLUDED_CHARACTER_NAMES);
    renderCharacterOptions(characterSelect, characters);
    if (!selectedCharacterName && characters.length > 0) {
        selectedCharacterName = characters[0].name;
        characterSelect.value = selectedCharacterName;
    }
}

jQuery(async () => {
    initPanel();
    log('WeyPhone initialized');
});
