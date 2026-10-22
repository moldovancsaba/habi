# HABI interaction consistency

## Shared visual contract

| Role | Appearance | Alignment | Component |
|---|---|---|---|
| Answer to a question | White outlined choice; pale blue selected state | Start | uiChoice |
| Icon assessment answer | Square, icon and label | Centre | answer-card |
| Primary action | HABI blue fill, white text | Centre | uiButton |
| Secondary action | White outline, HABI blue text | Centre | uiButton secondary |
| Flow control | Soft blue fill, same geometry for skip/back/cancel/pause/restart/return | Centre | uiControl / uiFlowControls |
| Section / period / metric selection | Shared selected-state tabs | Centre | tabs |
| Breadcrumb / disclosure / bottom navigation | Existing shared navigation styles | Consistent within each family | location-trail / summary / uiNavItem |

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

Verification: 50 automated checks, including an application-wide rendered-button audit and answer-versus-control behaviour checks. Narrow and desktop browser checks accompany the release; these are viewport checks, not a claim of physical-device testing.
