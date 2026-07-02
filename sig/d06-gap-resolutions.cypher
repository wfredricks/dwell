// ============================================================
// D-06 GAP RESOLUTIONS — SIG Pre-Game Blueprint
// ============================================================
//
// Codifies the 5 Test Spec gaps resolved in design session
// 2026-07-01:
//
//   G1  — No NATS injection needed; agents use BB abstraction
//   G3  — Discovery scoring: algorithmic DiscoveryEvaluationPolicy
//   G7  — PlateauDetectionPolicy: externalized config defaults
//   G8  — AntiquarianSnapshot: BB ContextNode pattern
//   G11 — Altitude never regresses; confidence does
//
// G6 (partial credit formula) remains open — altitude transfer
// rule pending sign-off.
//
// Traceable to: DWELL-EVENT-ARCHITECTURE.md + DWELL-TEST-SPEC.md
// + Twin Architecture Reference (knowledge/twin/TWIN-ARCHITECTURE-REFERENCE.md)
//
// ============================================================

// ──────────────────────────────────────────────────────────────
// G1 RESOLUTION — No NATS injection; agents use BB abstraction
// ──────────────────────────────────────────────────────────────

// Trace: TWIN-ARCHITECTURE-REFERENCE.md — Plug Architecture
// "No subsystem calls another directly. Events are the interface."
// Internal agents (Antiquarian, Calibrator, etc.) are NOT BBTools.
// They are internal pipeline components that communicate through
// the Blackboard abstraction (F-2). F-5 handles NATS underneath.
// Individual agents never touch NATS directly.

CREATE (invG1:TGTInvariant {
  name: 'InternalAgentsUseBBNotNATS',
  rule: 'Dwell internal agents (Antiquarian, Calibrator, Surveyor, Gatekeeper, Bridge, Answer Agent, Cultivator, Donna) communicate exclusively through the F-2 Blackboard abstraction. No agent holds a direct NATS client. F-5 Event Fabric handles NATS transport underneath the BB. Only the Zipper straddles the BB/NATS boundary.',
  scope: 'architecture',
  resolvesGap: 'G1'
})

CREATE (invG1b:TGTInvariant {
  name: 'DomainTwinsRegisterAsBBTools',
  rule: 'Domain Twins connect to the Personal Twin via I-7 MCP External Tools, registering as BBTools in the BBToolRegistry. They participate in the Probe stage like any other registered tool. No special NATS channel is needed — the BBTool handle() contract is the interface.',
  scope: 'architecture',
  resolvesGap: 'G1'
})

// ──────────────────────────────────────────────────────────────
// G3 RESOLUTION — DiscoveryEvaluationPolicy (algorithmic)
// ──────────────────────────────────────────────────────────────

// Trace: I-10 Algo philosophy — "the local reflex that demotes
// Tier 2 (LLM) to Tier 0 (cached) over time."
// Discovery scoring is a pure function of known metadata fields.
// No LLM needed. Algorithmic = Tier 0 from day one.
// Over time, I-10 Algo observes which selections produce good
// learning outcomes and can propose refined weights as a
// CodifiedAlgorithm.

CREATE (tDiscoveryPolicy:TGTType {
  name: 'DiscoveryEvaluationPolicy',
  kind: 'interface',
  style: 'pure',
  description: 'Externalized config governing how the Answer Agent scores competing Domain Twin discovery responses. Algorithmic weighted sum — no LLM. Weights adjustable without code changes. I-10 Algo may propose refined weights as a CodifiedAlgorithm based on outcome signal patterns.',
  tier: 'T0',
  resolvesGap: 'G3'
})
CREATE (tDiscoveryPolicy)-[:HAS_FIELD]->(:TGTField {
  name: 'coverageWeight',
  type: 'number',
  required: true,
  description: 'Weight for domain coverage score (0.0–1.0). Default: 0.30'
})
CREATE (tDiscoveryPolicy)-[:HAS_FIELD]->(:TGTField {
  name: 'qualityWeight',
  type: 'number',
  required: true,
  description: 'Weight for Domain Twin quality score from outcome signals. Default: 0.30'
})
CREATE (tDiscoveryPolicy)-[:HAS_FIELD]->(:TGTField {
  name: 'crossDomainMatchWeight',
  type: 'number',
  required: true,
  description: 'Weight for crossDomainSupport match against learner source domains. Default: 0.25'
})
CREATE (tDiscoveryPolicy)-[:HAS_FIELD]->(:TGTField {
  name: 'specificityWeight',
  type: 'number',
  required: true,
  description: 'Weight for specificity — cert-specific twin preferred over generic. Default: 0.15'
})

CREATE (tDiscoveryDefaults:TGTType {
  name: 'DEFAULT_DISCOVERY_EVALUATION_POLICY',
  kind: 'class',
  style: 'value-object',
  description: 'Default DiscoveryEvaluationPolicy values. Lives in F-7 Profile config — override per-twin without code change.',
  defaults: 'coverageWeight=0.30, qualityWeight=0.30, crossDomainMatchWeight=0.25, specificityWeight=0.15'
})

CREATE (tDiscoveryScoringFormula:TGTType {
  name: 'DiscoveryScoringFormula',
  kind: 'class',
  style: 'pure',
  description: 'Pure function: score = (coverage × coverageWeight) + (qualityScore × qualityWeight) + (crossDomainMatch × crossDomainMatchWeight) + (specificity × specificityWeight). All inputs are metadata fields known at evaluation time. Tier 0 — no LLM call.',
  formula: 'score = sum(fieldValue × weight) for each weighted dimension'
})

CREATE (invG3:TGTInvariant {
  name: 'DiscoveryScoringIsAlgorithmic',
  rule: 'Answer Agent discovery scoring must be computed as a deterministic weighted sum using DiscoveryEvaluationPolicy weights. No LLM call. All inputs are known metadata fields on the DwellDiscoveryResponse payload. Consistent with I-10 Algo philosophy of demoting LLM to Tier 0 wherever possible.',
  scope: 'answer-agent',
  resolvesGap: 'G3'
})

// ──────────────────────────────────────────────────────────────
// G7 RESOLUTION — PlateauDetectionPolicy (externalized)
// ──────────────────────────────────────────────────────────────

// Trace: DWELL-TEST-SPEC.md — Suite 4, T4.1
// "Plateau detection threshold is not specified."
// Resolution: externalized as a config type in F-7 Profile.
// Defaults reflect story evidence (4 visits, 18 minutes, confidence 0.61).
// I-10 Algo may refine thresholds over time based on outcome signals.

CREATE (tPlateauPolicy:TGTType {
  name: 'PlateauDetectionPolicy',
  kind: 'interface',
  style: 'pure',
  description: 'Externalized config governing when Surveyor fires a bb.bridge.requested event. All thresholds adjustable via F-7 Profile config — no code change needed. I-10 Algo may propose refined thresholds as a CodifiedAlgorithm.',
  resolvesGap: 'G7'
})
CREATE (tPlateauPolicy)-[:HAS_FIELD]->(:TGTField {
  name: 'minimumVisits',
  type: 'number',
  required: true,
  description: 'Minimum number of visits to the concept cluster before plateau can be declared. Default: 3'
})
CREATE (tPlateauPolicy)-[:HAS_FIELD]->(:TGTField {
  name: 'confidenceDeltaThreshold',
  type: 'number',
  required: true,
  description: 'Maximum confidence movement between visits that still qualifies as a plateau. If delta < this value across all recent visits, plateau is declared. Default: 0.05'
})
CREATE (tPlateauPolicy)-[:HAS_FIELD]->(:TGTField {
  name: 'minimumDurationMs',
  type: 'number',
  required: true,
  description: 'Plateau must persist for at least this duration. Default: 900000 (15 minutes)'
})
CREATE (tPlateauPolicy)-[:HAS_FIELD]->(:TGTField {
  name: 'maxConfidenceToTrigger',
  type: 'number',
  required: true,
  description: 'Plateau bridge request only fires if node confidence is below this ceiling. No point bridging a near-mastered node. Default: 0.80'
})

CREATE (tPlateauDefaults:TGTType {
  name: 'DEFAULT_PLATEAU_DETECTION_POLICY',
  kind: 'class',
  style: 'value-object',
  description: 'Default PlateauDetectionPolicy values. Lives in F-7 Profile config.',
  defaults: 'minimumVisits=3, confidenceDeltaThreshold=0.05, minimumDurationMs=900000, maxConfidenceToTrigger=0.80'
})

// ──────────────────────────────────────────────────────────────
// G8 RESOLUTION — AntiquarianSnapshot as BB ContextNode
// ──────────────────────────────────────────────────────────────

// Trace: DWELL-TEST-SPEC.md — Suite 4, T4.3
// "How does Bridge access Antiquarian's mental model inventory?"
// Resolution: Antiquarian writes an AntiquarianSnapshot ContextNode
// to the Blackboard on relevant triggers. Bridge reads the latest
// snapshot from the BB during synthesis. Follows existing BBTool
// ContextNode pattern — no direct agent-to-agent coupling.

CREATE (tMentalModel:TGTType {
  name: 'MentalModel',
  kind: 'class',
  style: 'value-object',
  description: 'A deep mental model Bill thinks with. Not just something he knows — something he has used operationally as a cognitive scaffold.',
  resolvesGap: 'G8'
})
CREATE (tMentalModel)-[:HAS_FIELD]->(:TGTField {name: 'id',           type: 'string',   required: true,  description: 'Unique identifier'})
CREATE (tMentalModel)-[:HAS_FIELD]->(:TGTField {name: 'label',        type: 'string',   required: true,  description: 'Human-readable name e.g. "Peach Bottom EOP hierarchy"'})
CREATE (tMentalModel)-[:HAS_FIELD]->(:TGTField {name: 'domain',       type: 'string',   required: true,  description: 'Origin domain e.g. "nuclear-power", "software-architecture", "mechanical-engineering"'})
CREATE (tMentalModel)-[:HAS_FIELD]->(:TGTField {name: 'structure',    type: 'string',   required: true,  description: 'Structural pattern this model embodies e.g. "hierarchy", "containment-zones", "layer-stack"'})
CREATE (tMentalModel)-[:HAS_FIELD]->(:TGTField {name: 'strength',     type: 'number',   required: true,  description: '0.0–1.0. Academic knowledge = lower; operational/embodied experience = higher. Peach Bottom EOP = 0.95'})
CREATE (tMentalModel)-[:HAS_FIELD]->(:TGTField {name: 'evidenceSrc',  type: 'string[]', required: false, description: 'Source references from Antiquarian evidence'})

CREATE (tAntiquarianSnapshot:TGTType {
  name: 'AntiquarianSnapshot',
  kind: 'class',
  style: 'value-object',
  description: 'BB ContextNode written by Antiquarian on trigger events (cert achieved, evidence ingested, periodic refresh). Bridge reads the latest snapshot to personalise bridge cards without coupling directly to Antiquarian. Follows BBTool ContextNode pattern.',
  resolvesGap: 'G8'
})
CREATE (tAntiquarianSnapshot)-[:HAS_FIELD]->(:TGTField {name: 'mentalModels',    type: 'MentalModel[]', required: true,  description: "Bill's deep mental models, ordered by strength descending"})
CREATE (tAntiquarianSnapshot)-[:HAS_FIELD]->(:TGTField {name: 'activeContexts',  type: 'string[]',      required: true,  description: 'Domains Bill is currently working in (recent activity)'})
CREATE (tAntiquarianSnapshot)-[:HAS_FIELD]->(:TGTField {name: 'sourceDomains',   type: 'string[]',      required: true,  description: 'Prior certified/validated domains'})
CREATE (tAntiquarianSnapshot)-[:HAS_FIELD]->(:TGTField {name: 'updatedAt',       type: 'ISO8601',       required: true,  description: 'When this snapshot was posted'})

// Trigger events that cause Antiquarian to post a fresh snapshot
CREATE (tSnapshotTrigger:TGTType {
  name: 'AntiquarianSnapshotTrigger',
  kind: 'enum',
  style: 'pure',
  values: 'cert.achieved | evidence.ingested | periodic.refresh | session.start',
  description: 'Events that cause Antiquarian to post a fresh AntiquarianSnapshot ContextNode to the BB.'
})

CREATE (invG8:TGTInvariant {
  name: 'BridgeReadsSnapshotNotAntiquarian',
  rule: 'Bridge must read learner mental model data from the AntiquarianSnapshot ContextNode on the BB. Bridge must not call Antiquarian directly. This maintains agent isolation and follows the BBTool ContextNode pattern from F-2 Blackboard.',
  scope: 'bridge-agent',
  resolvesGap: 'G8'
})

// ──────────────────────────────────────────────────────────────
// G11 RESOLUTION — Altitude never regresses; confidence does
// ──────────────────────────────────────────────────────────────

// Trace: DWELL-TEST-SPEC.md — Suite 8, T8.3
// "Can demonstrated altitude regress on a wrong answer?"
// Resolution: No. bloomsCurrentAltitude only increases.
// Confidence moves both directions. A wrong answer at Apply (3)
// decreases confidence but altitude stays at 3.
// The system may serve more Apply-level content before advancing,
// but never drops back to Understand content.

CREATE (invG11a:TGTInvariant {
  name: 'AltitudeNeverRegresses',
  rule: 'bloomsCurrentAltitude for any concept node can only increase, never decrease. Once a learner has demonstrated competence at altitude N, that altitude is locked as the floor. A wrong answer, poor performance, or time gap may decrease confidence but cannot reduce bloomsCurrentAltitude.',
  scope: 'calibrator',
  resolvesGap: 'G11'
})

CREATE (invG11b:TGTInvariant {
  name: 'ConfidenceIsTheBidirectionalSignal',
  rule: 'Calibrator.confidence moves in both directions based on assessment outcomes and engagement signals. When confidence drops below a domain-configured threshold after altitude N was demonstrated, the system serves more content at altitude N before attempting N+1 — but never serves content below altitude N.',
  scope: 'calibrator',
  resolvesGap: 'G11'
})

CREATE (tAltitudeFloor:TGTType {
  name: 'AltitudeFloorRule',
  kind: 'class',
  style: 'value-object',
  description: 'Enforces the altitude floor: content served to a learner is always at or above their demonstrated bloomsCurrentAltitude. If confidence at current altitude is low, content stays at that altitude until confidence recovers — it does not drop to a lower altitude.',
  invariants: 'contentAltitude >= bloomsCurrentAltitude always'
})
CREATE (tAltitudeFloor)-[:HAS_FIELD]->(:TGTField {name: 'conceptId',              type: 'string', required: true, description: 'Concept node this floor applies to'})
CREATE (tAltitudeFloor)-[:HAS_FIELD]->(:TGTField {name: 'bloomsCurrentAltitude',  type: 'number', required: true, description: 'Highest altitude demonstrated for this concept. Floor. Monotonically increasing.'})
CREATE (tAltitudeFloor)-[:HAS_FIELD]->(:TGTField {name: 'confidence',             type: 'number', required: true, description: 'Current confidence at bloomsCurrentAltitude. Bidirectional. May decrease on wrong answers.'})
CREATE (tAltitudeFloor)-[:HAS_FIELD]->(:TGTField {name: 'confidenceToAdvance',    type: 'number', required: true, description: 'Confidence threshold required before Gatekeeper will route to altitude+1 content. Default: 0.85'})

;

// ──────────────────────────────────────────────────────────────
// G6 RESOLUTION — Partial Credit Formula
// ──────────────────────────────────────────────────────────────

// Trace: DWELL-TEST-SPEC.md — Suite 3, T3.3
// "Partial credit calculation formula not specified."
// Resolution (confirmed 2026-07-01):
//   Confidence: initialConfidence = priorConfidence × similarityScore
//   Altitude: threshold-based
//     similarity >= 0.80 → altitude transfers in full
//     0.60 <= similarity < 0.80 → altitude at (priorAltitude - 1), min 1
//     similarity < 0.60 → no transfer; cold start at 1

CREATE (tPartialCreditFormula:TGTType {
  name: 'PartialCreditFormula',
  kind: 'class',
  style: 'pure',
  description: 'Computes initial mastery for a target domain concept from a learner s prior mastery of an equivalent concept in another domain. Applied by Calibrator when the Domain Twin delivers cross-domain equivalence edges.',
  resolvesGap: 'G6'
})
CREATE (tPartialCreditFormula)-[:HAS_FIELD]->(:TGTField {name: 'confidenceFormula',    type: 'string', required: true, description: 'initialConfidence = priorConfidence x similarityScore. Always applied.'})
CREATE (tPartialCreditFormula)-[:HAS_FIELD]->(:TGTField {name: 'altitudeHighThreshold', type: 'number', required: true, description: 'similarity >= this: altitude transfers in full. Default: 0.80'})
CREATE (tPartialCreditFormula)-[:HAS_FIELD]->(:TGTField {name: 'altitudeLowThreshold',  type: 'number', required: true, description: 'similarity >= this (and < high): altitude at priorAltitude-1, min 1. Default: 0.60'})
CREATE (tPartialCreditFormula)-[:HAS_FIELD]->(:TGTField {name: 'coldBelowThreshold',    type: 'string', required: true, description: 'similarity < altitudeLowThreshold: cold start, altitude=0. Default: below 0.60'})

CREATE (:TGTType {
  name: 'DEFAULT_PARTIAL_CREDIT_FORMULA',
  kind: 'class',
  style: 'value-object',
  description: 'Default PartialCreditFormula. Lives in F-7 Profile config.',
  defaults: 'altitudeHighThreshold=0.80, altitudeLowThreshold=0.60'
})

CREATE (:TGTInvariant {
  name: 'PartialCreditIsThresholdBased',
  rule: 'Altitude transfer: >= 0.80 full; 0.60-0.79 altitude-1 (min 1); < 0.60 cold. Confidence always transfers as priorConfidence x similarityScore. Both are pure functions — no LLM.',
  scope: 'calibrator',
  resolvesGap: 'G6'
})
