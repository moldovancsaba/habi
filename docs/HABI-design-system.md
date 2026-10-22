# HABI design system v1

The canonical implementation is `global.css` and `ui.js`. The live component reference is `/design-system.html`. It uses the actual application helpers and stylesheet, makes no application-state/database writes and lives outside the athlete's four-tab flow.

## Identity and foundations

Preserve HABI's primary blue, pale page/surfaces, dark text, rounded cards and robot. Text uses the system font. Primary body text is 16px; supporting text is 13px; section titles 21px; screen titles 27–36px. All h3 headings share the body-size strong role. Compact assessment labels use the named 15px answer role, while navigation uses 12px labels below 340px to keep four readable columns. Chart text has an explicit SVG scale-compensation role at compact widths. Main instructions use `--text`; dates and incidental help use `--text-muted`. The muted colour is slightly darker to maintain 4.5:1 contrast on the four common surfaces. This does not recolour metric families.

The spacing scale is 4/8/12/16/24/32px. Radii are 12/16/24px. Interactive controls have a minimum 48px height. Cards use 24px padding, compacted to 16px at widths up to 380px. Body, card, heading, form and action spacing have one definition. Card edges do not crop keyboard focus rings. Long text wraps inside its component.

## Component contract

| Component | Canonical interface / class | Rule |
| --- | --- | --- |
| Action | `uiButton`, `.btn` | Full available width, centred, blue, 48px minimum |
| Secondary/choice | `uiButton(...,{secondary:true})`, `.btn.habi-choice` | Same control dimensions, white surface, blue left-aligned text |
| Choice list | `.habi-choices` | Grid with 8px gap; children have no external button margin |
| Adjacent actions | `.btn + .btn` | 8px gap; never alter by page/card subtype |
| Back/defer | `.back-link` | Quiet text action, 48px minimum, visible hover/focus |
| Daily answer | `.answer-card` | Intentional icon-rich two-column variant, 172px minimum / 150px compact |
| Tabs | `.tabs` | 48px minimum; selected colour and border with `aria-pressed` |
| Bottom navigation | `uiNavItem`, `.nav` | Four matching icon/label controls, `aria-current="page"` |
| Card | `uiCard`, `.card` | Shared radius, border, padding and edge spacing |
| Speaker | `uiSpeaker`, `.habi-speaker` | Same robot and label scale across chat, feedback and cards |
| Chat | `.habi-thread`, `.habi-assistant`, `.habi-athlete` | Shared bubble geometry for all three conversation renderers |
| Fields | `.text-input`, `textarea` | Same border, radius, text and focus treatment across text/select/time/notes |
| Error | `.field-error`, `aria-invalid`, `aria-describedby` | Named error colour plus an actual error message; focus invalid field |
| Disclosure | native `details > summary` | 48px minimum header, same typography/spacing; native expanded semantics |
| Feedback surface | `.daily-advice`, `.journey-example`, `.journey-explanation`, `.habi-takeaway` | Shared inset surface rules |
| Metrics | `visual`, `.metric-icon` | One implementation, same square viewBox, one canonical colour per metric |
| Result/history icons | `.result-icons` | All five metrics in one row; no visible labels, accessible descriptions |
| Charts | `.plot`, `.chart-*` | Data geometry remains SVG; colours/strokes/type remain CSS tokens |
| Pending/failure | `aria-busy`, `.sync-note` | Truthful state and retry; no success-disclaimer boxes |

All five metric families retain their existing mapping: upright green battery, single purple moon, blue signal, amber face, pink 2×2 load. Named size roles are deliberate: 64px assessment, 48px result, at most 42px metric tab, 28px legend. A role always looks the same wherever used.

## States and accessibility

Default, hover, pressed, keyboard focus, selected, disabled, pending, invalid and neutral/missing states have explicit rules. Focus is a 3px blue outline with 3px offset for buttons, links, fields, selects and summaries. Selected choices keep their appearance under hover; state is also exposed semantically. Disabled controls use a readable muted treatment rather than opacity over unknown backgrounds. Reduced-motion mode removes transitions and pressed transforms.

Native form labels remain linked to inputs. Empty goal/habit validation identifies and focuses the field and links its error message; editing removes invalid state. Daily/monthly skips retain their business meanings. A busy startup clears `aria-busy` on success or failure. No assessment logic, stored response, dated snapshot or sharing behaviour changes as part of this design consolidation.

## Screen composition

Home/tasks/development/results/monthly/reflections and standalone practice, goal, guide and situation-picker pages use screen-level h1 headings and section-level h2 headings. Embedded cards retain h2. Chat threads use speaker and question roles. There is no new top bar and no extra athlete navigation item.

Use the same components for daily and historical results. Existing content snapshots remain original. Main bottom clearance and reply scroll margins share `--nav-height` and the safe-area token. At narrow widths, the four nav items and all five result icons must remain in a single row; text may wrap naturally within choice buttons.

## Extending the system

1. Choose an existing semantic component and token before adding anything.
2. New variants require a named purpose and examples on the reference page.
3. Never add `.some-page .btn`, card-specific control dimensions, inline visual styles, new metric artwork or duplicate palette values in a template.
4. Keep database-authored content as content. Store structural behaviour and presentation in source.
5. Run `npm test` and `npm run build`, inspect the reference page and affected real flow at desktop and 320/375px widths, and update the gap register.

Automated checks cover contrast for normal text/action combinations, safe shared component markup, canonical stylesheet usage, page-heading contracts, metric geometry and existing complete product flows. Browser checks remain necessary for layout and visual comparison; passing unit tests alone is not evidence of complete visual consistency.
