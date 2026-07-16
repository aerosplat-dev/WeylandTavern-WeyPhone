// lib/assetPaths.js

// Derived from this module's own script URL rather than a hardcoded folder-name string.
// SillyTavern serves a third-party extension's static files from whatever its folder is actually
// named on disk (src/users.js's createExtensionsRouteHandler does a literal fs.existsSync lookup
// against the real directory name — there's no manifest-driven aliasing), and that name is NOT
// guaranteed to match any string baked into this repo's own code: a fresh `git clone` of this
// extension's repo defaults to whatever the GitHub repo is currently named (which can drift from a
// legacy local folder name still in use elsewhere — confirmed live: this repo is named
// "WeylandTavern-WeyPhone" on GitHub, but at least one existing install still uses the older
// "Weyland-WeyPhone" folder name, and a previous hardcoded literal here only matched the latter).
//
// SillyTavern always loads this extension's JS via a real `<script type="module" src="...">` tag
// pointing at wherever the folder actually lives, so import.meta.url reflects the real, current
// install path on any OS. Only the folder-name segment is pulled out of it (rather than using the
// full resolved path) — import.meta.url is an http(s) URL under `/scripts/extensions/third-party/`
// in the real browser, but a `file://` filesystem path when this module is loaded directly by a
// test runner, so reusing the whole path would either break under test or (worse) reintroduce a
// different flavor of the same machine-specific-path bug this is meant to fix. The
// `/scripts/extensions/third-party/` mount prefix itself is a genuine SillyTavern routing constant
// (see src/users.js), not something that varies by install, so it stays a literal here.
const pathSegments = new URL(import.meta.url).pathname.split('/').filter(Boolean);
const folderName = pathSegments[pathSegments.length - 3]; // .../<folder>/lib/assetPaths.js
export const EXTENSION_BASE_URL = `/scripts/extensions/third-party/${folderName}`;

// Shared by lib/panel.js (app-tile icons) and lib/portraits.js (PSA/business account portraits).
export const ASSET_BASE_URL = `${EXTENSION_BASE_URL}/assets`;

// Shared by lib/panel.js — the Housing app's standalone floor-map page lives here, a sibling of
// assets/ at the extension root, not under it.
export const MAPS_BASE_URL = `${EXTENSION_BASE_URL}/maps`;
