// lib/panel.js

export function createPanelMarkup() {
    return `
<div id="wp-toggle-button" title="WeyPhone">
    <i class="fa-solid fa-comment-dots"></i>
</div>
<div id="wp-panel" data-view="home">
    <div id="wp-panel-header">
        <button id="wp-home-button" class="wp-header-btn" title="Home"><i class="fa-solid fa-house"></i></button>
        <button id="wp-back-button" class="wp-header-btn" title="Back"><i class="fa-solid fa-arrow-left"></i></button>
        <div id="wp-panel-avatar"></div>
        <div id="wp-panel-title">Messages</div>
        <label id="wp-mode-toggle" class="wp-toggle-label">
            <span class="wp-toggle-switch">
                <input type="checkbox" id="wp-tethered-checkbox" class="wp-toggle-input" />
                <span class="wp-toggle-track"><span class="wp-toggle-thumb"></span></span>
            </span>
            <span class="wp-toggle-text">Tethered</span>
        </label>
        <button id="wp-compose-button" class="wp-header-btn" title="New Message"><i class="fa-solid fa-pen-to-square"></i></button>
        <button id="wp-panel-close" title="Close">&times;</button>
    </div>
    <div id="wp-screen-body"></div>
</div>`;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * @param {{avatarUrl: string|null, initial: string|null}} [portrait]
 */
function avatarMarkup(portrait) {
    if (portrait && portrait.avatarUrl) {
        return `<img class="wp-avatar" src="${escapeHtml(portrait.avatarUrl)}" alt="" />`;
    }
    const initial = portrait && portrait.initial ? portrait.initial : '?';
    return `<div class="wp-avatar wp-avatar-fallback">${escapeHtml(initial)}</div>`;
}

function typingDotsMarkup() {
    return '<span class="wp-typing-dots"><span class="wp-typing-dot"></span><span class="wp-typing-dot"></span><span class="wp-typing-dot"></span></span>';
}

/**
 * Sets (or clears) the panel header's avatar.
 * @param {HTMLElement} container #wp-panel-avatar
 * @param {{avatarUrl: string|null, initial: string|null}} [portrait] pass null/undefined to clear
 */
export function renderPanelAvatar(container, portrait) {
    container.innerHTML = portrait ? avatarMarkup(portrait) : '';
}

/**
 * @param {HTMLElement} container #wp-screen-body
 * @param {Array<{id: string, charName: string, lastMessageSnippet: string, lastActive: number, isTyping?: boolean}>} summaries
 * @param {(epochMs: number) => string} formatRelativeTime
 * @param {Record<string, {avatarUrl: string|null, initial: string|null}>} portraitMap keyed by charName
 */
export function renderHomeScreen(container, summaries, formatRelativeTime, portraitMap) {
    if (!summaries.length) {
        container.innerHTML = '<div class="wp-empty-state">No conversations yet. Tap <i class="fa-solid fa-pen-to-square"></i> to start one.</div>';
        return;
    }
    container.innerHTML = summaries.map(summary => `
<div class="wp-list-item wp-conversation-item" data-id="${escapeHtml(summary.id)}">
    ${avatarMarkup(portraitMap[summary.charName])}
    <div class="wp-list-item-main">
        <div class="wp-list-item-title">${escapeHtml(summary.charName)}</div>
        <div class="wp-list-item-snippet${summary.isTyping ? ' wp-typing-snippet' : ''}">${summary.isTyping ? `${typingDotsMarkup()} typing...` : escapeHtml(summary.lastMessageSnippet || 'No messages yet')}</div>
    </div>
    <div class="wp-list-item-meta">
        <div class="wp-list-item-time">${escapeHtml(formatRelativeTime(summary.lastActive))}</div>
        <button class="wp-list-item-delete" data-id="${escapeHtml(summary.id)}" title="Delete conversation"><i class="fa-solid fa-trash-can"></i></button>
    </div>
</div>`).join('');
}

/**
 * @param {HTMLElement} container #wp-screen-body
 * @param {Array<{name: string}>} characters
 * @param {Record<string, {avatarUrl: string|null, initial: string|null}>} portraitMap keyed by character name
 */
export function renderContactsScreen(container, characters, portraitMap) {
    if (!characters.length) {
        container.innerHTML = '<div class="wp-empty-state">No characters available.</div>';
        return;
    }
    container.innerHTML = characters.map(character => `
<div class="wp-list-item wp-contact-item" data-name="${escapeHtml(character.name)}">
    ${avatarMarkup(portraitMap[character.name])}
    <div class="wp-list-item-main">
        <div class="wp-list-item-title">${escapeHtml(character.name)}</div>
    </div>
</div>`).join('');
}

/**
 * Renders the message-list + input-row shell into the screen body. Call once when entering the
 * conversation view; use renderMessages separately to (re-)populate the message list itself.
 * @param {HTMLElement} container #wp-screen-body
 */
export function renderConversationScreen(container) {
    container.innerHTML = `
<div id="wp-messages"></div>
<div id="wp-input-row">
    <div id="wp-regenerate-wrapper">
        <button id="wp-regenerate-button" class="wp-header-btn" title="More options"><i class="fa-solid fa-ellipsis-vertical"></i></button>
        <div id="wp-regenerate-menu" class="wp-popup-menu" hidden>
            <button type="button" class="wp-popup-menu-item" data-action="regenerate">Regenerate</button>
            <button type="button" class="wp-popup-menu-item" data-action="memory">Memory</button>
            <button type="button" class="wp-popup-menu-item" data-action="select">Delete Messages</button>
        </div>
    </div>
    <input type="text" id="wp-input" placeholder="Message..." />
    <button id="wp-send-button" class="menu_button">Send</button>
</div>
<div id="wp-select-actions" hidden>
    <button id="wp-select-cancel" class="menu_button">Cancel</button>
    <span id="wp-select-count">0 selected</span>
    <button id="wp-select-delete" class="menu_button" disabled>Delete</button>
</div>`;
}

/**
 * @param {HTMLElement} button #wp-regenerate-button
 * @param {boolean} enabled
 */
export function setRegenerateEnabled(button, enabled) {
    button.disabled = !enabled;
    button.classList.toggle('wp-disabled', !enabled);
}

/**
 * @param {HTMLElement} container #wp-screen-body
 * @param {Array<{id: string, content: string, pinned: boolean}>} memories
 * @param {string|null} [editingMemoryId] id of the memory currently in inline-edit mode
 * @param {{isGenerating?: boolean, canGenerateNow?: boolean, canRegenerateLast?: boolean}} [state]
 */
export function renderMemoryScreen(container, memories, editingMemoryId = null, state = {}) {
    const { isGenerating = false, canGenerateNow = true, canRegenerateLast = true } = state;
    const listHtml = memories.length
        ? memories.map(memory => {
            if (memory.id === editingMemoryId) {
                return `
<div class="wp-list-item wp-memory-item wp-memory-editing" data-id="${escapeHtml(memory.id)}">
    <textarea class="wp-memory-edit-textarea">${escapeHtml(memory.content)}</textarea>
    <div class="wp-message-edit-controls">
        <button class="wp-memory-edit-confirm" data-id="${escapeHtml(memory.id)}" title="Confirm"><i class="fa-solid fa-check"></i></button>
        <button class="wp-memory-edit-cancel" title="Cancel"><i class="fa-solid fa-xmark"></i></button>
    </div>
</div>`;
            }
            return `
<div class="wp-list-item wp-memory-item" data-id="${escapeHtml(memory.id)}">
    <div class="wp-list-item-main">
        <div class="wp-memory-content">${escapeHtml(memory.content)}</div>
    </div>
    <div class="wp-list-item-meta">
        <button class="wp-memory-pin-btn${memory.pinned ? ' wp-memory-pinned' : ''}" data-id="${escapeHtml(memory.id)}" title="${memory.pinned ? 'Unpin' : 'Pin'}"><i class="fa-solid fa-thumbtack"></i></button>
        <button class="wp-memory-edit-btn" data-id="${escapeHtml(memory.id)}" title="Edit"><i class="fa-solid fa-pencil"></i></button>
        <button class="wp-memory-delete-btn" data-id="${escapeHtml(memory.id)}" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
    </div>
</div>`;
        }).join('')
        : '<div class="wp-empty-state">No memories yet.</div>';

    const generateNowDisabled = isGenerating || !canGenerateNow;
    const regenerateLastDisabled = isGenerating || !canRegenerateLast;

    container.innerHTML = `
<div id="wp-memory-list">${listHtml}</div>
<div id="wp-memory-add-row">
    <textarea id="wp-memory-add-input" placeholder="Add a memory..."></textarea>
    <button id="wp-memory-add-button" class="menu_button">Add</button>
</div>
<div id="wp-memory-settings">
    <label class="wp-memory-settings-label">Connection Profile
        <select id="wp-memory-profile-select"></select>
    </label>
    <label class="wp-memory-settings-label">Generate a memory every
        <input type="number" id="wp-memory-threshold-input" min="1" />
        exchanges
    </label>
    <label class="wp-memory-settings-label">Primary model
        <input type="text" id="wp-memory-primary-model-input" placeholder="gemini-3-pro-preview" />
    </label>
    <label class="wp-memory-settings-label">Backup model (used if primary fails)
        <input type="text" id="wp-memory-backup-model-input" placeholder="glm-4.7" />
    </label>
    <div id="wp-memory-actions">
        <button id="wp-memory-generate-now-button" class="menu_button"${generateNowDisabled ? ' disabled' : ''}>${isGenerating ? 'Generating…' : 'Generate memory now'}</button>
        <button id="wp-memory-regenerate-last-button" class="menu_button"${regenerateLastDisabled ? ' disabled' : ''}>Regenerate last memory</button>
    </div>
</div>`;
}

/**
 * @param {HTMLSelectElement} selectEl #wp-memory-profile-select
 * @param {Array<{id: string, name?: string}>} profiles
 * @param {string} selectedId empty string means "use main chat's active profile"
 */
export function populateConnectionProfileOptions(selectEl, profiles, selectedId) {
    const defaultOption = '<option value="">Use main chat\'s active profile</option>';
    const profileOptions = profiles.map(p =>
        `<option value="${escapeHtml(p.id)}"${p.id === selectedId ? ' selected' : ''}>${escapeHtml(p.name || p.id)}</option>`
    ).join('');
    selectEl.innerHTML = defaultOption + profileOptions;
    if (!selectedId) selectEl.value = '';
}

/**
 * @param {HTMLElement} container #wp-messages
 * @param {Array<{role: string, content: string}>} messages
 * @param {number} [editingIndex] index of the message currently in inline-edit mode; -1 (default) for none
 * @param {boolean} [isTyping] whether to append an animated typing-indicator bubble after the real messages
 * @param {{active?: boolean, selectedIndices?: Set<number>}} [selectState] bulk-delete select mode — when active,
 *   every bubble (both roles) renders a checkbox instead of any edit control, and inline-edit mode is suppressed.
 */
export function renderMessages(container, messages, editingIndex = -1, isTyping = false, selectState = {}) {
    const { active: selectActive = false, selectedIndices = new Set() } = selectState;
    container.innerHTML = '';
    messages.forEach((message, index) => {
        const bubble = document.createElement('div');
        bubble.className = `wp-message ${message.role === 'user' ? 'wp-user' : 'wp-char'}`;
        bubble.dataset.index = String(index);

        if (selectActive) {
            bubble.classList.toggle('wp-message-selected', selectedIndices.has(index));
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'wp-message-select-checkbox';
            checkbox.checked = selectedIndices.has(index);
            // The whole bubble is the click target (delegated at the caller level) — this
            // checkbox is a visual indicator, not an independent control, so it shouldn't be a
            // second separately-focusable/toggleable element.
            checkbox.tabIndex = -1;
            const textSpan = document.createElement('span');
            textSpan.className = 'wp-message-text';
            textSpan.textContent = message.content;
            bubble.appendChild(checkbox);
            bubble.appendChild(textSpan);
        } else if (index === editingIndex) {
            bubble.classList.add('wp-message-editing');
            bubble.innerHTML = `
<textarea class="wp-message-edit-textarea">${escapeHtml(message.content)}</textarea>
<div class="wp-message-edit-controls">
    <button class="wp-message-edit-confirm" title="Confirm"><i class="fa-solid fa-check"></i></button>
    <button class="wp-message-edit-delete" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
    <button class="wp-message-edit-cancel" title="Cancel"><i class="fa-solid fa-xmark"></i></button>
</div>`;
        } else {
            const textSpan = document.createElement('span');
            textSpan.className = 'wp-message-text';
            textSpan.textContent = message.content;
            bubble.appendChild(textSpan);
            // Only the user's own messages are editable — a character's reply can only be
            // changed by regenerating it (see the Regenerate control), not hand-edited in place,
            // so no edit button is rendered for wp-char bubbles at all.
            if (message.role === 'user') {
                const editButton = document.createElement('button');
                editButton.className = 'wp-message-edit-btn';
                editButton.title = 'Edit';
                editButton.innerHTML = '<i class="fa-solid fa-pencil"></i>';
                bubble.appendChild(editButton);
            }
        }
        container.appendChild(bubble);
    });
    if (isTyping) {
        const typingBubble = document.createElement('div');
        typingBubble.className = 'wp-message wp-char wp-typing-bubble';
        typingBubble.innerHTML = typingDotsMarkup();
        container.appendChild(typingBubble);
    }
    if (editingIndex < 0) {
        container.scrollTop = container.scrollHeight;
    }
}
