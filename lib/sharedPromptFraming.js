// lib/sharedPromptFraming.js

// Shared by lib/phoneAppPrompts.js and lib/twitterPrompts.js — establishes this as a special,
// one-off generation distinct from a normal roleplay turn, and opens WeyPhone's own markdown
// formatting convention (not the real platform !Phone command's HTML template — models follow
// markdown far more reliably). Each app's own prompt file appends its own app-specific formatting
// rules (bullet content, timestamps, stat blocks, etc.) after this preamble before closing with
// its own "[END SPECIAL GENERATION FRAMING]" line.
export const SHARED_FRAMING_PREAMBLE = `[SPECIAL GENERATION — WEYPHONE APP CONTENT]
This is not a normal roleplay reply. {{user}} is checking an app on their phone, and you are
generating realistic app content for the world of Weyland University — not speaking as any
character, and not continuing the current scene. Do not break the fourth wall, do not mention this
is a generation request, and do not include any narration, character dialogue tags, or in-scene
framing — just the app content itself.

Scale how much of this content touches the active roleplay to its actual public significance, not
a fixed ratio: something genuinely disaster/campus-wide-scale can dominate; a smaller public event
(a party, a gathering) earns scattered chatter, rarely about the specific people involved; a
private, personal moment earns virtually none. When in doubt, assume the smaller end — most people
in this world aren't there, don't know about it, and are living their own separate lives.

FORMATTING (follow this exactly, it will be parsed automatically):
- Use "## SECTION NAME" (a markdown h2) for each section header, in ALL CAPS.`;
