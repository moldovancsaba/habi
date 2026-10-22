# HABI2: conversational support for young athletes

Research and delivery decisions · 22 October 2026

## Product decision

Create a separately accessible version at `/habi2`. HABI remains available at `/`. HABI2 uses one conversational workspace: an athlete expresses a need, HABI asks a manageable question, a choice or embedded tool helps them respond, and the exchange ends with an optional, concrete next action. Conversation is the organising principle; diagrams, history, settings and longer exercises retain appropriate visual controls inside that workspace.

Keep HABI's robot, Hungarian voice, blue palette, five coloured metric icons and shared component system. Keep all original domain records and authored support modules. Do not copy another service's clinical positioning, care-team workflow, personality or engagement mechanics.

## Evidence and industry review

These sources have different purposes. Product documentation demonstrates patterns, not effectiveness. Design guidance informs decisions, not clinical outcomes. A small adolescent UX experiment does not establish suitability for every child. The decisions below are HABI-specific interpretations.

| Primary source | Finding relevant to HABI | HABI2 decision | Boundary |
|---|---|---|---|
| [UNICEF Guidance on AI and Children 3.0](https://www.unicef.org/innocenti/reports/policy-guidance-ai-children), December 2025 | Child-centred systems should protect privacy, support wellbeing, include children and explain themselves. | Accessible explanation of HABI's role; optional answers; no automated sharing; research with children before extending the audience. | This is a design baseline, not a claim of regulatory compliance. |
| [UNICEF: When AI becomes a friend](https://www.unicef.org/documents/when-ai-becomes-friend-child-rights-risks), June 2026 | Conversational and relational systems present particular risks for children. | Robot guide rather than simulated human confidant; no exclusivity, guilt, relationship escalation or dependency rewards. Trusted people remain accessible. | A convincing conversation must not depend on misleading a child about who is responding. |
| [Microsoft Human–AI Interaction Guidelines](https://www.microsoft.com/en-us/research/blog/guidelines-for-human-ai-interaction-design/), 2019 | Capability clarity, correction, dismissal, ambiguity repair and continuity are observable design concerns. | Persistent context and menu; explicit topic confirmation; editable daily replies; preserved drafts and parked conversations. | HABI's keyword matching suggests a direction; it does not establish psychological understanding. |
| [Google Conversation Design: Suggestions](https://developers.google.com/assistant/conversation-design/suggestions), updated 2024 | Suggested responses reduce the effort of answering broad questions and help discovery. | Text, topics and starter questions coexist. Contextual quick replies remain the main path through authored conversation trees. | Archived Assistant guidance is used for stable interaction principles, not as a current platform recommendation. |
| [Turn.io Conversation Design Best Practices](https://learn.turn.io/l/en/article/4g9gwsgeng-conversation-design-best-practices), 2025 | Concise turns, natural pauses, interruption recovery and clear exits matter in conversational services. | One active question; brief messages; resumable work; accessible menu; deliberate ending with a useful action. | Service-design guidance, not evidence that chat is superior to every form. |
| [Headspace Ebb](https://www.headspace.com/ai-mental-health-companion) and [AI principles](https://www.headspace.com/ai) | Reflection can lead to relevant content; the product distinguishes AI support from human care and makes sharing a choice. | Connect conversation to HABI's existing exercises and self-reflection. Let the athlete choose the next activity. | Adopt orchestration, not an adult mental-health product or a claim of equivalent AI capability. |
| [Wysa FAQ](https://www.wysa.com/faq) and [child-friendly terms](https://legal.wysa.io/children/terms) | Structured reflection, exercises and an understandable explanation of the system can coexist. | Retain HABI's reviewed decision trees and reusable exercise library; explain the digital helper simply. | Do not import Wysa's clinical measures, age eligibility or evidence claims into HABI. |
| [Mariamo et al., JMIR Human Factors](https://humanfactors.jmir.org/2021/1/e24343), 2021 | In an experiment with 19 adolescents aged 14–17, multiple-response questions were more likely to elicit responses than open-ended questions. | Make supported choices easy without removing free text. Test wording and effort with athletes. | Small question-presentation study; not a live longitudinal trial, not proof of therapeutic benefit, not evidence for younger children. |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [focus visibility](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html), [status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html), [dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | Keyboard focus, announcements and overlays need explicit handling. | Native modal menu, visible focus, named composer, concise status region, independently scrolling conversation and non-overlapping composer. | Automated and visual checks do not amount to a full accessibility audit. |

## Why this is a hybrid conversational interface

A pure transcript is poor for comparing 14 days, editing a message, finding a saved exercise or changing a preference. A conventional dashboard makes an athlete choose an internal feature before expressing their need. HABI2 sits between these extremes: conversation handles orientation and transitions; embedded components handle information that needs structure.

The design optimises for useful completion and a comfortable exit, not message count or time spent. No typing delays, fabricated human availability, streak pressure or artificial urgency are added. Wording variation remains an authored presentation choice, never a change to the underlying assessment or action.

## Journey and capability mapping

| Athlete's intent | Entry | Interaction | Outcome and return |
|---|---|---|---|
| Tell HABI about today | Opening choice, menu or recognised intent | Seven existing optional questions, one active turn; recent reply visible, older replies expandable; edit, skip, back and later controls | Existing interpretation, five icons, own note and useful action. Same dated history. |
| Talk about something difficult | Own words, one of seven topics, starter question or existing situation | Existing three trees and contextual/situation flows; options guide the next question | Existing seven action outcomes, optional exercise, own summary, preparation or return plan. |
| Try something helpful | Opening choice, result or menu | Existing library and instructions as embedded tool cards | Athlete rates whether it helped; same practice evidence and source links. |
| Work on a small commitment | Menu or relevant outcome | Existing goal creation, explicit replacement, review, pause and habit conversion | One active commitment; previous commitments remain in history. |
| Understand change over time | Opening choice, typed intent or menu | Existing charts, warm interpretation and dated diary in a visual card | Continue reflection or a relevant existing support action; no invented progress claims. |
| Look back over a month | Menu, typed intent or progress | Sixteen pinned, optional questions as conversational turns | Existing monthly interpretation and next focus, without clinical labels. |
| Think about an evening, week or event | Menu or existing related action | Existing reflection inputs and event context | Dated reflection and source-linked next action. |
| Find words for a trusted person | Menu or relevant conversation ending | Existing person/need/context/message drafting | Athlete reviews and downloads their own message. Nothing is automatically sent. |
| Pause or change direction | Consistent controls and always-visible menu | Existing drafts survive; unfinished chats are parked when a new topic starts | Resume from the opening or menu; page refresh restores the HABI2 workspace. |
| Need immediate support | Menu or recognised safety language | Existing priority support route; direct trusted-adult guidance | Immediate human help takes precedence over exercises and goal setting. |

## Interaction contract

1. The header describes the current purpose. It is not another brand banner or a step counter.
2. The composer stays available. During an active flow it can begin another topic after a clear choice, without silently treating typed text as a scored answer.
3. Unknown text leads to topic disambiguation. Multiple matching service intents also fall back to topic selection rather than guessing.
4. Safety-language routing is checked before ordinary service intents. Keyword recognition is limited and is not a dependable risk-assessment system.
5. Answer buttons use the existing start-aligned choice component. Actions use centred primary/secondary components. Skip, back and later share the same soft-blue control family.
6. There is one active question. The latest completed daily/monthly exchange remains visible; earlier replies are expandable. Daily replies can be revisited, and monthly back retains the pinned definition.
7. Navigation does not save a completed record. Only the existing completion actions do that. Drafts and completed records remain distinct.
8. A new conversation cannot erase an unfinished one through the HABI2 composer or topic launcher. Parked conversations have explicit resume actions.
9. The menu makes the complete capability set findable without relying on typing the correct phrase. It supports Escape and native focus containment.
10. New copy and routing vocabulary live in the Mongo-backed `habi2_v1` catalog. Appearance lives in `global.css`. Existing scores, history and content remain shared with HABI1.

## Delivery scope and implementation

HABI2 is an additional experience layer loaded only by `habi2.html`. Its renderer reuses HABI's domain functions and cloud persistence; it does not create a second assessment engine. The database stores the workspace under `app.habi2`, alongside existing records. New catalog keys are additive and do not replace edited Mongo content. The existing root experience remains independently accessible.

Daily and monthly question delivery is conversational. Guided support already has a transcript. Richer features use their existing functional cards within the conversational workspace; they are not rewritten as artificial back-and-forth messages. This intentionally preserves their functionality and reduces accidental feature loss.

## Verification and research still needed

Automated regression checks cover HABI1 plus HABI2 entry methods, all menu destinations, daily skip/edit/no-training semantics, monthly completion, workspace restoration, topic interruption, parked-chat recovery, escaping and the single-stylesheet contract. Browser checks cover real navigation, composition, question visibility, modal controls and responsive layout.

Before treating this as a validated child-facing service, conduct moderated sessions across the intended age bands with appropriate adult involvement. Test: starting without knowing a feature name; correcting a reply; changing topics mid-assessment; resuming after closing; finding yesterday's suggestion; interpreting a trend; leaving when they do not want to answer. Ask participants to explain what HABI can do and who sees a message. Record completion, wrong turns, unintended submissions and recovery without assistance. Include keyboard, zoom and screen-reader sessions. Have a qualified child-wellbeing specialist review authored guidance and escalation wording.

Success means athletes know where they are, can express a need in more than one way, can recover without losing work, and leave with a manageable next action. Research findings support the design direction; they do not establish HABI's clinical effectiveness or certify its safety.
