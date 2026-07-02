# Dwell Business Types

*Status: Left-bookend — Business Types (implied data)*
*Date: 2026-07-01*
*Position in sequence: Story ✅ → Requirements ✅ → Use Cases ✅ → **Business Types** → Features → Proof Story → SIG ✅ → Test Spec ✅ → Improved SIG ✅*
*Traceability: Every type traced to use case(s) and requirement(s)*

---

## Purpose

These are the domain objects that the Dwell system must understand and manage. They are not implementation classes — they are the business vocabulary from which implementations will be derived. Every type listed here is implied directly by the requirements and use cases; no type is invented.

---

## Type Catalogue

---

### LearningIntent
**Description:** A learner's declared goal to master a knowledge domain or achieve a certification. The root object that triggers the full orientation sequence.
**Lives in:** Personal Twin
**Key fields:**
- `intent: string` — the learner's natural language declaration (e.g. "AWS Solutions Architect cert")
- `domain: string` — the mapped domain identifier derived from the declaration
- `certName: string | null` — the specific certification, if applicable
- `status: "active" | "pending" | "complete" | "archived"` — lifecycle state; pending when no Domain Twin was found
- `declaredAt: ISO8601` — timestamp of declaration
- `completedAt: ISO8601 | null` — set when cert achieved or intent retired

**Referenced by:** UC-01, UC-08, UC-13; REQ-DW-LGM-01, REQ-DW-LGM-02, REQ-DW-LGM-03, REQ-DW-LGM-04

---

### DomainTwinConnection
**Description:** A live connection to a Domain Twin established after discovery and evaluation. Represents the Personal Twin's ongoing relationship with one external expertise source for a specific learning intent. More than one may be active simultaneously for the same intent.
**Lives in:** Personal Twin
**Key fields:**
- `twinId: string` — stable identifier of the connected Domain Twin
- `domain: string` — the knowledge domain this twin covers
- `certName: string | null` — specific certification if cert-specialized
- `coverage: number` — 0.0–1.0 coverage score reported at discovery
- `qualityScore: number` — quality rating reported at discovery
- `crossDomainSupport: string[]` — list of prior domains this twin can bridge from
- `connectedAt: ISO8601` — when the channel connector was established
- `version: string` — the Domain Twin's knowledge graph version at connection time
- `role: "primary" | "secondary"` — whether this twin is primary for this intent or a specialized secondary

**Referenced by:** UC-02, UC-12; REQ-DW-DTD-04, REQ-DW-DTD-05

---

### DiscoveryResponse
**Description:** A Domain Twin's reply to a discovery broadcast, containing its self-reported capabilities and fit for the learner's intent. Multiple responses may arrive; the Answer Agent evaluates all and selects one or more.
**Lives in:** Personal Twin (transient — held during Answer Agent evaluation)
**Key fields:**
- `twinId: string` — the responding Domain Twin's identifier
- `domain: string` — domain this twin covers
- `certName: string | null` — specific certification, if applicable
- `coverage: number` — 0.0–1.0 fraction of domain concepts covered
- `qualityScore: number` — Domain Twin's self-reported quality rating
- `crossDomainSupport: string[]` — prior domains this twin can bridge from
- `version: string` — current knowledge graph version
- `selectionScore: number` — computed by Answer Agent using DiscoveryEvaluationPolicy; not in the response itself
- `selected: boolean` — whether this response resulted in a connection

**Referenced by:** UC-02, UC-12; REQ-DW-DTD-01, REQ-DW-DTD-02, REQ-DW-DTD-03

---

### ConceptNode
**Description:** A single unit of knowledge within a domain's knowledge graph. The atomic object that mastery tracking, gap detection, path generation, and assessment all operate on. Defined by the Domain Twin; cached in the Personal Twin's mastery map.
**Lives in:** Domain Twin (canonical); Personal Twin (cached in mastery map)
**Key fields:**
- `conceptId: string` — stable domain-scoped identifier
- `label: string` — human-readable name
- `bloomsTargetAltitude: 1 | 2 | 3 | 4 | 5 | 6` — the Bloom's level this cert/course requires; set by Domain Twin; never overridden by learner
- `examWeight: number` — 0.0–1.0 relative importance for the cert exam
- `crossDomainEquivalents: CrossDomainEquivalence[]` — concepts in other domains that are equivalent or similar

**Referenced by:** UC-03, UC-04, UC-05, UC-07; REQ-DW-KGM-01, REQ-DW-BLM-01, REQ-DW-BLM-02, REQ-DW-BLM-03, REQ-DW-MST-06

---

### CrossDomainEquivalence
**Description:** A directional mapping from a concept in the current domain to an equivalent or analogous concept in a prior domain the learner has mastered. Used to compute partial credit during warm-start initialization and to identify convergent misconception risks.
**Lives in:** Domain Twin (canonical); Personal Twin (used during mastery initialization)
**Key fields:**
- `domain: string` — the source (prior) domain that contains the equivalent concept
- `conceptId: string` — the concept identifier in the source domain
- `similarityScore: number` — 0.0–1.0; drives partial credit thresholds: ≥0.80 full transfer, 0.60–0.79 altitude−1, <0.60 cold
- `deltaNote: string | null` — description of where the two domains diverge; critical for convergent-misconception detection

**Referenced by:** UC-03, UC-09, UC-15; REQ-DW-MST-02, REQ-DW-KGM-01, REQ-DW-GAP-02

---

### PrerequisiteEdge
**Description:** A directed relationship between two concept nodes in the domain graph. Encodes the pedagogical ordering constraint — which concepts must be understood before others can be learned.
**Lives in:** Domain Twin (canonical); Personal Twin (cached in path planning)
**Key fields:**
- `from: string` — conceptId of the prerequisite concept
- `to: string` — conceptId of the dependent concept
- `relationshipType: "prerequisite" | "reinforces" | "contrasts"` — the nature of the dependency

**Referenced by:** UC-03, UC-04; REQ-DW-KGM-01, REQ-DW-BLM-02

---

### CuratedBatch
**Description:** A pedagogically-coupled concept cluster defined by the Domain Twin — a set of concepts that must be taught together because isolated presentation causes confusion or missed context. The Domain Twin's expert pedagogy encoded as data. The learning path must respect batch groupings; it must not split a curated batch across unrelated path segments.
**Lives in:** Domain Twin (canonical); Personal Twin (respected in path generation)
**Key fields:**
- `batchId: string` — stable identifier
- `label: string` — human-readable name for the batch
- `conceptIds: string[]` — the concept nodes that must be taught together
- `teachTogetherReason: string` — explanation of why these concepts cannot be taught in isolation

**Referenced by:** UC-03, UC-04; REQ-DW-KGM-02

---

### MisconceptionEntry
**Description:** A documented wrong intuition that the Domain Twin expects learners to carry into the domain, particularly when arriving from a specific prior domain. Used to detect convergent-misconception gap risks and to prime Bridge synthesis.
**Lives in:** Domain Twin (canonical); Personal Twin (used in gap classification and bridge selection)
**Key fields:**
- `misconceptionId: string` — stable identifier
- `conceptIds: string[]` — the concepts affected by this misconception
- `sourceDomain: string | null` — the prior domain that produces this wrong intuition (null if the misconception is domain-independent)
- `description: string` — what the wrong intuition is and why it forms

**Referenced by:** UC-03, UC-15; REQ-DW-KGM-03, REQ-DW-GAP-02

---

### MasteryNode
**Description:** The Personal Twin's running estimate of the learner's mastery of a single concept node. The central tracking object for all learning progress. Maintained by Calibrator; read by Surveyor, Gatekeeper, and Donna.
**Lives in:** Personal Twin
**Key fields:**
- `conceptId: string` — the concept this mastery record belongs to
- `bloomsCurrentAltitude: 0 | 1 | 2 | 3 | 4 | 5 | 6` — current demonstrated altitude; 0 = no evidence; monotonically non-decreasing
- `bloomsTargetAltitude: 1 | 2 | 3 | 4 | 5 | 6` — required altitude for the cert; copied from ConceptNode; read-only
- `altitudeGap: number` — `bloomsTargetAltitude − bloomsCurrentAltitude`; 0 means complete; the unit of work remaining
- `confidence: number` — 0.0–1.0 bidirectional signal; increases on positive interactions, decreases on wrong answers, skips, and dismissals
- `confidenceToAdvance: number` — threshold required before altitude can increment; default 0.85; externalized in config
- `source: "prior-evidence" | "partial-credit" | "no-signal"` — how this node was initialized
- `lastUpdated: ISO8601` — timestamp of most recent mastery update

**Referenced by:** UC-03, UC-04, UC-05, UC-07; REQ-DW-MST-01, REQ-DW-MST-02, REQ-DW-MST-03, REQ-DW-MST-04, REQ-DW-MST-05, REQ-DW-BLM-01, REQ-DW-BLM-02, REQ-DW-ASM-03, REQ-DW-ASM-04

---

### AltitudeFloorRecord
**Description:** A permanent record of the highest Bloom's altitude ever demonstrated for a concept node. Enforces the monotonic-increase invariant — altitude can never fall below this value, regardless of subsequent wrong answers or confidence drops. Written on each altitude advancement; never deleted.
**Lives in:** Personal Twin
**Key fields:**
- `conceptId: string` — the concept this floor applies to
- `altitudeFloor: number` — the highest altitude ever demonstrated; increases on advancement; never decreases
- `setAt: ISO8601` — when this floor was established or last raised
- `source: "assessment" | "engagement" | "transfer"` — what interaction established this floor

**Referenced by:** REQ-DW-MST-03, REQ-DW-MST-05, REQ-DW-ASM-04

---

### GapCluster
**Description:** A named cluster of concept nodes that Surveyor identifies as requiring attention. Gaps are typed by their root cause — coverage absence, knowledge staleness, bridging need, or convergent misconception risk. The primary input to path generation and the primary signal for Bridge requests.
**Lives in:** Personal Twin
**Key fields:**
- `clusterId: string` — stable identifier for this cluster within the session
- `label: string` — human-readable description (e.g. "IAM policy evaluation")
- `gapType: "knowledge" | "drift" | "bridge" | "convergent-misconception"` — root cause classification; convergent-misconception is highest priority
- `conceptIds: string[]` — the concept nodes belonging to this cluster
- `priority: "high" | "medium" | "low"` — surfacing priority for Donna and path ordering
- `examWeight: number` — 0.0–1.0 aggregate exam weight of concepts in this cluster
- `assessedAt: ISO8601` — when Surveyor last evaluated this cluster

**Referenced by:** UC-05, UC-06, UC-09, UC-15; REQ-DW-GAP-01, REQ-DW-GAP-02, REQ-DW-GAP-03

---

### PlateauSignal
**Description:** Evidence that a learner is stuck on a concept — visiting repeatedly without meaningful confidence gain. The trigger for a bridge request. Produced by Surveyor per PlateauDetectionPolicy; all thresholds are externalized in configuration.
**Lives in:** Personal Twin
**Key fields:**
- `conceptId: string` — the concept where the plateau is detected
- `visitCount: number` — number of visits observed; default threshold is 3
- `confidenceDelta: number` — change in confidence across the visit window; plateau threshold is < 0.05
- `durationMs: number` — total time spent at or below confidence ceiling; default minimum is 15 minutes (900000ms)
- `triggeredBridgeRequest: boolean` — whether this signal has already generated a bridge request

**Referenced by:** UC-06; REQ-DW-GAP-04

---

### MentalModel
**Description:** One of the learner's deep, well-formed mental models — the conceptual structures they carry from prior experience. Antiquarian maintains these as part of the learner's cognitive profile. Bridge selects from them when personalizing bridge cards; models with higher strength scores and embodied/operational origin are preferred over academic knowledge.
**Lives in:** Personal Twin
**Key fields:**
- `label: string` — name of the mental model (e.g. "Peach Bottom EOP hierarchy")
- `domain: string` — the experience domain from which this model was built (e.g. "nuclear-power", "software-engineering", "mechanical-engineering")
- `structure: string` — a description of the model's conceptual structure
- `strength: number` — 0.0–1.0 depth and reliability of this mental model; higher strength means stronger anchor for personalization

**Referenced by:** UC-06, UC-15; REQ-DW-BRG-02

---

### AntiquarianSnapshot
**Description:** A point-in-time snapshot of the learner's full cognitive profile as maintained by Antiquarian. Placed on the Blackboard as a ContextNode so Bridge can personalize without calling Antiquarian directly. Includes mental models, active contexts, and prior domains — the full picture of who the learner is.
**Lives in:** Personal Twin (Blackboard ContextNode)
**Key fields:**
- `mentalModels: MentalModel[]` — the learner's catalogue of deep conceptual structures
- `activeContexts: string[]` — current domains or projects the learner is actively engaged in
- `sourceDomains: string[]` — all prior domains where mastery has been evidenced or validated
- `updatedAt: ISO8601` — when this snapshot was last refreshed

**Referenced by:** UC-06; REQ-DW-BRG-02, REQ-DW-BRG-03

---

### BridgeCard
**Description:** A personalized connection card that links a stuck concept to something the learner already understands. Two forms: generic (from the Domain Twin) and personalized (produced by Bridge using AntiquarianSnapshot). The personalized form is what Donna surfaces.
**Lives in:** Both (generic version in Domain Twin; personalized version in Personal Twin)
**Key fields (generic — from Domain Twin):**
- `bridgeId: string` — stable identifier
- `bridgeType: string` — the pedagogical connection pattern (e.g. "hierarchy-to-hierarchy", "constraint-to-constraint")
- `sourceAnchor: string` — generic source domain concept the bridge anchors from
- `effectivenessScore: number` — Domain Twin's accumulated effectiveness rating for this bridge

**Key fields added for personalized version:**
- `personalizedText: string` — the card body rewritten using the learner's specific mental model
- `anchorReference: string` — the specific learner mental model used (e.g. "Peach Bottom EOP hierarchy")
- `origin: "domain-twin-generic" | "personal-twin-synthesized"` — whether this card came from the Domain Twin's library or was synthesized entirely by the Personal Twin

**Referenced by:** UC-06, UC-15; REQ-DW-BRG-01, REQ-DW-BRG-02, REQ-DW-BRG-04, REQ-DW-BRG-05

---

### AssessmentItem
**Description:** A single assessment question calibrated to a specific Bloom's altitude and concept set. Sourced exclusively from the Domain Twin's Tester bank. The Personal Twin never generates assessment items independently.
**Lives in:** Domain Twin (item bank); Personal Twin (held transiently during assessment)
**Key fields:**
- `itemId: string` — stable Domain Twin-scoped identifier
- `question: string` — the question text
- `bloomsLevel: 1 | 2 | 3 | 4 | 5 | 6` — the Bloom's altitude this item targets
- `conceptIds: string[]` — the concept nodes this item assesses
- `distractors: string[]` — incorrect answer choices
- `correctAnswer: string` — the correct answer

**Referenced by:** UC-07; REQ-DW-ASM-01, REQ-DW-ASM-02

---

### AssessmentOutcome
**Description:** The result of the learner's response to a single assessment item, including correctness and confidence signal. Drives Calibrator updates and feeds back to the Domain Twin as item-level calibration data.
**Lives in:** Personal Twin (fed to Calibrator); also fired to Domain Twin as part of OutcomeSignal
**Key fields:**
- `itemId: string` — the item that was answered
- `correct: boolean` — whether the answer was correct
- `confidence: "certain" | "hesitant" | "guessed"` — the learner's self-signaled confidence level
- `bloomsLevelDemonstrated: number` — the Bloom's level demonstrated by this response
- `responseTimeMs: number` — time taken to respond

**Referenced by:** UC-07; REQ-DW-ASM-03, REQ-DW-ASM-04

---

### OutcomeSignal
**Description:** A lean, privacy-safe report of a learning interaction, fired to the Domain Twin after every engagement. Contains domain-level facts about what happened — not personal data. The mechanism by which Domain Twins learn which content and bridges work. The Personal Twin reports; the Domain Twin learns.
**Lives in:** Both (produced by Personal Twin, consumed and stored by Domain Twin)
**Key fields:**
- `conceptId: string` — which concept node this interaction involved
- `interactionType: "learning-node" | "bridge-card" | "assessment-item" | "methodology"` — what kind of interaction occurred
- `bridgeId: string | null` — which bridge card, if interaction was a bridge engagement
- `itemId: string | null` — which assessment item, if interaction was an assessment
- `sourceDomains: string[]` — prior domains the learner held; domain-level context only — no personal identifiers
- `outcome: "engaged" | "thanked" | "later" | "dismissed" | "correct" | "incorrect"` — what the learner did
- `bloomsAltitudeAtInteraction: number` — the altitude level this interaction was pitched at
- `occurredAt: ISO8601` — timestamp

**Referenced by:** UC-05, UC-06, UC-07; REQ-DW-OUT-01, REQ-DW-OUT-02, REQ-DW-OUT-03

---

### AttentionItem
**Description:** An item held by Donna pending the right moment to surface to the learner. Donna holds bridge cards, gap items, learning nodes, and post-cert gap notices. Items are held, prioritized, and surfaced based on learner mode and session context.
**Lives in:** Personal Twin
**Key fields:**
- `itemType: "bridge-card" | "gap-item" | "brief" | "learning-node"` — the kind of item being held
- `content: object` — the surfaceable payload (varies by itemType)
- `priority: "high" | "medium" | "low"` — surfacing urgency; convergent-misconception gaps are high; post-cert gaps are low
- `heldSince: ISO8601` — when Donna received this item
- `source: "bridge" | "surveyor" | "gatekeeper" | "antiquarian"` — which system produced this item

**Referenced by:** UC-05, UC-06, UC-14; REQ-DW-ATT-01, REQ-DW-ATT-02, REQ-DW-ATT-03

---

### CertificationRecord
**Description:** A validated record of a certification the learner has achieved. Created from learner-reported completion. Triggers staleness watch activation, mastery-map completion, and post-cert gap analysis.
**Lives in:** Personal Twin
**Key fields:**
- `domain: string` — the knowledge domain the certification covers
- `certName: string` — the full certification name (e.g. "AWS Certified Solutions Architect – Associate")
- `achievedAt: ISO8601` — when the learner reports passing the exam
- `validatedExternally: boolean` — whether the system has cross-referenced with an external credential authority (v1: always learner-reported)

**Referenced by:** UC-08; REQ-DW-LGM-03, REQ-DW-CUR-04

---

### DomainUpdate
**Description:** A pre-curated change delta delivered by the Domain Twin when its knowledge graph changes. Contains all affected concepts with their change types and severity — sufficient for the Personal Twin to update its mastery map, flag staleness, and revise the learning path.
**Lives in:** Both (curated by Domain Twin; applied and stored by Personal Twin)
**Key fields:**
- `twinId: string` — the Domain Twin that produced this update
- `domain: string` — the knowledge domain
- `fromVersion: string` — the version the delta is relative to
- `toVersion: string` — the new version
- `affectedConcepts: array` — list of changed concepts, each with:
  - `conceptId: string`
  - `changeType: "deprecated" | "modified" | "reweighted" | "added"` — the nature of the change
  - `severity: "minor" | "major"` — how significantly the change affects the learner's mastery
  - `changeNote: string` — human-readable description of what changed
- `deliveredAt: ISO8601` — when this delta was received

**Referenced by:** UC-10; REQ-DW-CUR-01, REQ-DW-CUR-02

---

### LearnerProfile
**Description:** A summary of who the learner is from the perspective of prior knowledge and active learning intent. Sent with knowledge graph requests to enable partial credit computation and domain floor/ceiling setting. Does not carry personal identifiers — only domain-level mastery signals.
**Lives in:** Personal Twin
**Key fields:**
- `sourceDomains: array` — prior domains with mastery evidence, each with:
  - `domain: string`
  - `masteryLevel: number` — 0.0–1.0 overall mastery level
  - `validated: boolean` — whether mastery is externally validated (cert) or evidence-based
- `activeIntents: string[]` — domain identifiers for active learning intents
- `learningPreferences: array` — explicit learner preferences affecting path ordering or methodology, each with:
  - `preferenceType: "path-order" | "methodology" | "batch-start"`
  - `value: string`

**Referenced by:** UC-03, UC-09; REQ-DW-KGM-04, REQ-DW-MST-01, REQ-DW-MST-02

---

## Summary Table

| Type | Lives In | Primary Use Cases |
|---|---|---|
| LearningIntent | Personal Twin | UC-01, UC-08, UC-13 |
| DomainTwinConnection | Personal Twin | UC-02, UC-12 |
| DiscoveryResponse | Personal Twin (transient) | UC-02, UC-12 |
| ConceptNode | Domain Twin (canonical) / Personal Twin (cached) | UC-03, UC-04, UC-05, UC-07 |
| CrossDomainEquivalence | Domain Twin (canonical) / Personal Twin (used at init) | UC-03, UC-09, UC-15 |
| PrerequisiteEdge | Domain Twin (canonical) / Personal Twin (cached) | UC-03, UC-04 |
| CuratedBatch | Domain Twin (canonical) / Personal Twin (respected in path) | UC-03, UC-04 |
| MisconceptionEntry | Domain Twin (canonical) / Personal Twin (used in gap classification) | UC-03, UC-15 |
| MasteryNode | Personal Twin | UC-03, UC-04, UC-05, UC-07 |
| AltitudeFloorRecord | Personal Twin | UC-05, UC-07 |
| GapCluster | Personal Twin | UC-05, UC-06, UC-09, UC-15 |
| PlateauSignal | Personal Twin | UC-06 |
| MentalModel | Personal Twin | UC-06, UC-15 |
| AntiquarianSnapshot | Personal Twin (Blackboard ContextNode) | UC-06 |
| BridgeCard | Both (generic: Domain Twin; personalized: Personal Twin) | UC-06, UC-15 |
| AssessmentItem | Domain Twin (bank) / Personal Twin (transient) | UC-07 |
| AssessmentOutcome | Personal Twin | UC-07 |
| OutcomeSignal | Both (produced by Personal Twin; consumed by Domain Twin) | UC-05, UC-06, UC-07 |
| AttentionItem | Personal Twin | UC-05, UC-06, UC-14 |
| CertificationRecord | Personal Twin | UC-08 |
| DomainUpdate | Both (curated by Domain Twin; applied by Personal Twin) | UC-10 |
| LearnerProfile | Personal Twin | UC-03, UC-09 |
