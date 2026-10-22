# HABI UI gap register

Scope: the complete current athlete interface and shared component states. These are the concrete gaps found during the October 2026 source and screen audit. “Implemented” means the code correction exists; browser verification is recorded separately below. Deliberate semantic variants are not defects: primary actions, answer cards, tabs and quiet back actions have different roles.

| ID | Gap and evidence before correction | Resolution | State |
| --- | --- | --- | --- |
| UI-01 | `.journey-card .btn` overrode `.habi-choice` margins | Remove card-specific override; one button composition contract | Resolved |
| UI-02 | Choice lists combined grid gaps with inherited button margins | Group children margin 0; shared 8px grid gap | Resolved |
| UI-03 | Ungrouped secondary buttons had zero separation | Shared adjacent-button spacing | Resolved |
| UI-04 | All paragraphs defaulted to low-contrast supporting colour | Body instructions use primary text; supporting role is explicit | Resolved |
| UI-05 | Supporting text failed 4.5:1 on the pale inset surface | Darken same-hue muted token; automated contrast combinations | Resolved |
| UI-06 | Native h3 sizing differed from page-specific h3 overrides | One global heading scale; remove repeated overrides | Resolved |
| UI-07 | Standalone guide/practice/goal/picker views used embedded-card h2 | Explicit heading level on shared card; h1 for screens | Resolved |
| UI-08 | First/last child margins varied card padding visually | Shared surface-edge spacing rules | Resolved |
| UI-09 | `.habi-.habi-header` malformed selector and obsolete submission status rules | Remove dead rule; valid legacy header layout | Resolved |
| UI-10 | Select styling existed only under journey cards | One field definition for textarea/text/select/time | Resolved |
| UI-11 | Goal errors had no style or invalid-field association | Error token, message styling, invalid/describedby attributes and focus | Resolved |
| UI-12 | Habit errors did not identify/focus the invalid field | Same field validation contract; clear invalid on edit | Resolved |
| UI-13 | Keyboard-focus selectors differed by control and page | One foundation rule for all interactive control types | Resolved |
| UI-14 | Monthly choice hover could obscure selected styling | Shared selected choice rule with semantic state | Resolved |
| UI-15 | Disabled appearance relied on opacity, varying with background | Explicit readable disabled tokens, no generic opacity | Resolved |
| UI-16 | Disclosures had varied fonts/spacing and short hit areas | One native summary component with 48px minimum | Resolved |
| UI-17 | Robot/nav/metric rendering lived in business files | Extract canonical helpers to ui.js; app and reference share them | Resolved |
| UI-18 | Navigation markup/state assembled separately from component contract | Shared escaped uiNavItem; named nav landmark | Resolved |
| UI-19 | Metric sizes and SVG chart styling used scattered magic values | Named role tokens, original metric geometry retained | Resolved |
| UI-20 | No executable component reference or regression contract | Live reference page, system documentation and targeted checks | Resolved |
| UI-21 | Card overflow could crop focus; press motion persisted under reduced-motion | Visible card overflow; reduced-motion pressed-transform reset | Resolved |
| UI-22 | Startup pending state not exposed/cleared accessibly | Main aria-busy lifecycle on startup/success/failure | Resolved |
| UI-23 | At 320px, an answer word split awkwardly and nav labels crowded | Compact answer role and 12px nav-label role below 340px | Resolved |
| UI-24 | SVG chart labels scaled to very small text at phone widths | Explicit chart-type token with compact SVG scale compensation | Resolved |
| UI-25 | Situation replies omitted the athlete speaker label used by other chats | Same speaker label on the same message role | Resolved |
| UI-26 | Home treated a finished guided chat as unfinished because its legacy choices array stays empty | Resume state follows the actual guided tree/ending; untouched topic chooser does not create resume noise | Resolved |

## Verification record

Verified in the staged and published releases on 22 October 2026. Automated checks: 28 passing tests; build and whitespace checks pass. This is a scoped product/component review, not certification of every device or assistive technology.

- Desktop: 1348px content viewport, 720px main container; home, task library and component reference inspected.
- Compact frames: 320px and 375px outer width, with 305px/360px layout width after browser scrollbars. Home, daily questions, skip-all result, notes/submission, development charts/history, topic starter/chat ending, practice/feedback, monthly questions/completion, goal form/error/detail, export, reflection, habit form/error and explanation/situation views exercised.
- Measured no horizontal document overflow on compact home/development views. Five result icons retained identical square bounds and one row. Four navigation items fit at the smallest width. The previously broken answer label is now a single line at 15px; smallest nav labels are 12px.
- Measured choice controls: 48px height, 0px child top margin, exactly 8px gap in the component reference after the specificity correction. Keyboard Tab into the textarea produces the shared solid 3px outline.
- Daily and history retained the same saved note, evaluation, five neutral icons and HABI guidance. Goal error marks/focuses the field; export options remain unchecked. Original monthly and conversation data/wording are preserved.
- Public home resume check: active guided chat shows the continuation card; after an actual ending it no longer does. The public design-system route and main application load successfully.

No unresolved gaps remain in this register. Future discoveries should be added with their own evidence and verification rather than assuming that a passing test suite proves universal visual perfection.

## Follow-up: action alignment

Secondary actions incorrectly inherited left alignment from the shared answer class. Resolved by keeping action alignment in `.btn` and adding explicit `.reply-choice` for question/topic answers. Primary and secondary actions now share typography, spacing and alignment across all screens; enclosing a button in a choice layout does not change its role. Reference examples distinguish both roles.
