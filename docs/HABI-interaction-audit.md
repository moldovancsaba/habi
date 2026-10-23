# HABI interaction consistency

## Shared visual contract

| Role | Appearance | Alignment | Component |
|---|---|---|---|
| Answer to a question | White outlined choice; pale blue selected state | Start | uiChoice |
| Icon assessment answer | Square artwork, start-aligned icon and label | Start | answer-card |
| Primary action | HABI blue fill, white text | Start | uiButton |
| Secondary action | White outline, HABI blue text | Start | uiButton secondary |
| Flow control | Soft blue fill, same geometry for skip/back/cancel/pause/restart/return | Start | uiControl / uiFlowControls |
| Section / period / metric selection | Shared selected-state tabs | Start | tabs |
| Breadcrumb / disclosure / bottom navigation | Existing shared navigation styles | Start-aligned text across every family | location-trail / summary / uiNavItem |

## Coverage and corrections

| Journey family | Checked states | Correction |
|---|---|---|
| Daily assessment | Seven questions, result, resume/back | Skip/back/later use one grouped control family |
| Monthly reflection | Sixteen questions, not-applicable, skipped, prior-goal review, completion, history | Not-applicable is an answer; skip/back/later are controls; completion back uses the same control |
| HABI | Topic/text/starter entry, guided endings, legacy six-choice path, seven daily-context concerns, nine situations | Replies use answer styling; restart controls share the control family |
| Practices / habits | Ten practices, completion, skipped exit, habit reviews | Exit/return controls unified; habit responses changed from tabs to answers |
| Goals | Creation, cancellation, conflict, active detail, export, history | Cancellation and return unified; replacement decisions share answer styling |
| Reflections | Evening, weekly, event, completion | Return controls unified |
| Communication / returns / events | Person/need replies, draft/message/result, return planning/follow-up, event form | Reply styling separated from back/return controls |
| Main navigation / settings / development | Four bottom tabs, overview/diary/monthly, library, settings, disclosures | Shared navigation families retained; reminder dismissal/defer controls unified |

Presentation is defined only in global.css. Application behaviour and stored results are preserved. Catalog-backed control labels are separate from obsolete catalog HTML fragments, so database copy cannot reintroduce a mixed button family on these flows.

Previous verification: 50 automated checks, including an application-wide rendered-button audit and answer-versus-control behaviour checks. Narrow and desktop browser checks accompany the release; these are viewport checks, not a claim of physical-device testing.

Current alignment consolidation (23 October 2026): all text interactions share start alignment; flow controls use a quieter weight. Boxed disclosures use compact headers with trailing chevrons. SVG presentation and browser theme colours are derived from global.css. See HABI-presentation-audit.md for the final source/render audit.
