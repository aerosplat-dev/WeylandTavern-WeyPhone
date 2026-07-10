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
// passed to ConnectionManagerRequestService.sendRequest's required maxTokens argument.
const DEFAULT_MAX_TOKENS = 512;

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

function initPanel() {
    const context = SillyTavern.getContext();
    document.body.insertAdjacentHTML('beforeend', createPanelMarkup());

    const toggleButton = document.getElementById('wp-toggle-button');
    const panel = document.getElementById('wp-panel');
    toggleButton.addEventListener('click', () => panel.classList.toggle('wp-open'));

    const characterSelect = document.getElementById('wp-character-select');
    const characters = getSelectableCharacters(context.characters, EXCLUDED_CHARACTER_NAMES);
    renderCharacterOptions(characterSelect, characters);
    characterSelect.addEventListener('change', handleCharacterChange);
    if (characters.length > 0) {
        selectedCharacterName = characters[0].name;
    }

    document.getElementById('wp-tethered-checkbox').addEventListener('change', (event) => {
        tetheredMode = event.target.checked;
    });

    document.getElementById('wp-send-button').addEventListener('click', handleSend);
    document.getElementById('wp-input').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') handleSend();
    });
}

jQuery(async () => {
    initPanel();
    log('WeyPhone initialized');
});
