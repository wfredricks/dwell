# Dwell Requirements

*Status: Left-bookend — Requirements phase*
*Date: 2026-07-01*
*Position in sequence: Story ✅ → **Requirements** → Use Cases → Proof Story → Features → SIG ✅ → Test Spec ✅ → Improved SIG ✅*
*Traceability: Every requirement traces to story scene, spec section, or design decision*

---

## Requirement Format

```
REQ-DW-{CAT}-{NNN}
Title
Description
Priority: P0 (must) | P1 (should) | P2 (nice to have)
Source: <story scene / spec section / design decision date>
```

---

## Category: Intent & Goal Management (LGM)

#### REQ-DW-LGM-01 — Natural Language Intent Declaration
The learner must be able to declare a learning intent in natural language (e.g. "AWS Solutions Architect cert"). The system must interpret and map this to a known domain or certification.
**Priority:** P0
**Source:** Story Scene 1 — "Bill opens Dwell and types four words"

#### REQ-DW-LGM-02 — Intent Triggers Full Team Orientation
On intent declaration, the system must initiate domain discovery, Antiquarian baseline assessment, Calibrator initialization, Surveyor gap analysis, and Gatekeeper path generation — in that order, with each step feeding the next.
**Priority:** P0
**Source:** Story Scene 1 — "The whole exchange takes eleven seconds"

#### REQ-DW-LGM-03 — Certification Achievement Recording
The system must accept external validation of a certification (learner-reported) and record it as a validated mastery event. This triggers Antiquarian upgrade, Calibrator map completion, Cultivator staleness watch activation, and Surveyor post-cert gap analysis.
**Priority:** P0
**Source:** Story Scene 5 — "The Blackboard receives the outcome signal"

#### REQ-DW-LGM-04 — Multiple Concurrent Intents
The system must support multiple concurrent learning intents (e.g. AWS SAA in progress while GCP PCA is declared). Each intent must maintain its own mastery map, gap clusters, and learning path.
**Priority:** P1
**Source:** Design conversation 2026-07-01 — constellation architecture; implicit in three-cert scenario

---

## Category: Domain Twin Discovery (DTD)

#### REQ-DW-DTD-01 — Discovery by Broadcast, Not Registry
The system must discover Domain Twins by broadcasting a discovery event. No central registry. Any Domain Twin subscribed to the discovery channel may respond.
**Priority:** P0
**Source:** Design decision 2026-07-01 — "No registries. NATS broadcast."

#### REQ-DW-DTD-02 — Zero Response Is a First-Class Event
If no Domain Twin responds to discovery within the configured timeout, the system must emit a `domain.gap` event. This is a platform-level finding, not an error — it identifies domains that need Domain Twin coverage.
**Priority:** P0
**Source:** Design decision 2026-07-01 — "The silence is itself a signal"

#### REQ-DW-DTD-03 — Multiple Response Evaluation Is Algorithmic
When multiple Domain Twins respond, the Answer Agent must evaluate and rank them using a deterministic weighted formula (DiscoveryEvaluationPolicy). No LLM call. Selection criteria: coverage, quality score, cross-domain support match, specificity.
**Priority:** P0
**Source:** Design decision 2026-07-01 — G3 resolution; I-10 Algo philosophy

#### REQ-DW-DTD-04 — Domain Twins Register as BBTools
Domain Twins must connect to the Personal Twin via I-7 MCP External Tools, registering as BBTools in the BBToolRegistry. They participate in the Zipper's Probe stage like any other registered tool.
**Priority:** P0
**Source:** Twin Architecture Reference 2026-07-01 — "The plug point for Domain Twins in Dwell"

#### REQ-DW-DTD-05 — Multiple Domain Twins May Be Connected Simultaneously
The system must support connecting to more than one Domain Twin for a given intent (e.g. a cert-specific twin for exam prep and a general twin for practical depth). The Zipper may hold multiple channel connectors.
**Priority:** P1
**Source:** Design decision 2026-07-01 — "Answer Agent may connect to multiple Domain Twins"

---

## Category: Knowledge Graph (KGM)

#### REQ-DW-KGM-01 — Domain Knowledge Graph Loaded on Connection
After Domain Twin discovery, the Personal Twin must call the Domain Twin for its full knowledge graph. The graph must include: concept nodes (with Bloom's target altitude and exam weight), prerequisite edges, and cross-domain equivalence edges (with similarity scores and delta notes).
**Priority:** P0
**Source:** Story Scene 1; Spec Part 2 — Knowledge Graph Protocol

#### REQ-DW-KGM-02 — Curated Batches Delivered with Knowledge Graph
The Domain Twin must deliver curated learning batches with the knowledge graph. A curated batch is a set of concepts the Domain Twin's pedagogy requires to be taught together. The Personal Twin's Gatekeeper must respect batch groupings when sequencing the learning path.
**Priority:** P0
**Source:** Design decision 2026-07-01 — "Curated batches are expert knowledge the personal twin cannot derive"

#### REQ-DW-KGM-03 — Misconception Catalog Delivered with Knowledge Graph
The Domain Twin must deliver a misconception catalog with the knowledge graph. Each entry identifies: which concepts are affected, which source domain (if any) produces the misconception, and a description.
**Priority:** P1
**Source:** Story Scene 8 — "Convergent-misconception risks"; Spec Part 2 — KG payload

#### REQ-DW-KGM-04 — Learner Baseline Sent with Knowledge Graph Request
When requesting a knowledge graph, the Personal Twin must include the learner's prior mastery baseline (concept IDs, bloomsCurrentAltitude, confidence) for all previously mastered domains. The Domain Twin uses this to: compute cross-domain partial credit AND determine content floor per node.
**Priority:** P0
**Source:** Spec Part 2 — `dwell.{twinId}.kg.request` payload; G6 resolution

---

## Category: Mastery Tracking (MST)

#### REQ-DW-MST-01 — Initial Mastery from Antiquarian Evidence
On knowledge graph delivery, Calibrator must initialize mastery for each node using Antiquarian's evidence baseline. Evidence type maps to Bloom's altitude: "read about" → Remember (1), "used in project" → Apply (3), etc. per the evidence-to-altitude table.
**Priority:** P0
**Source:** Spec — Bloom's Altitude Model; G3 resolution

#### REQ-DW-MST-02 — Partial Credit from Cross-Domain Equivalence
When a concept node has a cross-domain equivalence from a mastered domain, Calibrator must compute partial credit using PartialCreditFormula: confidence = priorConfidence × similarityScore; altitude per threshold (≥0.80 full transfer, 0.60–0.79 altitude−1, <0.60 cold).
**Priority:** P0
**Source:** G6 resolution 2026-07-01

#### REQ-DW-MST-03 — Altitude Is Monotonically Increasing
`bloomsCurrentAltitude` for any concept node must only increase, never decrease. A wrong answer, poor assessment performance, or time gap may decrease confidence but must not reduce demonstrated altitude.
**Priority:** P0
**Source:** G11 resolution; invariant AltitudeNeverRegresses

#### REQ-DW-MST-04 — Confidence Is Bidirectional
Calibrator confidence for a node must move in both directions: increasing on positive assessment outcomes and engagement signals; decreasing on wrong answers, skips, or dismissals.
**Priority:** P0
**Source:** G11 resolution; invariant ConfidenceIsTheBidirectionalSignal

#### REQ-DW-MST-05 — Altitude Advancement Requires Confidence Threshold
Gatekeeper must not route to altitude N+1 content until the learner's confidence at altitude N meets the configured `confidenceToAdvance` threshold (default 0.85). If confidence drops below threshold after altitude N was demonstrated, the system serves more N-level content before advancing.
**Priority:** P0
**Source:** G11 resolution; AltitudeFloorRule type

#### REQ-DW-MST-06 — Warm vs Cold Student Classification Per Node
The system must classify each concept node as warm (bloomsCurrentAltitude > 0) or cold (bloomsCurrentAltitude = 0). Gatekeeper must set content floor at bloomsCurrentAltitude + 1 for warm nodes and at 1 for cold nodes.
**Priority:** P0
**Source:** Spec — Bloom's Altitude Model; warm/cold student distinction

---

## Category: Gap Detection (GAP)

#### REQ-DW-GAP-01 — Continuous Coverage Monitoring
Surveyor must continuously monitor coverage completeness across all nodes in the active domain — not per-node mastery depth (that is Calibrator's job) but across-the-map coverage. Surveyor must recompute on every mastery update.
**Priority:** P0
**Source:** Story Scene 1 — Surveyor posts initial gap clusters; Architecture doc 2026-07-01

#### REQ-DW-GAP-02 — Gap Type Classification
Surveyor must classify each gap cluster by type: knowledge (missing coverage), drift (may have changed since mastered), bridge (system has both sides but hasn't connected them), convergent-misconception (multiple prior domains produce same wrong intuition).
**Priority:** P0
**Source:** Spec vocabulary; Story Scene 8 — convergent-misconception risks

#### REQ-DW-GAP-03 — Post-Certification Gap Analysis
After a certification is achieved, Surveyor must perform a post-cert gap scan: identify downstream knowledge implied by the cert but not yet evidenced in the learner record. These are surfaced to Donna as non-urgent items.
**Priority:** P1
**Source:** Story Scene 5 — "Surveyor doesn't close the book"

#### REQ-DW-GAP-04 — Plateau Detection Triggers Bridge Request
Surveyor must detect confidence plateaus per PlateauDetectionPolicy (default: 3 visits, confidence delta < 0.05 between visits, persisted ≥ 15 minutes, confidence < 0.80 ceiling) and fire a `bb.bridge.requested` event. All thresholds must be externalized in F-7 Profile config.
**Priority:** P0
**Source:** G7 resolution; Story Scene 4 — "confidence plateau at 0.74 for 18 minutes"

---

## Category: Bridge Synthesis (BRG)

#### REQ-DW-BRG-01 — Generic Bridge Cards from Domain Twin Librarian
On bridge request, the Zipper must call the Domain Twin Librarian for generic bridge card candidates. Candidates must be sorted by effectiveness score. The response must include bridge type, source anchor, and generic text.
**Priority:** P0
**Source:** Story Scene 4 — Bridge queries the Domain Twin; Spec Part 2 — Bridge Query Protocol

#### REQ-DW-BRG-02 — Personalization from AntiquarianSnapshot
Bridge must personalize the selected generic card using the AntiquarianSnapshot ContextNode on the BB. Bridge must not call Antiquarian directly. Mental models with higher strength scores (especially operational/embodied experience) must be preferred over academic knowledge.
**Priority:** P0
**Source:** G8 resolution; Story Scene 4 — "The Bridge reads Antiquarian's full profile"

#### REQ-DW-BRG-03 — Answer Agent Pre-Filters Bridge Candidates
Before Bridge personalizes, the Answer Agent must evaluate incoming bridge card candidates using the full BB context (mastery state, gap clusters, learner profile). Answer Agent selects the best-fit candidate. Bridge receives the pre-filtered selection.
**Priority:** P0
**Source:** Q5 resolution — Answer Agent + Engagement Agent

#### REQ-DW-BRG-04 — Bridge Card Carries Source Attribution
Every personalized bridge card must identify: the generic bridge type used, the learner-specific source anchor (e.g. "Peach Bottom EOP hierarchy"), and whether the bridge originated from the Domain Twin Librarian or was Personal Twin synthesized.
**Priority:** P1
**Source:** Spec — `bb.bridge.ready` payload; Story Scene 4

---

## Category: Attention & Surfacing (ATT)

#### REQ-DW-ATT-01 — Mode-Aware Surfacing
Donna must detect the learner's current mode (focused, transitioning, ambient) and hold items until the mode permits surfacing. Items must not surface during focused mode unless emergency override applies.
**Priority:** P0
**Source:** Story Scenes 2, 4, 7 — Donna holds and waits for the right moment

#### REQ-DW-ATT-02 — Stillness Detection
Donna must detect stillness (configurable duration of inactivity) as a signal of mode transition and use it as a trigger for surfacing held items.
**Priority:** P0
**Source:** Story Scene 2 — "eleven seconds of stillness"; Scene 4 — "twelve seconds"

#### REQ-DW-ATT-03 — Learner Response Handling
Donna must support four learner responses to surfaced items: engaged (👍), thanked (positive acknowledgment), later (re-queue), dismissed (discard). Each response must emit `bb.attention.outcome` for downstream processing by Calibrator and Bridge.
**Priority:** P0
**Source:** Story Scenes 2, 4 — "He presses 👍"; Spec bb.attention.outcome

#### REQ-DW-ATT-04 — Donna Does Not Name Herself
The Attention Window surface must not display "Donna" by name. A label such as "ATTENTION WINDOW" is appropriate. Donna is low-key, ambient — paid in gratitude, not recognition.
**Priority:** P1
**Source:** Design conversation 2026-06-30 — "Could have something called 'Attention Window'"

---

## Category: Assessment (ASM)

#### REQ-DW-ASM-01 — Assessment Items at Target Bloom's Level
Tester must request assessment items at the concept's `bloomsTargetAltitude`, not its current altitude. The assessment probes whether the learner has reached the required level, not whether they're still at the level they demonstrated.
**Priority:** P0
**Source:** Test Spec Suite 8 — T8.1

#### REQ-DW-ASM-02 — Assessment Items from Domain Twin Bank
All assessment items must originate from the Domain Twin's Tester item bank. The Personal Twin must never generate assessment items independently.
**Priority:** P0
**Source:** Constellation architecture — "Domain Twin holds the assessment bank"

#### REQ-DW-ASM-03 — Assessment Outcome Updates Calibrator
Every assessment outcome must update Calibrator: confidence adjusts (correct/incorrect, hesitant/certain), Bloom's level demonstrated is recorded. A correct, confident answer at the target altitude is the primary signal for altitude advancement.
**Priority:** P0
**Source:** Test Spec Suite 8 — T8.2

#### REQ-DW-ASM-04 — Wrong Answer Does Not Regress Altitude
An incorrect assessment response must decrease confidence but must not reduce `bloomsCurrentAltitude`. The altitude floor holds.
**Priority:** P0
**Source:** G11 resolution; Test Spec T8.3

---

## Category: Bloom's Altitude Model (BLM)

#### REQ-DW-BLM-01 — Domain Twin Sets Target Altitude
`bloomsTargetAltitude` per concept node is set by the Domain Twin as part of the course offering. The learner must not be able to set or override their own target altitude.
**Priority:** P0
**Source:** Spec — Bloom's Altitude Model; invariant DomainTwinSetsCeiling

#### REQ-DW-BLM-02 — Cumulative Traversal Enforced
All Bloom's levels from `bloomsCurrentAltitude + 1` to `bloomsTargetAltitude` must be traversed in sequence. The system must not serve content at level N+2 before the learner has demonstrated competence at level N+1.
**Priority:** P0
**Source:** Spec — invariant BloomsAltitudeIsCumulative

#### REQ-DW-BLM-03 — Domain Twin Regulates Content Floor and Ceiling
The Domain Twin must serve content within the range [bloomsCurrentAltitude + 1, bloomsTargetAltitude] for each concept node, based on the learner baseline provided at connection time. Content below the floor and above the ceiling must not be served.
**Priority:** P0
**Source:** Spec — "Domain Twin Regulates Both Ceiling and Floor"

---

## Category: Outcome Signals (OUT)

#### REQ-DW-OUT-01 — Signal After Every Interaction
An outcome signal must fire to the Domain Twin after every learning interaction: learning node engagement, bridge card engagement, assessment item response, methodology interaction.
**Priority:** P0
**Source:** Spec Part 2 — Outcome Signal Protocol

#### REQ-DW-OUT-02 — No Personal Identifiers in Signal
Outcome signal payload must contain no personal identifiers, no twin IDs traceable to a specific person, and no fields from the learner's personal knowledge graph.
**Priority:** P0
**Source:** Invariant OutcomeSignalCarriesNoPII; G4 resolution

#### REQ-DW-OUT-03 — Domain Twin Owns Analytics
Domain Twin Librarian and Tester are the sole analytics processors of outcome signals. The Personal Twin reports; the Domain Twin learns.
**Priority:** P0
**Source:** G4 resolution; invariant PersonalTwinReportsDomainTwinLearns

---

## Category: Domain Currency (CUR)

#### REQ-DW-CUR-01 — Domain Twin Notifies of Knowledge Graph Changes
When a Domain Twin's knowledge graph changes (new cert content, deprecated service, reweighted domain), it must notify all connected Personal Twins through their channel connectors. Notification is a thin broadcast — no change detail in the event.
**Priority:** P0
**Source:** Story Scene 3 — Cultivator detects and relays domain update; Spec Domain Currency Protocol

#### REQ-DW-CUR-02 — Personal Twin Pulls Pre-Curated Delta
On receiving a staleness notification, the Personal Twin must call the Domain Twin for the pre-curated change delta. The Domain Twin prepares the delta proactively on graph change; the call merely retrieves it.
**Priority:** P0
**Source:** Design decision 2026-07-01 — Q1 resolution; thin event + pull pattern

#### REQ-DW-CUR-03 — Domain Twin Does Not Track Subscribers
Domain Twin must not maintain a subscriber list. Fan-out is handled by the channel connector infrastructure. The Domain Twin emits once; connected Personal Twins receive.
**Priority:** P0
**Source:** Invariant DomainTwinDoesNotTrackSubscribers

#### REQ-DW-CUR-04 — Staleness Watch Activated on Certification
When a learner achieves a certification, the Personal Twin's Cultivator must activate a staleness watch for that domain. The watch persists until the learner's mastery is explicitly archived.
**Priority:** P1
**Source:** Story Scene 5 — "Cultivator sets a watch"

---

## Category: Architecture (ARC)

#### REQ-DW-ARC-01 — Zipper Is the Only Cross-Boundary Agent
Only the Zipper may communicate across the bb.*/dwell.* boundary. All other Personal Twin agents must communicate exclusively through the F-2 Blackboard abstraction.
**Priority:** P0
**Source:** Invariant ZipperIsOnlyCrossBoundaryAgent; Twin Architecture Reference

#### REQ-DW-ARC-02 — No Direct Agent-to-Agent Calls
No Personal Twin agent may call another Personal Twin agent directly. All inter-agent communication must flow through the BB (F-5 Event Fabric underneath). Agents are decoupled — they share state via the BB, not via method calls.
**Priority:** P0
**Source:** Kernel Dev Guide Rule #2 — "Modules talk through events"

#### REQ-DW-ARC-03 — Config-Driven Thresholds, No Hardcoding
All tunable thresholds (DiscoveryEvaluationPolicy weights, PlateauDetectionPolicy thresholds, PartialCreditFormula thresholds, confidenceToAdvance) must live in F-7 Profile config. No threshold may be hardcoded in agent logic.
**Priority:** P0
**Source:** G3, G6, G7 resolutions; I-10 Algo — config-driven enables algorithmic refinement over time

#### REQ-DW-ARC-04 — Algorithmic Over LLM Where Deterministic
Any operation that can be computed as a deterministic function of known fields must be implemented algorithmically (Tier 0), not via LLM (Tier 2). Discovery evaluation, partial credit calculation, plateau detection, and altitude gap computation are all Tier 0.
**Priority:** P0
**Source:** I-10 Algo philosophy; G3 resolution

---

## Requirement Count Summary

| Category | Count | Priority P0 | Priority P1 | Priority P2 |
|---|---|---|---|---|
| Intent & Goal Management (LGM) | 4 | 3 | 1 | 0 |
| Domain Twin Discovery (DTD) | 5 | 4 | 1 | 0 |
| Knowledge Graph (KGM) | 4 | 4 | 0 | 0 |
| Mastery Tracking (MST) | 6 | 6 | 0 | 0 |
| Gap Detection (GAP) | 4 | 3 | 1 | 0 |
| Bridge Synthesis (BRG) | 4 | 3 | 1 | 0 |
| Attention & Surfacing (ATT) | 4 | 3 | 1 | 0 |
| Assessment (ASM) | 4 | 4 | 0 | 0 |
| Bloom's Altitude Model (BLM) | 3 | 3 | 0 | 0 |
| Outcome Signals (OUT) | 3 | 3 | 0 | 0 |
| Domain Currency (CUR) | 4 | 3 | 1 | 0 |
| Architecture (ARC) | 4 | 4 | 0 | 0 |
| **Total** | **49** | **43** | **6** | **0** |

---

## Open Items

- No P2 requirements identified yet. If any emerge during Use Cases, they will be added.
- REQ-DW-LGM-04 (concurrent intents) may surface interaction conflicts during Use Cases — how do two active learning paths share Donna's attention window?
- The Enterprise Observer (cohort-level Admin Agent from TrainingMAX) has no requirements here — Dwell v1 is single-learner. Enterprise requirements are deferred.
