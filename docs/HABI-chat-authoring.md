# HABI conversation authoring

The runtime catalog is `habi_content` → `active` → `data.guided_chat_v2` in MongoDB. `server/content-seed.json` supplies missing keys on deployment; it never replaces existing database edits. This version has three trees, seven discoverable categories and seven endings in every tree. Hungarian interface copy also accepts English keyword synonyms.

## Fill out a module

Use `chat-tree-template.json` as the structural starting point. Copy a complete existing tree from the seed when authoring a seven-ending module. Keep stable IDs independent of wording.

| Field | Fill with |
| --- | --- |
| category.id | Stable topic ID |
| category.tree | ID of one of the three conversation trees |
| category.keywords | At least five concept groups; each group contains equivalent words or phrases |
| category.variants | Seven equivalent topic-choice labels |
| tree.start | Opening node ID |
| node.response | Seven equivalent supportive acknowledgements |
| node.question | Seven equivalent questions asking the same thing |
| node.options[].id | Stable semantic answer ID |
| node.options[].variants | Seven equivalent answer labels |
| node.options[].next | Existing node or outcome ID |
| node.context | Optional seven-variant acknowledgement keyed by the previous answer ID |
| outcome.id | Stable action ID |
| outcome.variants | Seven concrete, equivalent action instructions: what to do and how |
| outcome.practice | Existing practice ID, or null |

Changing wording must not change what a choice means, urgency, destination, consent or action. Write seven natural alternatives; do not shuffle severity or randomly select guidance. For substantial structural changes, introduce a new versioned catalog key and update the client contract deliberately.

## Current topic mapping

| Category | Tree |
| --- | --- |
| Dreams and future | dreams |
| Competition and expectations | dreams |
| Sport and belonging | connection |
| Fear, pressure and difficult emotions | pressure |
| Focus and overload | pressure |
| Habits, sleep and rest | pressure |
| Relationships and asking for support | connection |

Search normalises accents and case. Each concept group contributes at most one point; repeated words do not inflate the score. Whole tokens, bounded phrases and explicitly authored stems match. Positive matches sort topic choices; the athlete always confirms the direction. Unknown input shows the full topic chooser. No diagnosis, inferred emotion or arbitrary-text analysis is claimed.

Every tree can end with: immediate trusted-adult help, an adult conversation today, help reaching a psychologist, a self-shared summary, a small practical action, an existing HABI exercise, or a concrete later check-in. Safety-related phrases bypass ordinary topic selection and ask about immediate safety. Unsafe/uncertain answers lead straight to immediate adult help; a safe answer still leads to adult support today. Bothering/hurtful behaviour in the connection tree also asks about safety. There is no coach workflow or automatic sending.

Variants are picked once when shown and persisted as exact transcript text. The selected tree is snapshotted when chosen. Reloading, returning from another tab or future catalog edits do not rewrite an existing conversation. Completed conversations archive once on their actual completion date, linked to the input, category, stable replies and ending. Summary downloads contain only this conversation and its action. Existing daily/monthly/situation flows and practices remain shared.

Run `npm test` after authoring; it checks all reachable paths, dangling links/cycles, all seven outcomes, variant counts and uniqueness, keyword matching, safety routing, history, reload, escaping and shared exercises. Verify phone-width rendering and live database persistence before release.
