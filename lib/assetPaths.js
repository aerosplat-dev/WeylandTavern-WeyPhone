// lib/assetPaths.js

// Derived from this module's own script URL rather than any hardcoded literal — both the
// extension's on-disk folder NAME and the URL PREFIX it's served under can vary by install:
//   - data/<username>/extensions/<folder>/ (per-user "third-party" extension, any username, not
//     just "default-user") is served at /scripts/extensions/third-party/<folder>/...
//     (src/users.js's createExtensionsRouteHandler — a literal fs.existsSync against
//     req.user.directories.extensions, no manifest-driven aliasing).
//   - public/scripts/extensions/third-party/<folder>/ (the global fallback for the above,
//     PUBLIC_DIRECTORIES.globalExtensions in src/constants.js) is served at the SAME
//     /scripts/extensions/third-party/<folder>/... prefix.
//   - public/scripts/extensions/<folder>/ (a bundled/global extension, no "third-party" segment at
//     all — see this codebase's own bundled Weyland-* extensions) is served at the DIFFERENT
//     /scripts/extensions/<folder>/... prefix instead, via plain static file serving.
// So neither the folder name nor the "third-party" segment can be assumed fixed and reconstructed —
// an earlier version of this file hardcoded the folder name only and assumed "third-party" was
// always present, which is wrong for the plain public/scripts/extensions/<folder> install case.
// SillyTavern always loads this extension's JS via a real `<script type="module" src="...">` tag
// pointing at wherever the folder actually lives, so resolving ".." against this module's own
// import.meta.url walks up exactly one level (out of lib/) to the extension root's real, currently-
// served URL, correct under any of the above mount conventions with zero assumptions about either
// the folder name or the prefix structure.
export const EXTENSION_BASE_URL = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// Shared by lib/panel.js (app-tile icons) and lib/portraits.js (PSA/business account portraits).
export const ASSET_BASE_URL = `${EXTENSION_BASE_URL}/assets`;

// Shared by lib/panel.js — the Housing app's standalone floor-map page lives here, a sibling of
// assets/ at the extension root, not under it.
export const MAPS_BASE_URL = `${EXTENSION_BASE_URL}/maps`;
