// lib/panel.js

export function createPanelMarkup() {
    return `
<div id="wp-toggle-button" title="WeyPhone">
    <i class="fa-solid fa-comment-dots"></i>
</div>
<div id="wp-panel" data-view="home">
    <div id="wp-panel-header">
        <button id="wp-home-button" class="wp-header-btn" title="Home"><i class="fa-solid fa-house"></i></button>
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
    <input type="text" id="wp-input" placeholder="Message..." />
    <button id="wp-send-button" class="menu_button">Send</button>
</div>`;
}

/**
 * @param {HTMLElement} container #wp-messages
 * @param {Array<{role: string, content: string}>} messages
 * @param {number} [editingIndex] index of the message currently in inline-edit mode; -1 (default) for none
 * @param {boolean} [isTyping] whether to append an animated typing-indicator bubble after the real messages
 */
export function renderMessages(container, messages, editingIndex = -1, isTyping = false) {
    container.innerHTML = '';
    messages.forEach((message, index) => {
        const bubble = document.createElement('div');
        bubble.className = `wp-message ${message.role === 'user' ? 'wp-user' : 'wp-char'}`;
        bubble.dataset.index = String(index);

        if (index === editingIndex) {
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
            const editButton = document.createElement('button');
            editButton.className = 'wp-message-edit-btn';
            editButton.title = 'Edit';
            editButton.innerHTML = '<i class="fa-solid fa-pencil"></i>';
            bubble.appendChild(textSpan);
            bubble.appendChild(editButton);
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
