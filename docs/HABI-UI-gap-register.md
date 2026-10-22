# HABI UI gap register

Scope: the complete current athlete interface and shared component states. These are the concrete gaps found during the October 2026 source and screen audit. “Implemented” means the code correction exists; browser verification is recorded separately below. Deliberate semantic variants are not defects: primary actions, answer cards, tabs and quiet back actions have different roles.

| ID | Gap and evidence before correction | Resolution | State |
| --- | --- | --- | --- |
| UI-01 | `.journey-card .btn` overrode `.habi-choice` margins | Remove card-specific override; one button composition contract | Implemented |
| UI-02 | Choice lists combined grid gaps with inherited button margins | Group children margin 0; shared 8px grid gap | Implemented |
| UI-03 | Ungrouped secondary buttons had zero separation | Shared adjacent-button spacing | Implemented |
| UI-04 | All paragraphs defaulted to low-contrast supporting colour | Body instructions use primary text; supporting role is explicit | Implemented |
| UI-05 | Supporting text failed 4.5:1 on the pale inset surface | Darken same-hue muted token; automated contrast combinations | Implemented |
| UI-06 | Native h3 sizing differed from page-specific h3 overrides | One global heading scale; remove repeated overrides | Implemented |
| UI-07 | Standalone guide/practice/goal/picker views used embedded-card h2 | Explicit heading level on shared card; h1 for screens | Implemented |
| UI-08 | First/last child margins varied card padding visually | Shared surface-edge spacing rules | Implemented |
| UI-09 | `.habi-.habi-header` malformed selector and obsolete submission status rules | Remove dead rule; valid legacy header layout | Implemented |
| UI-10 | Select styling existed only under journey cards | One field definition for textarea/text/select/time | Implemented |
| UI-11 | Goal errors had no style or invalid-field association | Error token, message styling, invalid/describedby attributes and focus | Implemented |
| UI-12 | Habit errors did not identify/focus the invalid field | Same field validation contract; clear invalid on edit | Implemented |
| UI-13 | Keyboard-focus selectors differed by control and page | One foundation rule for all interactive control types | Implemented |
| UI-14 | Monthly choice hover could obscure selected styling | Shared selected choice rule with semantic state | Implemented |
| UI-15 | Disabled appearance relied on opacity, varying with background | Explicit readable disabled tokens, no generic opacity | Implemented |
| UI-16 | Disclosures had varied fonts/spacing and short hit areas | One native summary component with 48px minimum | Implemented |
| UI-17 | Robot/nav/metric rendering lived in business files | Extract canonical helpers to ui.js; app and reference share them | Implemented |
| UI-18 | Navigation markup/state assembled separately from component contract | Shared escaped uiNavItem; named nav landmark | Implemented |
| UI-19 | Metric sizes and SVG chart styling used scattered magic values | Named role tokens, original metric geometry retained | Implemented |
| UI-20 | No executable component reference or regression contract | Live reference page, system documentation and targeted checks | Implemented |
| UI-21 | Card overflow could crop focus; press motion persisted under reduced-motion | Visible card overflow; reduced-motion pressed-transform reset | Implemented |
| UI-22 | Startup pending state not exposed/cleared accessibly | Main aria-busy lifecycle on startup/success/failure | Implemented |
| UI-23 | At 320px, an answer word split awkwardly and nav labels crowded | Compact answer role and 12px nav-label role below 340px | Implemented |
| UI-24 | SVG chart labels scaled to very small text at phone widths | Explicit chart-type token with compact SVG scale compensation | Implemented |
| UI-25 | Situation replies omitted the athlete speaker label used by other chats | Same speaker label on the same message role | Implemented |
| UI-26 | Home treated a finished guided chat as unfinished because its legacy choices array stays empty | Resume state follows the actual guided tree/ending; untouched topic chooser does not create resume noise | Implemented |

## Verification record

Pending staged browser verification. Record actual viewports, screens and resolved follow-up defects here before release. Do not claim every possible device or state has been tested.
