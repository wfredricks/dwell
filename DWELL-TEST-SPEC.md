# Dwell Test Spec

*Status: Left-bookend specification activity*
*Date: 2026-07-01*
*Input: `artifacts/dwell/sig/d01-d05.cypher`, `artifacts/dwell/DWELL-EVENT-ARCHITECTURE.md`*
*Output: Test intent descriptions + SIG gaps surfaced*
*Traceability: Every test suite traces to a SIG file and spec section*

---

## Purpose

This is a **specification activity**, not a testing activity. Its job is to ask "what would I assert?" for every agent, event, invariant, and protocol in the SIG — and to surface gaps where the SIG is unclear or incomplete. Test files are a right-bookend artifact; they are written during the build phase. This document drives an improved SIG.

---

## Suite 1 — Agent Boundary Invariants
*SIG trace: d05-invariants.cypher — BbNeverLeavesTheTwin, ZipperIsOnlyCrossBoundaryAgent*

### T1.1 — bb.* events stay inside the twin
**Intent:** No agent other than the Zipper may emit a subject beginning with `dwell.`
**Arrange:** Instantiate each Personal Twin agent (Antiquarian, Calibrator, Surveyor, Gatekeeper, Bridge, Answer Agent, Engagement Agent, Cultivator, Donna) with a mock NATS client that records all published subjects.
**Act:** Run each agent through a representative scenario.
**Assert:** None of the recorded subjects begins with `dwell.`.
**SIG gap found:** The SIG declares the invariant but does not specify how agents receive their NATS client — dependency injection? Module-level singleton? The test cannot be written without knowing the injection point. **→ SIG needs: `NatsClientProvider` interface, injection pattern per agent.**

### T1.2 — Zipper is the only dwell.* publisher
**Intent:** The Zipper is the sole publisher on the `dwell.*` namespace.
**Arrange:** All agents share a mock NATS bus. Record publisher identity per subject.
**Act:** Run a full scenario: intent declared → knowledge graph loaded → bridge synthesised → outcome signal fired.
**Assert:** Every `dwell.*` publication has `publisherId === 'zipper'`.

### T1.3 — Zipper translates bb.need.* to dwell.* and back
**Intent:** When an internal agent emits a need, the Zipper converts it to the correct dwell.* call and posts the result back to bb.contribution.*.
**Arrange:** Mock channel connector that returns a fixed response.
**Act:** Post `bb.bridge.requested` to the bus.
**Assert:** Zipper publishes `dwell.{twinId}.bridge.query`; mock connector response arrives as `bb.contribution.bridge.*`.
**SIG gap found:** `bb.need.*` is referenced in the agent map but no `bb.need.*` events are defined in d02. The Zipper's trigger subjects are undefined. **→ SIG needs: explicit `bb.need.*` event definitions OR a statement that Zipper consumes specific named bb.* events (bridge.requested, gaps.initial, etc.) directly rather than a need namespace.**

---

## Suite 2 — Discovery Protocol
*SIG trace: d03-inter-twin-events.cypher — DwellBroadcastDiscovery, DwellDiscoveryResponse, DwellDomainGap*

### T2.1 — Single Domain Twin response → channel connected
**Arrange:** One mock Domain Twin subscribed to `dwell.broadcast.discovery`. Zipper has no existing channel connectors.
**Act:** Bridge emits an intent requiring a new domain.
**Assert:**
- `dwell.broadcast.discovery` fires with correct `replyTo`, `intent`, `sourceKnowledge`
- Domain Twin responds on `dwell.{userId}.discovery.response`
- Zipper establishes one channel connector to the responding twin
- `bb.contribution.discovery` (or equivalent) posted to BB

### T2.2 — Multiple Domain Twin responses → Answer Agent selects
**Arrange:** Two mock Domain Twins, one generic GCP twin (coverage=0.71, qualityScore=0.82) and one cert-specific GCP PCA twin (coverage=0.94, qualityScore=0.89, crossDomainSupport includes "aws-saa").
**Act:** Discovery broadcast fires.
**Assert:**
- Both responses arrive on `dwell.{userId}.discovery.response`
- Answer Agent evaluates both
- Answer Agent selects the cert-specific twin (higher coverage + crossDomainSupport match)
- Engagement Agent routes selection to Zipper
- Zipper establishes channel connector to the cert-specific twin
**SIG gap found:** Answer Agent evaluation criteria for discovery are stated in prose (Q5 resolution) but not encoded as a SIG type. **→ SIG needs: `DiscoveryEvaluationCriteria` type with fields: `coverage`, `qualityScore`, `crossDomainSupport`, `specificity`, and a scoring formula or ranking rule.**

### T2.3 — No Domain Twin responds → domain gap event fires
**Arrange:** No Domain Twins subscribed. Timeout set to 100ms for test speed.
**Act:** Discovery broadcast fires.
**Assert:** After timeout, `dwell.{userId}.domain.gap` fires with `intent` and `requestedAt`.
**SIG gap found:** Who holds the timeout timer? Zipper? Bridge? The spec says the Zipper manages channel connectors but the timeout logic isn't assigned. **→ SIG needs: explicit assignment of discovery timeout ownership to Zipper.**

### T2.4 — replyTo field is the only userId in inter-twin payload
**Arrange:** Inspect all dwell.* event payloads.
**Assert:** Only `DwellBroadcastDiscovery.replyTo` contains a userId string. All other inter-twin payload fields contain no userId, no personal identifiers.

---

## Suite 3 — Knowledge Graph Protocol
*SIG trace: d03 — DwellKgRequest, DwellKgDelivered*

### T3.1 — KG request carries learner baseline
**Arrange:** Calibrator has initialized mastery for "aws-saa" with 247 nodes at various altitudes.
**Act:** Bridge triggers KG request for "gcp-pca".
**Assert:** `dwell.{twinId}.kg.request` payload contains `learnerBaseline` with aws-saa mastery nodes; no other personal data.

### T3.2 — KG delivery populates Calibrator, Surveyor, Gatekeeper
**Arrange:** Mock Domain Twin delivers a 312-node KG with curated batches and misconception catalog.
**Act:** Zipper receives `dwell.{userId}.kg.delivered` and posts to BB.
**Assert:**
- Calibrator reads the delivery and initializes `bb.mastery.gcp-pca.initialized` with 201 nodes at partial credit ≥ 0.6 (based on AWS equivalences)
- Surveyor reads and posts `bb.gaps.gcp-pca.initial` with gap clusters
- Gatekeeper reads and posts `bb.path.gcp-pca.ready`
**SIG gap found:** The sequence in which Calibrator, Surveyor, and Gatekeeper process the KG delivery is not specified. If all three consume `bb.contribution.kg.*` simultaneously, ordering conflicts are possible. **→ SIG needs: processing order or explicit statement that all three are independent consumers with no ordering dependency.**

### T3.3 — Cross-domain partial credit calculation
**Arrange:** AWS SAA mastery: IAM policy evaluation at Apply (3), currentConfidence=0.91. GCP KG reports IAM→Cloud IAM equivalence score=0.92.
**Assert:** Calibrator initializes GCP Cloud IAM node at `bloomsCurrentAltitude=3`, `confidence=0.91*0.92≈0.84`.
**SIG gap found:** The partial credit calculation formula (equivalence score × prior confidence?) is not specified. **→ SIG needs: `PartialCreditFormula` — how `similarityScore` from the cross-domain equivalence map combines with `confidence` to produce the initial mastery estimate.**

---

## Suite 4 — Bridge Query Protocol
*SIG trace: d03 — DwellBridgeQuery, DwellBridgeResponse; d02 — BbBridgeRequested, BbBridgeReady*

### T4.1 — Surveyor plateau detection triggers bridge request
**Arrange:** Calibrator has updated GCP subnet node 4 times; confidence plateau at 0.61 for 18 minutes.
**Act:** Calibrator emits `bb.mastery.gcp-pca.updated` with plateau signal.
**Assert:** Surveyor detects plateau, emits `bb.bridge.requested` with `learnerState: 'plateau'`, `calibratorSignal.plateauDuration: '18min'`.
**SIG gap found:** Plateau detection threshold (what confidence level + visit count + time qualifies?) is not specified. **→ SIG needs: `PlateauDetectionPolicy` — threshold values for confidence ceiling, minimum visits, and minimum duration before bridge request fires.**

### T4.2 — Zipper routes bridge.requested to Domain Twin Librarian
**Arrange:** Channel connector established to GCP PCA Domain Twin.
**Act:** `bb.bridge.requested` fires.
**Assert:** Zipper calls `dwell.{twinId}.bridge.query` with `targetConceptIds`, `sourceDomains`, no personal identifiers.

### T4.3 — Bridge personalises generic card using Antiquarian
**Arrange:** Domain Twin Librarian returns 3 candidates: hierarchy-analogy (effectivenessScore=0.87), layer-stack (0.82), containment-model (0.79). Antiquarian holds: nuclear-power-experience (deep), OSI-model (moderate), no ACL-background.
**Act:** Bridge receives candidates via `bb.answer.bridge`.
**Assert:**
- Bridge selects hierarchy-analogy (highest score + Antiquarian nuclear evidence match)
- Bridge personalises with Peach Bottom EOP reference
- Emits `bb.bridge.ready` with `sourceAnchor: 'Peach Bottom EOP hierarchy'`
**SIG gap found:** How does Bridge access Antiquarian's mental model inventory? Does Bridge query Antiquarian directly (violating agent isolation) or read a BB snapshot? **→ SIG needs: `AntiquarianSnapshot` — a BB-posted summary of the learner's mental model inventory that Bridge can read without directly calling Antiquarian.**

### T4.4 — Donna holds bridge card until right moment
**Arrange:** Bridge emits `bb.bridge.ready`. Bill's mode is `focused` (deep in a document).
**Assert:** Donna does not surface the card immediately. Card is held in queue.
**Act:** Bill saves document. Mode transitions to `transitioning`. 11 seconds of stillness.
**Assert:** Donna surfaces the card.

---

## Suite 5 — Bloom's Altitude Model
*SIG trace: d04-blooms-model.cypher*

### T5.1 — Evidence-to-altitude mapping
**Arrange:** Antiquarian holds evidence records of known types.
**Assert:** Each evidence type maps to the correct altitude per the table in d04:
- "read about" → Remember (1)
- "explained in writing" → Understand (2)
- "used in project" → Apply (3)
- "diagnosed a problem" → Analyze (4)
- "evaluated architectural options" → Evaluate (5)
- "designed a system" → Create (6)

### T5.2 — Altitude gap calculation
**Arrange:** `bloomsTargetAltitude=5` (Pro cert), `bloomsCurrentAltitude=3` (Apply, from AWS SA evidence).
**Assert:** `altitudeGap = 2`. Content floor = 4 (Analyze). Content ceiling = 5 (Evaluate).

### T5.3 — Cumulative traversal enforced
**Arrange:** Calibrator attempts to mark a node as mastered at Evaluate (5) without evidence at Analyze (4).
**Assert:** System rejects or flags the claim. Calibrator cannot set `bloomsCurrentAltitude=5` if prior evidence only supports altitude 3.
**SIG gap found:** The SIG declares the invariant but not the enforcement mechanism. Who checks? Calibrator validates its own updates? A separate validator? **→ SIG needs: `BloomsAltitudeValidator` — specification of where and how the cumulative traversal invariant is enforced at runtime.**

### T5.4 — Cold student: full traversal required
**Arrange:** Learner has no prior evidence in domain. `bloomsCurrentAltitude=0` for all nodes. Target: Apply (3).
**Assert:** Gatekeeper produces a path starting at Remember (1) for every node. No nodes skipped.

### T5.5 — Warm student: traversal starts at current+1
**Arrange:** Bill holds AWS SAA. For VPC networking node: `bloomsCurrentAltitude=3`. GCP VPC networking target=5.
**Assert:** Domain Twin serves content starting at Analyze (4) for that node. No Remember/Understand/Apply content served.

### T5.6 — Domain Twin sets target altitude, not learner
**Arrange:** Learner attempts to set `bloomsTargetAltitude=6` (Create) for a cert that requires Evaluate (5).
**Assert:** The target altitude is rejected or ignored. Domain Twin's declared target takes precedence.
**SIG gap found:** How does the Domain Twin communicate its `bloomsTargetAltitude` per node? It's in the KG payload (`bloomsTargetAltitude` field on each node) — but what happens if a learner's session context tries to override it? **→ SIG needs: `TargetAltitudeOverridePolicy` — explicit statement that learner session cannot override Domain Twin's target altitude.**

---

## Suite 6 — Outcome Signal Protocol
*SIG trace: d03 — DwellOutcomeSignal; d05 — OutcomeSignalCarriesNoPII, PersonalTwinReportsDomainTwinLearns*

### T6.1 — Outcome signal carries no PII
**Arrange:** Bill engages with a bridge card. Personal Twin prepares outcome signal.
**Assert:** Payload contains no: userId, twinId traceable to a person, name, email, session key. Fields present: `conceptId`, `interactionType`, `bridgeId`, `sourceDomains`, `outcome`, `bloomsAltitudeAtInteraction`, `occurredAt` only.

### T6.2 — Signal fires after every learning interaction
**Arrange:** Bill engages with: (1) a learning node, (2) a bridge card, (3) an assessment item.
**Assert:** Three separate `dwell.{twinId}.outcome.signal` events fire, one per interaction, each with the correct `interactionType`.

### T6.3 — Domain Twin receives signal without Personal Twin involvement
**Arrange:** Mock Domain Twin subscribed to `dwell.{twinId}.outcome.signal`.
**Act:** Outcome signal fires.
**Assert:** Domain Twin's Librarian receives the signal and updates effectiveness scores internally. No callback or acknowledgment required from Personal Twin.

---

## Suite 7 — Domain Currency / Staleness Protocol
*SIG trace: d03 — DwellDomainUpdated, DwellUpdateRequest, DwellUpdateDelivered; d05 — ChannelConnectorIsSubscription, DomainTwinDoesNotTrackSubscribers*

### T7.1 — Thin update notification flows through channel connector
**Arrange:** Domain Twin emits `dwell.domain.{twinId}.updated` through its channel connector.
**Act:** Zipper receives it.
**Assert:** Zipper posts `bb.domain.<domain>.change-available` to BB. Payload contains only `domain` and `twinId` — no change detail.

### T7.2 — Cultivator pulls pre-curated delta
**Arrange:** `bb.domain.<domain>.change-available` posted. Channel connector to Domain Twin is active.
**Act:** Cultivator sees event, triggers Zipper to call `dwell.{twinId}.update.request` with `sinceVersion`.
**Assert:** Domain Twin delivers `dwell.{userId}.update.delivered` with `affectedConcepts`. Zipper posts `bb.domain.<domain>.updated` with the delta.

### T7.3 — Domain Twin does not know or track subscribers
**Arrange:** Three Personal Twins have channel connectors to the same Domain Twin.
**Act:** Domain Twin emits `dwell.domain.{twinId}.updated`.
**Assert:** Domain Twin payload contains no subscriber list, no userId references. The channel connector infrastructure (NATS) handles fan-out transparently.

---

## Suite 8 — Assessment Protocol
*SIG trace: d03 — DwellAssessmentRequest, DwellAssessmentDelivered*

### T8.1 — Assessment items requested at correct Bloom's level
**Arrange:** Calibrator confidence for IAM policy evaluation is 0.88, target altitude=3 (Apply), current altitude=2 (Understand).
**Act:** Tester (via Zipper) requests assessment items.
**Assert:** Request payload has `bloomsLevel=3` (testing at target, not current). `masteryContext` includes current confidence.

### T8.2 — Assessment outcome updates Calibrator
**Arrange:** Bill answers an Apply-level question correctly, hesitantly.
**Act:** Methodology layer emits `bb.assessment.outcome`.
**Assert:** Calibrator updates node: confidence increases moderately (correct answer) but not maximally (hesitant). `bloomsLevelDemonstrated=3`.

### T8.3 — Incorrect assessment does not trigger altitude regression
**Arrange:** Node currently at Understand (2). Bill answers an Apply (3) question incorrectly.
**Assert:** `bloomsCurrentAltitude` does not drop below 2. Confidence decreases but altitude floor holds.
**SIG gap found:** Altitude regression policy is not specified. Can a wrong answer reduce altitude? **→ SIG needs: `AltitudeRegressionPolicy` — can demonstrated altitude regress? If not, what is the floor rule?**

---

## SIG Gaps Summary

All gaps found during test-thinking. Each must be resolved in the SIG before build.

| # | Gap | Affected SIG file | Resolution needed |
|---|---|---|---|
| G1 | `NatsClientProvider` injection pattern — agents need a NATS client but injection point unspecified | d01, d02 | Add `NatsClientProvider` interface + injection spec per agent |
| G2 | `bb.need.*` namespace undefined — Zipper's trigger subjects unclear | d02, d05 | Either define explicit `bb.need.*` events OR confirm Zipper consumes named bb.* events directly |
| G3 | `DiscoveryEvaluationCriteria` — Answer Agent scoring formula not encoded | d01, d03 | Add `DiscoveryEvaluationCriteria` type with fields and scoring rule |
| G4 | Discovery timeout ownership — who holds the timer? | d03, d05 | Assign timeout ownership explicitly to Zipper; add `discoveryTimeoutMs` config |
| G5 | KG processing order — Calibrator, Surveyor, Gatekeeper ordering | d02, d03 | Confirm independent consumers with no ordering dependency OR sequence them |
| G6 | `PartialCreditFormula` — how similarity score × prior confidence = initial mastery | d03, d04 | Add formula or algorithm spec |
| G7 | `PlateauDetectionPolicy` — threshold values for plateau detection | d02 | Add `PlateauDetectionPolicy` type with configurable thresholds |
| G8 | `AntiquarianSnapshot` — how Bridge reads learner mental model profile | d01, d02 | Add `AntiquarianSnapshot` as a BB-posted type that Bridge consumes |
| G9 | `BloomsAltitudeValidator` — where/how cumulative traversal is enforced | d04, d05 | Add validator spec; assign to Calibrator or separate component |
| G10 | `TargetAltitudeOverridePolicy` — can learner session override Domain Twin target? | d04 | Explicit policy: Domain Twin target is immutable from learner session |
| G11 | `AltitudeRegressionPolicy` — can demonstrated altitude regress on wrong answer? | d04 | Specify floor rule (altitude cannot go below highest demonstrated level?) |

---

## Vocabulary Added

- **Test Spec** — left-bookend specification activity; asks "what would I assert?"; output is improved SIG + test intent; test files are right-bookend artifacts written during build
- **SIG gap** — a testability failure: a thing that can't be asserted because the spec is underspecified; every gap found here requires a SIG update before build
- **Plateau detection** — the mechanism by which Calibrator/Surveyor identifies that a learner is stuck (confidence stalled, repeated visits, no altitude progression); triggers a bridge request
- **AntiquarianSnapshot** — a BB-posted summary of the learner's mental model inventory; enables Bridge to personalize without directly coupling to Antiquarian
