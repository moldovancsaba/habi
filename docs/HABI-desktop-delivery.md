# Extended desktop delivery — 23 October 2026

The approved scope keeps the same HABI brand and domain workflows. Desktop uses a sidebar and paired activity/context columns; compact widths retain HABI2's conversational shell. The CSS-owned 1024px layout boundary remains unchanged.

| Area | Delivered behaviour |
|---|---|
| Shell | Four existing destinations in their original order; settings and explicit help below. One active destination. |
| Home | Today's assessment/result in the main column; one relevant continuation and three existing support entry points alongside. |
| Assessments | One question at a time; desktop daily answers form one icon-rich column; flow controls remain separate. |
| Results | Exact original report/form and five-icon format in the main column; related actions, expanded practical context and metric explanations beside it. Pinned question labels are used when available. |
| Development | Original chart and period controls beside original HABI observations and longer-term reflection guidance. Selected-period counters use canonical dated entries and associated completed tasks. |
| Diary | Persistent date selection shows the original shared report, own words, feedback and recorded activities for that date. Empty dates remain empty. |
| Monthly | History in the main column and invitation alongside; completed feedback retains its original wording and uses responsive topic groups. |
| Tasks / library | Chosen commitments remain primary; exercise access and practical guidance are secondary. Exercise and settings cards use a two-column grid. |
| Chat | Input/topics/starters coexist at entry. Active conversation and answer choices occupy a scrollable main column with a composer; factual context and the eventual outcome sit alongside. Existing safety and switch-confirmation routes are reused. |

## Verification

- 68 automated checks pass, including real DOM composition, empty/unfinished sections, exact historical snapshot preservation, pinned question labels, no-training load handling, draft escaping, selected-period counters, sidebar state and desktop/mobile transitions.
- Source presentation guards include the new module and recursive catalogue strings: no inline presentation, style mutations, palette literals or extra application stylesheet.
- Browser preview checks: desktop home, chat entry and active chat, typed message and interruption cancellation, chart overview, diary date selection, 1024px two-column layout and a resize to 320px HABI2 with preserved input and no horizontal overflow.
- Review corrections: avoid repeating a selected topic as an opening; avoid a duplicate identical chat action; use the shared disclosure chevron; allow compact section tabs to wrap; count only records in the selected period.
- Explicit no-training answers now render load as unavailable, rather than implying a low scored load. Raw answer records and immutable feedback are retained.

No coach workflow, additional metric, clinical score, automatic sharing or new navigation destination was introduced. Expanded copy is catalog-backed under `desktop_v1`; presentation remains in `global.css`. Existing domain renderers remain the source of daily and historical report content.
