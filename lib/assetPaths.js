// lib/assetPaths.js

// Extension assets are served at this fixed base path regardless of where the extension's own
// repo actually lives on disk (data/default-user/extensions/ here) — SillyTavern resolves any
// "third-party"-registered extension's static files under /scripts/extensions/third-party/<dir>,
// matching the convention already used by sibling extensions (e.g. Weyland-EchoText's BASE_URL).
// Shared by lib/panel.js (app-tile icons) and lib/portraits.js (PSA/business account portraits).
export const ASSET_BASE_URL = '/scripts/extensions/third-party/Weyland-WeyPhone/assets';
