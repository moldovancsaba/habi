# HABI

A Hungarian-language support prototype for child athletes, with practical HABI feedback, personal notes, guided reflection, and historical results.

Live application: https://habi.doneisbetter.com/

Vercel project: `habi` (`prj_2a7wlyOX1Iasat3qhRsUn0Wu7QMk`).

## Required implementation standard

These are the user's explicit requirements. Apply them to every affected screen and state. Do not make the user repeat a correction.

### Visual identity and CSS

Preserve the accepted visual identity: blue primary actions, pale page and card surfaces, dark text, rounded cards, and the established typography and spacing. Do not redesign the application while fixing a component.

Use `global.css` as the canonical styling source. Keep shared colours, spacing, typography, sizing, radii, and state rules in CSS tokens and component classes. Do not put inline styles or hardcoded presentation values into HTML templates or application logic. SVG geometry and data values may remain in rendering logic; presentation belongs in CSS.

Use reusable components. Primary/action buttons must fill their card's content width, including the previous-results button. Give navigation, tabs, answer cards, and back controls consistent shared styles. Fix all instances of a component rather than patching one screenshot. Remove obsolete and conflicting rules.

### Five consistent rating visuals

There are **five** metrics, always in this order:

| Metric | Visual | Canonical colour |
| --- | --- | --- |
| Erőnlétem | Upright battery with changing fill | `--energy: #20a281` |
| Alvásom | One moon with changing phase | `--sleep: #9567d9` |
| Koncentrációm | Signal-strength bars | `--focus: #3869dc` |
| Hangulatom | Changing facial expression | `--mood: #e5a13d` |
| Edzésterhelésem | Compact 2×2 load indicator | `--load: #e96e7c` |

All visuals must fit identical square bounding boxes, with consistent optical size and no clipping or overflow. Reuse the same icon/value mapping in assessment choices, daily results, charts, and history. A metric's colour must match its chart line, legend, detail view, and result icon. Never show repeated moons as a rating.

Daily results and history show all five visuals in one row with **no visible text labels underneath**. Keep accessible metric/value names for assistive technology.

### Daily result and personal summary

Render the completed assessment in this order:

1. Short, understandable interpretation of the athlete's answers.
2. One concrete daily suggestion: what to improve today and how to do it.
3. All five visual results in one horizontal row.
4. The athlete's own comment field.
5. A full-width action for the personal summary.

Do not substitute a data dump or a generic heading for useful daily help. Preserve the interpretation, suggestion, values, and athlete's words together in the personal summary record. Keep submission status truthful and prevent duplicate records.

Do not display implementation explanations or prototype disclaimers in the product. In particular, do not reintroduce the removed explanation about results entering a demo view or notifications not being real. Essential delivery limitations belong in the developer conversation and must not be repeated once acknowledged.

### Historical fidelity

Use the same shared content component and styling in daily results and history. A historical entry must show its original evaluation, daily suggestion, the same five icons, the athlete’s own thoughts and the saved HABI feedback.

Persist a feedback snapshot when the assessment completes. Associate messages and decisions with the exact assessment ID. Do not regenerate historical advice from changed rules, display a different day's message, or discard raw submissions. Show exactly one daily result per date: use that date’s latest assessment in both history and charts. Keep older same-day submissions in storage; do not stack them inside the daily card. Show dates with no check-in as empty days, with no invented values. For older records lacking a snapshot, prefer an existing submitted report; reconstruct only from that record's saved answers and preserve the reconstruction thereafter. Never invent a historical message, response, or missing day's result.

### Completion and verification

Check the complete journey: home → all seven questions → useful daily feedback → athlete note → saved personal summary record → history. Also inspect task views, charts, tabs, pending/completed states, and empty history as relevant to the change.

Inspect actual mobile/narrow layouts and desktop layouts. Check square icons, all five icons on one row, consistent colours, full-width action buttons, accessible controls, safe rendering of comments, saved snapshots, and duplicate prevention. Do not claim verification that was not performed.

Complete authorised work through saving, publishing when authorised, and checking the live result. Do not stop at an acknowledgement or ask the user again for an action already authorised. Give a concise delivery response with the result link.

## Source map

- `index.html`: application shell.
- `app.js`: assessment logic, shared result rendering and daily history.
- `bootstrap.js` / `cloud.js`: database bootstrap, content access, state synchronisation and recovery.
- `api/` / `server/`: server-only MongoDB access, session isolation and content catalog.
- `global.css`: canonical tokens and component presentation.
- `manifest.webmanifest`: PWA metadata.
- `sw.js`: service-worker lifecycle.
- `support.js`: contextual conversations, exercises, reflections, habits, daily rhythm and their history.

Use `reportContent()` and `resultIcons()` for the shared daily/history result, and `reportMessages()` for stored athlete messages and HABI feedback. Preserve saved feedback when changing future suggestion rules.

## Current integration boundary

The client loads its business content, questions, choices, feedback rules, default settings and starting history configuration through `/api/app` from MongoDB. User state (daily/monthly records, conversations, exercises, habits, notes, drafts and settings) is persisted through the same API. Local storage is a recovery buffer and supports importing existing browser data; it is not confirmation of remote persistence.

Each browser receives an opaque HttpOnly, Secure, SameSite session cookie. Its hash scopes the database document. There is no account login or cross-device identity yet. Never expose another browser's state, database credentials or raw database errors. No notification service is connected. These implementation details stay out of the athlete interface.

## HABI guided conversation

The HABI menu uses a friendly CSS-styled SVG robot and a Hungarian, choice-led conversation about mental pressure in sport. It starts with one of three randomly selected, already-sent athlete messages. Six opening choices feed a six-decision tree: concern → context → inner thought → small practical action → trusted person → requested support. Responses and the final suggested conversation reflect those choices.

The final message recommends a concrete next step and provides words the athlete can use with their selected parent, trusted adult, or psychologist. It offers supportive reflection rather than diagnosis or a promise of treatment. No external message is sent by this flow.

`habi.js` owns the decision tree and browser-local conversation state (`habi-chat-v1`). All visual rules stay in `global.css`. The conversation survives menu changes and reloads; a new random opening is selected only for a new conversation. Verify all six stages, the three starters, all branch endings, restart, keyboard controls, mobile fit, and existing navigation when changing this feature.

## Shared sample history

The user explicitly requested populated previous days matching the existing graph. Initialise 42 calendar days of sample assessments only where no saved assessment exists. Mark generated records internally with `source: sample`, preserve actual submissions, and never change their dates. Include the feedback snapshot, five values, athlete note and HABI feedback in each generated record. Use `dailyEntry(date)` as the common source for charts and daily history; do not generate a second set of graph-only values. Real submissions take precedence over samples on the same date. Reinitialisation must be idempotent. Keep sample metadata out of the athlete interface.

HABI is presented as a conversation: never show step counters, stage numbers, progress indicators or decision-tree implementation details in the chat.

After every HABI response and when reopening the conversation, scroll the current reply choices into view above the fixed navigation. Wait for layout with animation frames, use CSS scroll margins and the safe-area inset, and focus the new question without allowing focus to undo the scroll. Show the conclusion when no reply choices remain.

Do not show a global app-name header or top branding bar. Start each view directly with its content.

## HABI identity

Use HABI as the sole product name in page titles, install metadata, documentation and deliverable names. Preserve the existing colour palette and shared CSS. Do not restore the removed top bar. Use `habi-app-v1` and `habi-chat-v1` for current browser storage. Legacy identifiers are confined to `storage-migration.js` to preserve existing assessments and conversations without displaying previous branding.

Use the exact summary submission button label: “Összefoglaló beküldése”.

Keep the application focused on the child athlete and HABI. Preserve submitted summaries and their messages in daily history.

## Immediate HABI feedback

The current product flow gives immediate support directly through HABI. Submitting a summary immediately saves HABI feedback with explicit “Mit csinálj?” and “Hogyan?” content. Use the same feedback snapshot in daily results, task views and history. Label athlete input neutrally as their own thoughts. Preserve existing stored records without displaying legacy workflow fields. The independent HABI conversation may still suggest speaking with a trusted person where appropriate.

For the pain-related suggestion, use “Írd meg Habinak a fájdalom részleteit”. Ask for location, onset, triggering movement and whether pain is also present at rest.

A beküldés után ne jelenjen meg külön mentési visszaigazolás vagy sikerüzenet-doboz; a HABI visszajelzés legyen az eredmény.

## Child athlete support

HABI supports child athletes generally: wellbeing, emotions, habits, school/sport pressure, rest and small daily goals. Remove all trainer-centred wording from generated interface content, conversation branches and conclusions. When human support is appropriate, offer a parent, another trusted adult, or a suitable professional. Keep the three contact choices distinct. Preserve personal notes and raw stored records; do not expose obsolete workflow metadata. Existing generated HABI feedback with obsolete recipient wording is migrated to the current model. Preserve the accepted HABI visual identity and shared CSS.

The bottom navigation uses matching line icons above its retained labels: home, checklist, progress chart and the existing HABI robot. Keep icon size, colour and layout in global.css. Active state applies to both icon and text; identify the current page accessibly.

## Integrated support journeys

HABI keeps the four existing navigation items and its established CSS identity. `support.js` adds contextual conversations from exact daily assessment IDs, five short practical exercises with optional feedback, evening and weekly reflections, one self-chosen habit, and optional in-app morning/evening reminders. No external notifications or human messages are sent. Reminders appear after the chosen local time when HABI is open; users can disable or dismiss them.

New assessments use schema 2: mood distinguishes low mood from low energy; an explicit no-training answer sets load to none and bypasses the irrelevant load question. Every question may be skipped. Null means missing, never a default score: render a neutral icon, accessible missing label, and a gap in chart lines. Do not infer wellbeing from skipped answers. Preserve older schema snapshots and raw submissions.

Results offer a contextual HABI conversation and a relevant exercise. Context persists across navigation/reload; saved conversations preserve the original prompts, chosen answers, generated guidance and optional personal note. Pain conversations collect location, duration and circumstances and guide the child to a trusted adult for appropriate help, without diagnosis. Starting a contextual conversation is an explicit action; ordinary HABI conversations retain their three random openings.

Reflections have optional fields and browser-local drafts. Evening reflections ask what was hard and what helped; weekly reflections add one next-week experiment. Store all submissions, show the latest reflection of each type within each date, and retain the original feedback. Do not analyse arbitrary free text as if a model had understood it. Exercises store their exact instructions and a helped/partly/not-helped response. Habits remain optional and can be made smaller; no streaks or pressure. History groups records by their actual local calendar date alongside the original daily summary, icons and thoughts. Never fabricate reflections, habit completions or conversation records for sample days.

Verification covers skip-all/partial data, explicit no-training, original and contextual conversation endings, pain guidance, saved drafts, exact-entry linkage, escaping, duplicate exercise/habit completion, dated history, reminder settings, and persisted reload state. Keep implementation and notification limitations out of the main result flow.

## Descriptive development support

`trends.js` uses the exact canonical daily entries and selected 14/28/42-day period used by the charts. An overview highlights up to three observations; every metric has its own direction, near-term experiment and longer-term focus under the detail chart. At least three answered days in each half are required for direction. A difference of 0.5 response categories in the descriptive mean separates increasing/decreasing from similar; this is a display rule, not a validated clinical threshold. Repeated lower wellbeing answers or higher load means at least half of a set with three or more answered days. Missing answers are excluded and never converted to zero. Load direction is described neutrally, never as improved/worse athletic progress. Explain the date range and actual counts. Keep sample provenance as internal metadata. Do not insert sample-data explanations, prototype disclaimers or calculation-method footnotes into the product interface. Do not claim causes, treatment effects, diagnoses, predictions or athletic readiness. Stored original daily feedback is unchanged by these period-specific observations.

Never restore the removed “mintanap” explanation, causal disclaimer or first-half/second-half calculation footnote. Development support must contain useful observations and practical guidance, with provenance and calculation details confined to internal documentation.

HABI development feedback speaks directly to the child, in warm, short, practical Hungarian sentences. Never render report phrases such as “jelenik meg a válaszokban”, “értékelhető nap”, category-count recitations or method descriptions. Internal direction/coverage calculations remain available to logic and tests; the product shows an understandable observation and useful support. Avoid praise for scores, pressure to improve, and certainty about causes.

## Monthly HABI reflection

`monthly.js` implements a voluntary monthly reflection with 16 stable prompts referring to the past four weeks. Six mental-support themes have two questions each: focus, restarting after difficulty, self-talk, confidence, emotional regulation, and asking for help. Four separate environment questions cover enjoyment, belonging, voice and safety. These are HABI adaptations inspired by KIDEX; do not present them as a validated psychological test or professional observation battery. No SKI, cross-perspective average, risk score, diagnosis or performance rating appears. The current five daily metrics remain unchanged.

The five frequency choices have explicit labels. “Nem volt ilyen helyzet” and “Most kihagyom” are separate non-scored reasons. Both theme answers are required before comparing that theme with the preceding same-version monthly record; missing values never become a midpoint or zero. A descriptive difference of one frequency category indicates easier/harder; this is an internal display rule rather than a clinical threshold. Saved results contain question and answer-label snapshots plus the exact feedback and chosen goal, so historical wording is not regenerated. Environment support remains separate from mental theme scores. A reported lack of safety prompts immediate trusted-adult support without implying that a message was sent. Asking for help is never counted as risk.

First entry is available from home/tasks and from the monthly section in development history. A versioned browser-local draft resumes at its exact question, including the separate review of the previous goal and the optional personal note. The goal review never affects skill scores. Finish explicitly saves one immutable monthly record and clears the draft; repeated submission is ignored. The child may select a suggested goal or decline to choose one. Current goal is accessible from home/tasks and the completed result. Monthly records have their own dated history in Fejlődésem, separate from daily chart periods.

The next invitation is one calendar month after completion, clamping to the last day of shorter months. Allow a three-day deferral and manual earlier return after deferral; do not manufacture missed monthly assessments. An existing completed record opens read-only until the next monthly due date. A meaningful schema change archives an incompatible draft and prevents cross-version comparisons. No extra notification service, adult dashboard or automatic sharing is introduced.

Verify full first and follow-up flows, all-skipped results, non-applicable choices, partial themes, prior-goal review, comparison snapshots, text escaping, draft resume across reload/navigation, duplicate final actions, month-end/leap-year due dates, deferral, four-tab navigation and existing daily/support flows. Product copy stays in HABI’s direct supportive voice; technical details remain here.


## MongoDB deployment and configuration

Set `habi_mongodb_uri` as a server-only Vercel environment variable. Optional `MONGODB_DB` selects the database (default `habi`). Never prefix credentials with public client environment names, commit them, print them or bundle them into the static output. Redeploy after configuration changes.

`habi_content` contains one document with `_id: active`, `messages` and `data`. The first successful request inserts `server/content-seed.json`; subsequent requests recursively fill missing object keys while preserving database edits. Content includes all question sets, response options, chat branches, exercise instructions, supportive texts, monthly domains, starting data and runtime defaults. Update existing catalog keys in MongoDB to change those values without rebuilding the UI. Retain keys used by the application. Structural algorithms, storage schema, identifiers, SVG geometry and CSS remain in source control; the database does not supply executable JavaScript. Connection failure never silently substitutes embedded business content.

`habi_states` stores one browser-owned document with revision, payload, creation and update times. Payload holds all application and chat records including immutable historical feedback. Writes validate bounded JSON and use optimistic revisions. Conflicting writes merge distinct records and remote-only changes before retrying. Existing local state imports on first successful connection; unsent changes remain recoverable locally and show a retry action. A successful connection does not imply a successful save: verify the actual write and reload path.

Run `npm ci`, `npm test`, then `npm run build`. The build outputs static client files to `public`; Vercel deploys `api/*.js` separately with the server-only MongoDB driver and content seed. Never serve the repository root as the static output.

Verify `/api/health` and the complete browser → API → MongoDB → reload journey before promoting a database-backed release. A DNS failure requires checking the MongoDB connection hostname and cluster availability; never publish a broken replacement or weaken database access to disguise a failed connection. Keep the last working public release until this verification succeeds.

## HABI situation support and chosen small goals

The Athlete IQ review supplies selected ideas, not a new product or interface. HABI remains child-centred, choice-led and supportive. There are no new cognitive scores, coach workflows, assessment questions or navigation tabs. Keep the current seven daily questions and sixteen monthly prompts unchanged. Source cognitive categories are explanatory content, never measured traits or potential estimates.

`journeys.js` adds four explicitly identified situations, optional explanations with neutral/sport/everyday examples, and one active small goal. All new content and defaults live in MongoDB-backed `journey_content_v1`. The nine shared practice identities retain the original five and add instructions, options, self-talk and communication. Enriched instructions apply to future activities only; original completed activities retain their snapshots. The new versioned content key deliberately leaves existing catalog edits untouched.

Reuse the current HABI chat renderer conventions and scrolling. Situation conversations carry a source reference, a content snapshot, chosen replies, original conclusion and optional note. All 108 choice paths end with a relevant action or an explicit choice to stop without a commitment. Never route situations by title keywords. The original six-choice HABI conversation remains available.

A goal is explicitly chosen, editable, optional and linked to its daily, monthly, conversation or practice source. Only one goal is active; replacing it requires an explicit choice. Review windows of 7, 14 or 28 days compute real local-calendar dates. Keep, simplify, pause, finish and conversion to an existing habit preserve events and prior records. A goal's daily practice replaces the generic daily task when relevant; pain-related daily support retains priority. Monthly selection opens the same goal flow without rewriting monthly snapshots. No fixed exercise quota, streak or overdue penalty is introduced.

Existing practices and reflections store optional goal references. History and goal review join the original records rather than creating parallel copies. A practice marked as tried is not evidence of improvement. Only explicit helped/partly/not-helped feedback may support those observations. New goal history shows original dates, words and events. Missing days are never populated with goal events.

Practice and goal drafts resume after reload. Reflection context preserves its goal association; original monthly drafts retain their existing resume flow. Optional example preferences do not require a profile. Selected summary export includes goal text and dates by default; linked attempts and private reflection text require separate unchecked opt-ins. Export never sends a message or shares unrelated notes.

Verification includes all original chat paths and new situation paths, source continuity, explicit goal replacement, real review dates, immutable snapshots, linked practice feedback, monthly-goal reuse, habit conversion, export scope, escaping, draft recovery, database persistence, four-tab navigation and existing daily/monthly flows. Use `npm test` and `npm run build`, then check the staged and public browser journeys before considering delivery complete.

## Keyword-led HABI chat

Ordinary HABI chat now starts with the athlete's own message. Seven synonym-based topic categories route into three closed conversation trees: future/goals, difficult feelings/rhythm, and relationships/belonging. Each tree has seven reachable concrete action endings. Topic choice confirms the keyword suggestion; unknown messages offer all topics. The athlete is never assigned a feeling or diagnosis from a keyword. Safety phrases take priority and lead to trusted-adult support.

Every authored acknowledgement, question, reply choice, topic label and ending has seven equivalent variants. Pick wording once, persist exact displayed turns and preserve the chosen tree snapshot. Random wording must never alter meaning or routing. Every branch ends in an action the child can actually take; no human message is sent. Existing exercises are reused. Completed chats appear in dated history with their original words/action; summary downloads include only that conversation. Prior unfinished legacy chat is retained in `legacyChatDraft`; contextual daily and situation chat drafts continue normally.

All runtime content lives in MongoDB-backed `guided_chat_v2`; the UI uses the shared robot, message/choice components, auto-scroll and global.css. Authoring instructions and a fillable JSON structure are in `docs/HABI-chat-authoring.md` and `docs/chat-tree-template.json`. These supersede the old random starter for ordinary new chats; existing daily/monthly assessment questions remain unchanged.

### Topic-first chat starter

Ordinary new HABI conversations open with “Miről beszélgessünk?”, a short invitation and the seven topic choices on one screen. No input field or separate start button. A topic tap immediately opens its tree. Topic wording persists across redraw/reload; the selected topic is the opening in summaries and dated history. Existing in-progress conversations keep their exact wording. Keyword routing remains available internally for contextual integrations but is not an extra screen in ordinary chat.

## HABI design system

`global.css` is the sole visual source of truth. `ui.js` owns shared buttons, cards, speakers, navigation, robot and metric rendering. The component reference is `/design-system.html`; the complete contract and audit register are in `docs/HABI-design-system.md` and `docs/HABI-UI-gap-register.md`. The reference page uses the application's actual components and does not write athlete state.

Preserve the established HABI identity. Reuse semantic variants rather than adding page-specific overrides: primary action, secondary/choice, quiet action, icon-rich assessment, tab, navigation and disclosure. All controls have consistent focus/state treatment and at least 48px height. Main instructions use readable body text; dates/supporting metadata use the supporting role. Component lists own gaps; card subtypes never redefine button margins. Standalone pages use h1 and embedded cards h2. Keep all five metric identities and daily/history parity. Run functional and design-contract checks, inspect real desktop/narrow flows and update the gap register before publishing.
