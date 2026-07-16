// lib/panel.js

import { ASSET_BASE_URL, MAPS_BASE_URL } from './assetPaths.js';

export function createPanelMarkup() {
    return `
<div id="wp-toggle-button" title="WeyPhone">
    <i class="fa-solid fa-mobile-screen"></i>
</div>
<div id="wp-panel" data-view="home">
    <div class="wp-resize-handle wp-resize-n" data-dir="n"></div>
    <div class="wp-resize-handle wp-resize-s" data-dir="s"></div>
    <div class="wp-resize-handle wp-resize-e" data-dir="e"></div>
    <div class="wp-resize-handle wp-resize-w" data-dir="w"></div>
    <div class="wp-resize-handle wp-resize-ne" data-dir="ne"></div>
    <div class="wp-resize-handle wp-resize-nw" data-dir="nw"></div>
    <div class="wp-resize-handle wp-resize-se" data-dir="se"></div>
    <div class="wp-resize-handle wp-resize-sw" data-dir="sw"></div>
    <div id="wp-panel-header">
        <button id="wp-home-button" class="wp-header-btn" title="Home"><i class="fa-solid fa-house"></i></button>
        <button id="wp-back-button" class="wp-header-btn" title="Back"><i class="fa-solid fa-arrow-left"></i></button>
        <div id="wp-panel-avatar"></div>
        <div id="wp-panel-title">Messages</div>
        <label id="wp-mode-toggle" class="wp-toggle-label" title="When on, this character is aware of the active main roleplay chat's history and memories">
            <span class="wp-toggle-switch">
                <input type="checkbox" id="wp-tethered-checkbox" class="wp-toggle-input" />
                <span class="wp-toggle-track"><span class="wp-toggle-thumb"></span></span>
            </span>
            <span class="wp-toggle-text">Tethered</span>
        </label>
        <label id="wp-registrar-toggle-label" class="wp-toggle-label" title="Show community-contributed characters from registrar.weybooru.com on the map">
            <span class="wp-toggle-switch">
                <input type="checkbox" id="wp-registrar-checkbox" class="wp-toggle-input" />
                <span class="wp-toggle-track"><span class="wp-toggle-thumb"></span></span>
            </span>
            <span class="wp-toggle-text">Registrar</span>
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
 * Renders a weybooru-primary image with a data-attribute-carried fallback to the local
 * SillyTavern avatar URL — the only reliable way to detect a failed external-CDN image load from
 * plain HTML without a real pre-flight network round-trip. The actual swap-on-error logic lives
 * in index.js's delegated 'error' listener (attached with `capture: true` on the panel, since
 * `error` events don't bubble), which reads `dataset.fallbackUrl` and clears it before swapping —
 * mirroring the old inline `this.onerror=null` guard — to prevent an infinite loop if the
 * fallback URL itself also fails to load. Using a real listener instead of an inline `onerror="..."`
 * string avoids a single-quote-breakout vector: `escapeHtml` alone can't safely embed an
 * attacker-controlled URL inside a JS string literal that's itself inside an HTML attribute,
 * because browsers HTML-decode attribute values (e.g. `&#39;` back to `'`) before handing the
 * string to the JS parser.
 * @param {{primaryUrl: string|null, fallbackUrl: string|null, initial: string|null}} [portrait]
 */
function avatarMarkup(portrait) {
    if (portrait && portrait.primaryUrl) {
        const fallbackAttr = portrait.fallbackUrl
            ? ` data-fallback-url="${escapeHtml(portrait.fallbackUrl)}"`
            : '';
        return `<img class="wp-avatar" src="${escapeHtml(portrait.primaryUrl)}" alt=""${fallbackAttr} />`;
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
 * @param {{primaryUrl: string|null, fallbackUrl: string|null, initial: string|null}} [portrait] pass null/undefined to clear
 */
export function renderPanelAvatar(container, portrait) {
    container.innerHTML = portrait ? avatarMarkup(portrait) : '';
}

/**
 * The new Home screen: a 2x2 app grid (Messages, The Chronicle, Discord, Yik Yak). Messages is
 * always enabled. The other three are disabled (greyed, non-interactive) whenever there's no
 * active main roleplay to pull content from — same treatment as the tethered toggle.
 * @param {HTMLElement} container #wp-screen-body
 * @param {{flavorAppsEnabled: boolean}} state
 */
const APP_ICONS = {
    messages: `${ASSET_BASE_URL}/weyphone_messages.png`,
    chronicle: `${ASSET_BASE_URL}/weyphone_chronicle.png`,
    discord: `${ASSET_BASE_URL}/weyphone_discord.png`,
    yikyak: `${ASSET_BASE_URL}/weyphone_yikyak.png`,
    twitter: `${ASSET_BASE_URL}/weyphone_twitter.png`,
    housing: `${ASSET_BASE_URL}/weyphone_housing.png`,
};

/**
 * @param {HTMLElement} container #wp-screen-body
 * @param {{flavorAppsEnabled: boolean}} state
 */
export function renderAppGridScreen(container, { flavorAppsEnabled }) {
    const disabledClass = flavorAppsEnabled ? '' : ' wp-app-tile-disabled';
    container.innerHTML = `
<div class="wp-app-grid">
    <div class="wp-app-tile${disabledClass}" data-app="chronicle">
        <div class="wp-app-icon"><img src="${APP_ICONS.chronicle}" alt="" /></div>
        <div class="wp-app-label">The Chronicle</div>
    </div>
    <div class="wp-app-tile${disabledClass}" data-app="twitter">
        <div class="wp-app-icon"><img src="${APP_ICONS.twitter}" alt="" /></div>
        <div class="wp-app-label">Twitter</div>
    </div>
    <div class="wp-app-tile${disabledClass}" data-app="discord">
        <div class="wp-app-icon"><img src="${APP_ICONS.discord}" alt="" /></div>
        <div class="wp-app-label">Discord</div>
    </div>
    <div class="wp-app-tile${disabledClass}" data-app="yikyak">
        <div class="wp-app-icon"><img src="${APP_ICONS.yikyak}" alt="" /></div>
        <div class="wp-app-label">Yik Yak</div>
    </div>
    <div class="wp-app-tile" data-app="housing">
        <div class="wp-app-icon"><img src="${APP_ICONS.housing}" alt="" /></div>
        <div class="wp-app-label">Housing</div>
    </div>
    <div class="wp-app-tile" data-app="messages">
        <div class="wp-app-icon"><img src="${APP_ICONS.messages}" alt="" /></div>
        <div class="wp-app-label">Messages</div>
    </div>
</div>`;
}

/**
 * The Housing app is a static, self-contained interactive floor-map tool (maps/weyland_dorms.html,
 * served as a static asset alongside this extension's own assets/) — not roleplay-content
 * dependent like the other flavor apps, so it's rendered as an iframe (isolating its own full-page
 * CSS/JS/Google-Fonts-import/live cast.weybooru.com fetch from this panel's own styles entirely)
 * rather than generated or injected inline, and its Home tile is never greyed out.
 *
 * The map page itself gates its whole "Registrar" (community-character) feature behind a
 * `?registrar=true` query param — the button/tabs for it don't even render without it (see the
 * page's own REGISTRAR_FEATURE_ENABLED check) — so `registrarEnabled` controls the iframe's src
 * itself rather than anything reachable from outside the iframe's own document.
 * @param {HTMLElement} container #wp-screen-body
 * @param {{registrarEnabled: boolean}} state
 */
export function renderHousingScreen(container, { registrarEnabled }) {
    const src = registrarEnabled ? `${MAPS_BASE_URL}/weyland_dorms.html?registrar=true` : `${MAPS_BASE_URL}/weyland_dorms.html`;
    container.innerHTML = `<iframe class="wp-housing-iframe" src="${src}" title="Housing Directory"></iframe>`;
}

const YIKYAK_VOTE_RE = /\s*\+(\d+)\s*$/;

/**
 * Best-effort decoration for a Discord item — flags @luckypaww's posts as a system/server notice,
 * and pulls out the bolded "**@handle**" username lib/phoneAppFormatting.js's shared parser already
 * captures into `item.boldPrefix` (the same mechanism the Chronicle renderer uses for headlines
 * below) so it can be rendered as its own bold span instead of plain body text. Channel identity is
 * NOT extracted from the item text: lib/phoneAppPrompts.js's discord prompt puts each channel in
 * its own "## #channel-name" section header (rendered as this section's title, see
 * renderPhoneAppScreen below), so the message body never needs to name its own channel. Gracefully
 * falls through to plain, unbolded text if boldPrefix is missing or doesn't actually prefix the
 * text — never assumes the model's output matches perfectly.
 * @param {{text: string, boldPrefix?: string}} item
 * @returns {{isServerPost: boolean, username: string|null, text: string}}
 */
function decorateDiscordItem(item) {
    const hasUsername = Boolean(item.boldPrefix) && item.text.startsWith(item.boldPrefix);
    const isServerPost = /^\[?@luckypaww\]?/.test(hasUsername ? item.boldPrefix : item.text);
    const text = hasUsername ? item.text.slice(item.boldPrefix.length).trim() : item.text;
    return { isServerPost, username: hasUsername ? item.boldPrefix : null, text };
}

/**
 * Best-effort decoration for a Yik Yak item's text — extracts a trailing "+NN" vote count (if
 * present, per the yikyak prompt's own "optionally a vote count like '+47' at the end"
 * instruction) into a separate pill, leaving the remaining text vote-count-free.
 * @param {string} text
 * @returns {{voteCount: number|null, text: string}}
 */
function decorateYikYakItem(text) {
    const match = text.match(YIKYAK_VOTE_RE);
    if (!match) return { voteCount: null, text };
    return { voteCount: Number(match[1]), text: text.slice(0, match.index).trim() };
}

/**
 * @param {HTMLElement} container #wp-screen-body
 * @param {{appLabel: string, entry: {content: {sections: Array<{title: string, items: Array<{text: string, timestamp?: string}>}>}, generatedAt: number} | undefined, isGenerating: boolean, formatRelativeTime: (epochMs: number) => string}} state
 */
export function renderPhoneAppScreen(container, { appLabel, entry, isGenerating, formatRelativeTime }) {
    const refreshButton = `<button id="wp-phone-app-refresh-button" class="menu_button"${isGenerating ? ' disabled' : ''}>${isGenerating ? 'Loading…' : 'Refresh'}</button>`;

    if (!entry || !entry.content || entry.content.sections.length === 0) {
        container.innerHTML = `
<div class="wp-empty-state">No ${escapeHtml(appLabel)} content yet. Tap Refresh to generate it.</div>
<div id="wp-phone-app-actions">${refreshButton}</div>`;
        return;
    }

    const sectionsHtml = entry.content.sections.map(section => {
        // A section title that's just the app's own name (e.g. Yik Yak's prompt only ever
        // produces one flat "YIK YAK" section; Discord's prompt is instructed to always split into
        // per-channel "## #channel-name" sections, but a real model doesn't always follow
        // instructions perfectly and can still fall back to one flat "## DISCORD" section) is
        // entirely redundant with the panel's own header title — suppress it rather than showing
        // the same name twice. A genuine per-channel/per-subsection title (e.g. "#announcements",
        // "WEYLAND ALERTS") is never equal to the app label, so it always stays visible.
        const sectionTitleHtml = section.title.toUpperCase() === appLabel.toUpperCase()
            ? ''
            : `<div class="wp-phone-app-section-title">${escapeHtml(section.title)}</div>`;
        return `
<div class="wp-phone-app-section">
    ${sectionTitleHtml}
    ${section.items.map(item => {
        if (appLabel === 'Discord') {
            const decorated = decorateDiscordItem(item);
            const serverClass = decorated.isServerPost ? ' wp-discord-server-post' : '';
            const usernameHtml = decorated.username
                ? `<span class="wp-discord-username">${escapeHtml(decorated.username)}</span> `
                : '';
            return `
    <div class="wp-phone-app-item wp-discord-item${serverClass}">
        ${decorated.isServerPost ? '<span class="wp-discord-server-tag">SERVER</span>' : ''}
        ${item.timestamp ? `<span class="wp-phone-app-timestamp">${escapeHtml(item.timestamp)}</span>` : ''}
        ${usernameHtml}<span class="wp-phone-app-item-text">${escapeHtml(decorated.text)}</span>
    </div>`;
        }
        if (appLabel === 'Yik Yak') {
            const decorated = decorateYikYakItem(item.text);
            return `
    <div class="wp-phone-app-item wp-yikyak-item">
        <span class="wp-phone-app-item-text">${escapeHtml(decorated.text)}</span>
        ${decorated.voteCount !== null ? `<span class="wp-yikyak-vote-pill">+${decorated.voteCount}</span>` : ''}
    </div>`;
        }
        if (appLabel === 'The Chronicle' && item.boldPrefix && item.text.startsWith(item.boldPrefix)) {
            const rest = item.text.slice(item.boldPrefix.length).trim();
            return `
    <div class="wp-phone-app-item wp-chronicle-item">
        ${item.timestamp ? `<span class="wp-phone-app-timestamp">${escapeHtml(item.timestamp)}</span>` : ''}
        <span class="wp-chronicle-headline">${escapeHtml(item.boldPrefix)}</span>
        <span class="wp-phone-app-item-text">${escapeHtml(rest)}</span>
    </div>`;
        }
        return `
    <div class="wp-phone-app-item">
        ${item.timestamp ? `<span class="wp-phone-app-timestamp">${escapeHtml(item.timestamp)}</span>` : ''}
        <span class="wp-phone-app-item-text">${escapeHtml(item.text)}</span>
    </div>`;
    }).join('')}
</div>`;
    }).join('');

    container.innerHTML = `
<div id="wp-phone-app-meta">Refreshed ${escapeHtml(formatRelativeTime(entry.generatedAt))}</div>
<div id="wp-phone-app-content">${sectionsHtml}</div>
<div id="wp-phone-app-actions">${refreshButton}</div>`;
}

/**
 * One Twitter post card — shared by the feed screen and profile screens. Retweets nest the
 * original post's text with a thin left border (same visual grammar as Discord's reply-thread
 * nesting), with a small "Retweeted" label above.
 * @param {{authorName: string, handle: string, text: string, likes: number, retweets: number, views: number, isRetweet: boolean, retweetedFrom?: string, retweetedText?: string}} post
 * @param {Record<string, {primaryUrl: string|null, fallbackUrl: string|null, initial: string|null}>} portraitMap
 */
function twitterPostCardMarkup(post, portraitMap) {
    const statsRow = `
<div class="wp-twitter-post-stats">
    <span class="wp-twitter-stat">❤ ${post.likes}</span>
    <span class="wp-twitter-stat">🔁 ${post.retweets}</span>
    <span class="wp-twitter-stat">👁 ${post.views}</span>
</div>`;

    const bodyHtml = post.isRetweet
        ? `<div class="wp-twitter-retweet-label">🔁 Retweeted from ${escapeHtml(post.retweetedFrom)}</div>
<div class="wp-twitter-retweet-body">${escapeHtml(post.retweetedText)}</div>`
        : `<div class="wp-twitter-post-text">${escapeHtml(post.text)}</div>`;

    // The avatar and name/handle header are both clickable, navigating to that author's own
    // profile page (index.js's click delegation matches this class, same as a Following-list
    // item) — a retweet's authorName is whoever DID the retweeting (this post's real owner), not
    // the original poster named in retweetedFrom, so that's who a click here correctly goes to.
    const authorName = escapeHtml(post.authorName);
    return `
<div class="wp-twitter-post">
    <div class="wp-twitter-post-author-link" data-name="${authorName}">${avatarMarkup(portraitMap[post.authorName])}</div>
    <div class="wp-twitter-post-main">
        <div class="wp-twitter-post-header wp-twitter-post-author-link" data-name="${authorName}">
            <span class="wp-twitter-post-name">${authorName}</span>
            <span class="wp-twitter-post-handle">${escapeHtml(post.handle)}</span>
        </div>
        ${bodyHtml}
        ${statsRow}
    </div>
</div>`;
}

/**
 * @param {HTMLElement} container #wp-screen-body
 * @param {{entry: {content: {posts: Array}, generatedAt: number} | undefined, isGenerating: boolean, formatRelativeTime: (epochMs: number) => string, portraitMap: Record<string, {primaryUrl: string|null, fallbackUrl: string|null, initial: string|null}>}} state
 */
export function renderTwitterFeedScreen(container, { entry, isGenerating, formatRelativeTime, portraitMap }) {
    const refreshButton = `<button id="wp-phone-app-refresh-button" class="menu_button"${isGenerating ? ' disabled' : ''}>${isGenerating ? 'Loading…' : 'Refresh'}</button>`;
    const followingLink = '<button id="wp-twitter-following-link" class="menu_button wp-secondary-button">Following →</button>';

    if (!entry || !entry.content || !entry.content.posts || entry.content.posts.length === 0) {
        container.innerHTML = `
${followingLink}
<div class="wp-empty-state">No Twitter content yet. Tap Refresh to generate it.</div>
<div id="wp-phone-app-actions">${refreshButton}</div>`;
        return;
    }

    const postsHtml = entry.content.posts.map(post => twitterPostCardMarkup(post, portraitMap)).join('');

    container.innerHTML = `
${followingLink}
<div id="wp-phone-app-meta">Refreshed ${escapeHtml(formatRelativeTime(entry.generatedAt))}</div>
<div id="wp-twitter-feed-content">${postsHtml}</div>
<div id="wp-phone-app-actions">${refreshButton}</div>`;
}

/**
 * Static, instant, NOT model-generated — a plain list derived from the structured roster.
 * @param {HTMLElement} container #wp-screen-body
 * @param {{roster: Array<{name: string, handle: string}>, portraitMap: Record<string, {primaryUrl: string|null, fallbackUrl: string|null, initial: string|null}>}} state
 */
export function renderTwitterFollowingScreen(container, { roster, portraitMap }) {
    container.innerHTML = roster.map(character => `
<div class="wp-list-item wp-twitter-following-item" data-name="${escapeHtml(character.name)}">
    ${avatarMarkup(portraitMap[character.name])}
    <div class="wp-list-item-main">
        <div class="wp-list-item-title">${escapeHtml(character.name)}</div>
        <div class="wp-list-item-snippet">${escapeHtml(character.handle)}</div>
    </div>
</div>`).join('');
}

/**
 * @param {HTMLElement} container #wp-screen-body
 * @param {{character: {name: string, handle: string} | undefined, portraitMap: Record<string, {primaryUrl: string|null, fallbackUrl: string|null, initial: string|null}>, entry: {content: {posts: Array}, generatedAt: number} | undefined, isGenerating: boolean, formatRelativeTime: (epochMs: number) => string}} state
 */
export function renderTwitterProfileScreen(container, { character, portraitMap, entry, isGenerating, formatRelativeTime }) {
    if (!character) {
        container.innerHTML = '<div class="wp-empty-state">Character not found.</div>';
        return;
    }
    const refreshButton = `<button id="wp-phone-app-refresh-button" class="menu_button"${isGenerating ? ' disabled' : ''}>${isGenerating ? 'Loading…' : 'Refresh'}</button>`;
    // The bio is model-generated content (lib/twitterPrompts.js's "## BIO" section, parsed by
    // lib/twitterParsing.js), not a static field on `character` — it's only available once a
    // generation has actually completed, hence the optional chaining.
    const bioHtml = entry?.content?.bio
        ? `<div class="wp-twitter-profile-bio">${escapeHtml(entry.content.bio)}</div>`
        : '';
    const header = `
<div class="wp-twitter-profile-header">
    ${avatarMarkup(portraitMap[character.name])}
    <div class="wp-twitter-profile-name">${escapeHtml(character.name)}</div>
    <div class="wp-twitter-profile-handle">${escapeHtml(character.handle)}</div>
    ${bioHtml}
</div>`;

    if (!entry || !entry.content || !entry.content.posts || entry.content.posts.length === 0) {
        container.innerHTML = `${header}
<div class="wp-empty-state">No posts yet. Tap Refresh to generate them.</div>
<div id="wp-phone-app-actions">${refreshButton}</div>`;
        return;
    }

    const postsHtml = entry.content.posts.map(post => twitterPostCardMarkup(post, portraitMap)).join('');

    container.innerHTML = `${header}
<div id="wp-phone-app-meta">Refreshed ${escapeHtml(formatRelativeTime(entry.generatedAt))}</div>
<div id="wp-twitter-feed-content">${postsHtml}</div>
<div id="wp-phone-app-actions">${refreshButton}</div>`;
}

/**
 * @param {HTMLElement} container #wp-screen-body
 * @param {Array<{id: string, charName: string, lastMessageSnippet: string, lastActive: number, isTyping?: boolean}>} summaries
 * @param {(epochMs: number) => string} formatRelativeTime
 * @param {Record<string, {primaryUrl: string|null, fallbackUrl: string|null, initial: string|null}>} portraitMap keyed by charName
 */
export function renderMessagesScreen(container, summaries, formatRelativeTime, portraitMap) {
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

const WEYBOORU_PORTRAIT_BASE_URL = 'https://cast.weybooru.com/images/portraits';

/**
 * A single selectable contact card for the "To:" composer — used both in the always-visible
 * Favorites section and the dynamic Matches section. `favorited` controls whether the star renders
 * filled or outline; clicking the star (data-star-for) toggles favorite state without adding a tag,
 * clicking anywhere else on the card (data-contact-for) adds it as a tag — see index.js's
 * delegated click handler for the split between these two behaviors.
 * @param {{fullName: string, entryName: string, portraitFirstName: string}} contact
 * @param {boolean} favorited
 * @returns {string}
 */
function contactCardMarkup(contact, favorited) {
    const starIcon = favorited ? 'fa-solid fa-star' : 'fa-regular fa-star';
    return `
<div class="wp-contact-card" data-contact-for="${escapeHtml(contact.entryName)}">
    <img class="wp-avatar" src="${escapeHtml(WEYBOORU_PORTRAIT_BASE_URL)}/${escapeHtml(contact.portraitFirstName)}.jpg" alt="" />
    <div class="wp-contact-card-name">${escapeHtml(contact.entryName)}</div>
    <button class="wp-contact-star" data-star-for="${escapeHtml(contact.entryName)}" title="${favorited ? 'Unfavorite' : 'Favorite'}"><i class="${starIcon}"></i></button>
</div>`;
}

/**
 * @param {HTMLElement} container #wp-screen-body
 * @param {{
 *   roster: Array<{fullName: string, entryName: string, portraitFirstName: string}>,
 *   favoriteEntryNames: string[],
 *   query: string,
 *   tags: string[],
 * }} state `query` is the current raw text in the "To:" input (untagged remainder); `tags`
 *   are the entryNames already committed as tags.
 */
export function renderContactComposerScreen(container, { roster, favoriteEntryNames, query, tags }) {
    const favoriteSet = new Set(favoriteEntryNames);
    const tagSet = new Set(tags);
    const favorites = roster.filter(c => favoriteSet.has(c.entryName) && !tagSet.has(c.entryName));

    const trimmedQuery = query.trim().toLowerCase();
    const matches = trimmedQuery
        ? roster.filter(c => !tagSet.has(c.entryName) && c.fullName.toLowerCase().includes(trimmedQuery))
        : [];

    const tagsMarkup = tags.map(entryName => `
<span class="wp-to-tag" data-tag-for="${escapeHtml(entryName)}">${escapeHtml(entryName)}<button class="wp-to-tag-remove" data-tag-remove-for="${escapeHtml(entryName)}" title="Remove"><i class="fa-solid fa-xmark"></i></button></span>`).join('');

    const favoritesSection = favorites.length
        ? `<div class="wp-contact-section-label">Favorites</div><div class="wp-contact-card-grid">${favorites.map(c => contactCardMarkup(c, true)).join('')}</div>`
        : '';
    const matchesSection = trimmedQuery
        ? (matches.length
            ? `<div class="wp-contact-section-label">Matches</div><div class="wp-contact-card-grid">${matches.map(c => contactCardMarkup(c, favoriteSet.has(c.entryName))).join('')}</div>`
            : '<div class="wp-empty-state">No matching contacts.</div>')
        : '';

    container.innerHTML = `
<div id="wp-to-row">
    <span id="wp-to-tags">${tagsMarkup}</span>
    <input type="text" id="wp-to-input" placeholder="To:" value="${escapeHtml(query)}" autocomplete="off" />
</div>
<div id="wp-contact-lists">
${favoritesSection}
${matchesSection}
</div>
<button id="wp-start-conversation-button" class="menu_button" ${tags.length === 0 ? 'disabled' : ''}>Start Conversation</button>`;
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
            <button type="button" class="wp-popup-menu-item" data-action="new-thread">Start New Thread</button>
            <button type="button" class="wp-popup-menu-item" data-action="switch-threads">Switch Threads</button>
            <button type="button" class="wp-popup-menu-item" data-action="select">Delete Messages</button>
            <button type="button" class="wp-popup-menu-item" data-action="memory">Memories</button>
            <button type="button" class="wp-popup-menu-item" data-action="regenerate">Regenerate</button>
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
 * The "..." trigger button (#wp-regenerate-button) is always enabled — the menu itself must
 * always be reachable, since Memory should be addable even before a conversation's first message
 * (e.g. to frame/set up context before ever sending anything). Only the
 * individual Regenerate/Delete Messages items are conditionally disabled, since those genuinely
 * have nothing to act on with zero (or zero-regeneratable) messages — Memory is never disabled.
 * @param {HTMLElement} menuEl #wp-regenerate-menu
 * @param {{canRegenerate: boolean, hasMessages: boolean}} state
 */
export function setRegenerateMenuItemsEnabled(menuEl, { canRegenerate, hasMessages }) {
    const regenerateItem = menuEl.querySelector('[data-action="regenerate"]');
    const selectItem = menuEl.querySelector('[data-action="select"]');
    if (regenerateItem) regenerateItem.disabled = !canRegenerate;
    if (selectItem) selectItem.disabled = !hasMessages;
}

/**
 * @param {HTMLInputElement} checkboxEl #wp-tethered-checkbox
 * @param {{checked: boolean, disabled: boolean}} state
 */
export function setTetheredToggleState(checkboxEl, { checked, disabled }) {
    checkboxEl.checked = checked;
    checkboxEl.disabled = disabled;
}

/**
 * @param {HTMLInputElement} checkboxEl #wp-registrar-checkbox
 * @param {boolean} checked
 */
export function setRegistrarToggleState(checkboxEl, checked) {
    checkboxEl.checked = checked;
}

/**
 * @param {HTMLElement} container #wp-screen-body
 * @param {Array<{id: string, content: string, pinned: boolean}>} memories
 * @param {string|null} [editingMemoryId] id of the memory currently in inline-edit mode
 * @param {{isGenerating?: boolean, canGenerateNow?: boolean, canRegenerateLast?: boolean}} [state]
 */
export function renderMemoryScreen(container, memories, editingMemoryId = null, state = {}) {
    // `tethered` is intentionally read but not rendered here — the tethered toggle itself lives
    // in the header, not the Memory screen; it's accepted as a state param only because
    // index.js's single rerenderMemoryScreen call site assembles one state object for everything.
    const {
        isGenerating = false, canGenerateNow = true, canRegenerateLast = true,
        tethered = false, tetheredHistoryCap = null,
    } = state;
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
    <div id="wp-tethered-settings">
        <div class="wp-memory-settings-subheading">Tethered mode</div>
        <label class="wp-memory-settings-label wp-checkbox-label">
            <input type="checkbox" id="wp-tethered-full-history-checkbox" ${tetheredHistoryCap === null ? 'checked' : ''} />
            All messages since the main roleplay's last memory
        </label>
        <label class="wp-memory-settings-label">Or, last
            <input type="number" id="wp-tethered-history-cap-input" min="1" value="${tetheredHistoryCap ?? ''}" ${tetheredHistoryCap === null ? 'disabled' : ''} />
            messages of the main roleplay
        </label>
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
