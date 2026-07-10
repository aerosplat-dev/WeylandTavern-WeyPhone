// lib/panel.js

export function createPanelMarkup() {
    return `
<div id="wp-toggle-button" title="WeyPhone">
    <i class="fa-solid fa-comment-dots"></i>
</div>
<div id="wp-panel">
    <div id="wp-panel-header">
        <select id="wp-character-select"></select>
        <label id="wp-mode-toggle">
            <input type="checkbox" id="wp-tethered-checkbox" />
            Tethered
        </label>
        <button id="wp-panel-close" title="Close">&times;</button>
    </div>
    <div id="wp-messages"></div>
    <div id="wp-input-row">
        <input type="text" id="wp-input" placeholder="Message..." />
        <button id="wp-send-button" class="menu_button">Send</button>
    </div>
</div>`;
}

/**
 * @param {HTMLSelectElement} selectEl
 * @param {Array<{name: string}>} characters
 */
export function renderCharacterOptions(selectEl, characters) {
    selectEl.innerHTML = '';
    for (const character of characters) {
        const option = document.createElement('option');
        option.value = character.name;
        option.textContent = character.name;
        selectEl.appendChild(option);
    }
}

/**
 * @param {HTMLElement} container
 * @param {Array<{role: string, content: string}>} messages
 */
export function renderMessages(container, messages) {
    container.innerHTML = '';
    for (const message of messages) {
        const div = document.createElement('div');
        div.className = `wp-message ${message.role === 'user' ? 'wp-user' : 'wp-char'}`;
        div.textContent = message.content;
        container.appendChild(div);
    }
    container.scrollTop = container.scrollHeight;
}
