# HABI source-audit delivery

The 22 October source investigation is implemented through the existing four-tab HABI experience. Current additions are P0–P4 from that proposal; account/cross-device login, language switching, push delivery and a full calendar remain later convenience decisions.

| Package | Delivered behaviour | Implementation |
| --- | --- | --- |
| P0 | Daily draft recovery; complete selected chat summary; direct daily/chat action selection; saved return time; explicit habit conversion; null-data monthly fallback; pinned monthly definitions and safe comparison | `follow-through.js`, `monthly.js`, existing goals/storage |
| P1 | Choose person/need, add optional context, review/edit own wording, save selected message, download, optionally return and report what support was received | HABI preparation and return subpages, `db.preparations`, existing reflection history |
| P2 | One rehearsal practice; five additional disagreement/pressure/enjoyment/clarity/belonging situations; specific focus/rest/sport/competition openings with stable wording variants | `support_loop_v1`; same practice and chat renderers |
| P3 | Optional success, lesson, next attempt and role-model prompts; source-linked practice reflection; all linked feedback in goal review; period-aware practice evidence | Existing reflection/goal/history, `trends.js` |
| P4 | Optional event label/date and before/after context; relevant reflection prompts; independent entry date and event date | HABI event entrance → existing diary; no additional assessment or calendar tab |

Ten unique practices and twelve explanations now share the existing library. Nine explicit situations share HABI. Four main navigation items and five daily metric visuals remain. Existing original records remain readable, and completed monthly definitions/labels/feedback are not regenerated. Old records without a pinned comparison definition are retained without asserting like-for-like numeric change.

New labels, prompts, branches, examples, review defaults and practice content live in MongoDB-backed `support_loop_v1`. Presentation uses the existing global stylesheet, components and answer/action variants; no inline CSS was introduced. Main actions remain centred; replies use `uiChoice`.

Urgent endings do not offer postponement, an exercise prerequisite or automatic contact. Human-support preparation and summaries are child-controlled and do not claim a message was sent. Unhelpful practice feedback and declining remain valid outcomes. Seeded history remains available, but personal trend claims exclude it internally without adding prototype disclaimers.

Verification: 44 automated checks pass, including new reload, questionnaire-revision, skipped-answer, preparation/escaping, selected-outcome, return-history, dated-event, contextual-opening, mixed-evidence, habit and source-note cases. Browser checks exercised mobile 320/375 frames: communication → editable message → saved return → review; exact daily-question resume after reload; before-event reflection → optional prompts → dated diary; all-skipped monthly completion; rehearsal instructions and controls. Browser checks identified and prompted correction of event-field save timing and repeated empty monthly headings. Final public verification is performed on the released commit.
