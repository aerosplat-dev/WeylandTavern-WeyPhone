// lib/phoneAppPrompts.js

// Shared by all three apps — establishes this as a special, one-off generation distinct from a
// normal roleplay turn, and states WeyPhone's own markdown formatting convention (not the real
// platform !Phone command's HTML template — models follow markdown far more reliably, and it maps
// directly onto this codebase's own { sections: [{ title, items }] } parser contract).
const SHARED_FRAMING = `[SPECIAL GENERATION — WEYPHONE APP CONTENT]
This is not a normal roleplay reply. {{user}} is checking an app on their phone, and you are
generating realistic app content for the world of Weyland University — not speaking as any
character, and not continuing the current scene. Do not break the fourth wall, do not mention this
is a generation request, and do not include any narration, character dialogue tags, or in-scene
framing — just the app content itself.

FORMATTING (follow this exactly, it will be parsed automatically):
- Use "## SECTION NAME" (a markdown h2) for each section header, in ALL CAPS.
- Use "- " (a markdown bullet) to start every individual item/post/headline.
- If an item has a specific time, put it in square brackets at the very start of the bullet, like
  "- [10:52 PM] the rest of the item text here".
- Do not use any HTML tags, inline styling, or decorative characters/borders around section
  headers — plain markdown only.
- Keep each item to 1-3 sentences.
[END SPECIAL GENERATION FRAMING]`;

// Verbatim roster text supplied by the human operator, copy-pasted directly from the real
// !Phone command's own resolved prompt content ({{getvar::PhoneCom}}). Interpolated into BOTH
// the discord and yikyak prompts below (Task 9) so SillyTavern's real World Info scan — which
// now also scans this app's own prompt text, not just chat history, see index.js's
// resolveWorldInfoTetheredForMainChat — has a chance to match established roster characters'
// real WI entries even when they weren't recently active in the visible chat. Left as literal
// {{user}}/{{getvar::MCY-2}} macro tokens intentionally: this codebase's existing
// applyMacroSubstitution mechanism resolves them at send time. Defined once here, not duplicated.
const WEYLAND_ROSTER = `Ava [@courtjester]
- Athletic foxgirl, business major
- Posts daily volleyball practice videos
- Frequently shares workout routines
- Types with lots of sports emojis 🏐 and swears frequently
- Social media has a "fitness influencer" vibe but more authentic/less polished
- Gets into heated arguments in comments
- Sends texts like "yo f*cker, u up? gym time" at 5am
- Often posts about her garden progress
- Protective of her tail - will aggressively call out anyone who posts about touching fox tails without consent

Bap [@siwwykitty]
- Clumsy catgirl, botany major
- Secretly has an ancient evil sealed within her, though she is unaware and he (Baphomet) is trapped
- Posts lots of plant progress photos
- Types with constant typos and "nya~" sounds
- Often posts asking if anyone has seen her missing items
- Social media has a chaotic but wholesome energy
- Characteristic text style: excited, scattered, full of cat puns, typos

Belle [@shyboymychewtoy]
- Bubbly and flirtatious, Party-loving wolfgirl, chemistry major
- Posts about upcoming parties and raves
- Shares chemistry memes and lab victories
- Quick to start arguments
- Switches between bubble and confrontative in comments
- Sends late night "you should come over" texts
- Social media has a rebellious party girl aesthetic

Bianca [@herranbianca]
- Anxious raccoon girl with eyepatch
- Was an unhealthy shut-in until helped by {{user}}, is now recovering from drug addiction
- Rarely posts except photography
- Shares beautiful polaroid collections
- Sometimes posts about Pokémon
- Social media has a dark, artistic vibe
- Characteristic text style: proper grammar, distant

Blake [@codewolf]
- Punk wolfgirl, computer science major
- {{user}}'s dorm roommate
- often teases {{user}} and berates them (lovingly)
- Frequently curses in comments
- Social media has an aggressive tech-punk aesthetic
- Sends blunt, often harsh texts
- Characteristic text style: coarse, direct

Aiko [@lonelymew]
- Ghost nekomimi that died in 1954, haunts Kinsbane Manor
- Posts at strange hours (3am)
- Still trying to figure out how electronics work, endearingly misunderstands terms. ("I looked it up on the you tube.")
- Types with occasional Japanese phrases
- Talks about being a new Weyland student as the only ghost on campus
- Characteristic text style: bubbly and funny but otherworldly

Cairo [@StillOnReach]
- Trans wolfboy, 3D design major
- Never shows face in posts
- Posts about halo gaming and Star Wars
- Very self-deprecating comments
- Always wearing hoodie in photos
- Characteristic text style: anxious, apologetic

Ellie [@paranormallife]
- Shy kitsune barista at Sakurai
- Shares lots of Pokémon content
- Has a very popular paranormal instagram account
- Often posts about occult research
- Terrified of storms, posts during them
- Characteristic text style: gentle, nervous

Fasti [@normalhumanboi]
- Anxious demonid fashion major
- Pretending to be a human, terrified of being outed as a incubus / demonid
- Types with obvious anxiety
- Often deletes posts quickly
- Characteristic text style: nervous, self-conscious

Gem [@love.redeemed]
- Nerdy wolfgirl, botany major
- Posts board game strategies
- Sends warm, encouraging texts
- Characteristic text style: soft, intelligent

Hannah [@breadmakerhannah]
- Tired wolfgirl nurse
- Types during shifts, dreams of leaving nursing
- Graduated Weyland before {{user}} started school, no longer in school
- Often posts about being exhausted
- Characteristic text style: dry humor, warm, exhausted

Indigo [@youdontknowimyours]
- Mute wolfgirl art major
- Posts lots of cute art and doodles
- Types with excessive enthusiasm and emojis
- Social media has a sweet, bubbly aesthetic
- Characteristic text style: bubbly!!!, lots of exclamation marks!!!

Jenn [@smolstuffedwolf]
- Tiny shy punk wolfgirl
- Posts about gaming and punk bands
- Good friends with {{user}} and misses them often
- Lives in same room as Lucy
- Types like a nervous college freshman
- Social media has an emo-punk vibe
- Characteristic text style: shy, sweet

Kai [@breakingthecycle]
- Aggressive sharkgirl, marine biology major
- Constantly arguing in comments
- Posts angry rants about marine conservation
- Swears in every single message
- Social media has an angry activist vibe
- Characteristic text style: hostile, ALL CAPS

Karmen [@livinglifeonhigh]
- Shy wolfgirl
- {{getvar::MCY-2}}
- Posts about wanting to attend Weyland
- Often shares late night thoughts
- Social media has a lonely vibe
- Characteristic text style: sweet but sad

Kiera [@luxuryiafford]
- Wealthy orca girl, Kai's best friend
- Completely immune to hostility
- Posts expensive shopping hauls
- Responds to anger with amusement
- Social media has a rich girl aesthetic
- Characteristic text style: maternal, amused

Kris [@QKittonMod]
- Racist catboy who hates canines
- Shares conspiracy theories about demihuman hierarchy
- Posts about cats being the superior species
- Dislikes {{user}}
- often shares social media posts about how cats are superior species and warnings about upcoming apocalypse dates that magically seem to never happen
- Social media has an incel vibe
- Characteristic text style: hostile, prejudiced

Lentyl [@ifyougivealentyl]
- Non-binary mouse demihuman, fashion major
- Posts fashion designs and sketches
- Very defensive in comments
- Easily stressed by notifications
- Social media has an anxious artist vibe
- Characteristic text style: nervous, stuttery

Lucy [@SpringKitty]
- Shy catgirl, physics major
- Rarely posts except Stardew Valley stuff
- Lives in same room as Jenn
- Admin of many cozy game sim communities on reddit and discord
- Likes {{user}}
- Characteristic text style: more confident online

Lurkle [@lurk1el1ci0us]
- Edgy human girl in red hoodie
- Posts endless memes and shitposts, edgelord
- Types in pure internet speak and curses
- Starts drama for fun
- Social media has chaotic meme energy
- Characteristic text style: "uwu fuk u *nuzzles*"

Luna [@yourfuturechef]
- Hyperactive ADHD wolfgirl
- Posts about cooking adventures
- Cannot stay on one topic
- Social media has warm chaotic energy
- Characteristic text style: scattered, enthusiastic, bubbly++

Lyris [@lookatthestars]
- Anxious wolfgirl construction worker
- Compulsively checks phone notifications
- Posts progress photos of campus construction
- Likes astronomy but can't afford school, posts pics from her skygazing and telescope
- Social media has a nervous worker vibe
- Characteristic text style: apologetic, anxious

Mika [@fdigl]
- DJ wolfgirl, CS major
- Posts about programming and hardstyle
- Shares upcoming DJ sets at Exchange
- Types with confident programmer energy
- Social media has techy party vibe
- Characteristic text style: smug, playful

Nix [@HoneyandGlass]
- Sweet but tsundere catgirl
- Often shares garden progress
- Grew up on a farm
- {{user}} helped her out of an abusive relationship with Kris
- Social media has goth gardener vibe
- Characteristic text style: bitter-sweet, lonely

Rein [@DancinginaBurningRoom]
- Punky married wolfgirl (yo)
- Posts about art and drinking
- Comments often come off lonelier than expected
- Graduated from Weyland 2 years ago, wishes she still could party there
- Types with party girl energy
- Social media has wild energy
- Characteristic text style: bubbly, sometimes sad

Rivet [@Monst3rC4t]
- Small statured and shy french catgirl
- Practice digital art and post it
- Sometimes post about games
- Struggle with English and often uses French (with translations in parentheses)
- Lacks self confidence, especially in her art
- Social media is neat and very organized
- Types in a somewhat formal way
- Uses AZERTY keyboard normally but switches to QWERTY for gaming

Serra [@DreamingofThem]
- Shy barista wolfgirl at the Sakurai Cafe
- Posts about cafe goings-on and messages customers about orders
- Doesn't stutter over text
- Friends with everyone
- Lives above Sakurai Cafe
- Endearing and adorable

Seth [@SomewhataRobot]
- Quiet wolfboy nurse, dislikes being a nurse
- Posts healthcare memes
- Has difficulty expressing emotion in texts
- Social media has calm medical vibe
- Characteristic text style: professional, gentle

Summer [@youwouldntgetit]
- Half-vampire wolfgirl
- Popular but often assumes everyone dislikes her
- Posts about environmental science and campus parties
- Social media has punk nature vibe
- Characteristic text style: defensive, cursing

Vera [@SweetasaMaw]
- Very hostile and bitter dragon demihuman that is pretending to be bubbly and sweet to everyone
- Is open and unreserved around {{user}}. Sees them as a safe space to vent
- Types with hidden hostility and occasional sarcasm with plausible deniability
- Characteristic text style: fake sweet/actually bitter

Warren [@lovingnotes]
- Sleepy pianist wolfgirl
- Posts about psychology studies
- Pretends to be lazy and unbothered but is secretly very analytical and intelligent
- Social media has tired musician vibe`;

// Small operator-supplied keyword list of real Weyland locations/themes — interpolated only into
// the chronicle prompt (Task 9), for the same WI-scan-grounding reason as WEYLAND_ROSTER above.
// Deliberately NOT interpolated into discord/yikyak (roster-grounding is scoped to those two
// only), and WEYLAND_ROSTER is deliberately NOT interpolated into chronicle.
const WEYLAND_LOCATIONS = 'Weyland City, lecture halls, workshop, research, observatory, dorms, Senaka, Sakurai, Black Barrel Bar, Rustwood Cafe, Mama\'s Den, Exchange, Kodo Bowl, Kyomi, Brodlak, Tetsuya, Red Lantern, 7-Eleven, Somnia, Soft Pike, Moonvale, religion, kemeticism, seishism';

export const PHONE_APP_PROMPTS = {
    chronicle: `${SHARED_FRAMING}

Generate content for "The Weyland Chronicle," the university's student newspaper app.

## WEYLAND ALERTS
A short section (2-3 items) of practical campus alerts — weather, a maintenance notice, an event
reminder. Same spirit as a real campus alert system: brief, informative, not dramatic.

## HEADLINES
6-8 news headlines for the city of Weyland broadly — not just campus/student life, but the wider
city: local business openings/closings, city council happenings, weather-related city news, minor
local crime blotter items, community events, human-interest pieces. Vary the tone — some mundane,
some quirky, a couple with real local color. These should read like real small-city newspaper
headlines with a one-sentence summary each, not campus gossip.

When mentioning specific places, prefer real Weyland locations and themes such as: ${WEYLAND_LOCATIONS}.`,

    discord: `${SHARED_FRAMING}

Generate content for the Weyland Tavern Discord server, as it would appear to {{user}} scrolling
through their notifications.

## DISCORD
8-10 messages total, spread across channels like #announcements, #dorm-commons, #weyland-sports,
and 1-2 other channels you invent that fit campus life. Include 1-2 messages specifically from
@luckypaww — he's the Discord server's owner, posts 4th-wall-breaking meta commentary about
running/maintaining "Weyland Tavern" and its characters/subbots, usually complaining about
something breaking or fixing something in a comedic way, and hates getting DMs because he's always
busy. The remaining messages should be a mix of named Weyland characters and generic
students/staff, written in-character where a named character is involved. Keep the @luckypaww
posts distinctly meta/self-aware compared to everything else, which should read as normal in-world
chatter.

## WEYLAND ROSTER (for inspiration — draw from these established personalities when a post is plausibly from one of them)
${WEYLAND_ROSTER}`,

    yikyak: `${SHARED_FRAMING}

Generate content for "Yik Yak," an anonymous, hyperlocal social app popular at Weyland University.
Posts are anonymous (no usernames, just the post itself, optionally a vote count like "+47" at the
end) and hyperlocal to campus.

## YIK YAK
8-10 anonymous posts in the spirit of an anonymous local community board — missed connections,
rants and raves, lost & found, roommate drama, campus gossip, hookup-culture chatter. Unlike
Discord (which is semi-public and tied to real identities), Yik Yak's whole appeal is that people
say things here they wouldn't say with their name attached — lean into that: posts can be
noticeably more scandalous, gossipy, horny, petty, or inappropriate than what would ever get
posted on Discord under a real username. Keep it anonymous-board energy, not named-character
dialogue. Posts are anonymous, but content can still be written in a way that's recognizably
consistent with one of the roster personalities above, for a reader who knows them well — this is
a fun, intentional "guess who posted this" element. Don't literally name the poster.

## WEYLAND ROSTER (for inspiration — draw from these established personalities when a post is plausibly from one of them)
${WEYLAND_ROSTER}`,
};
