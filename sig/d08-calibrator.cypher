// ============================================================
// D-08 CALIBRATOR — SIG Pre-Game Blueprint
// ============================================================
//
// The mastery tracker. Initializes per-concept mastery maps from
// Antiquarian baselines and cross-domain partial credit, then
// updates them on every assessment and engagement outcome.
// Holds the MasteryMap in memory; posts bb.mastery.* events on change.
//
// Traces to:
//   DWELL-FEATURES.md  — F-2.2 (Track Mastery Per Concept)
//                        F-2.3 (Warm/Cold & Partial Credit)
//                        F-6.1 (Detect Plateaus — plateau check logic)
//   DWELL-REQUIREMENTS.md — REQ-DW-MST-01 through MST-08
//   d01-agents.cypher  — TGTModule {name: 'calibrator'}
//   d06-gap-resolutions.cypher — G6 (PartialCreditFormula)
//                                G11 (AltitudeNeverRegresses, ConfidenceIsTheBidirectionalSignal)
//
// ============================================================

MERGE (mod:TGTModule {name: 'calibrator'})
SET mod.path = 'src/personal-twin/calibrator',
    mod.capability = 'mastery-tracking',
    mod.tier = 'PersonalTwin'

// ──────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────

// MasteryNode — per-concept mastery record.
// bloomsCurrentAltitude is monotonically increasing (AltitudeNeverRegresses).
// confidence is bidirectional (ConfidenceIsTheBidirectionalSignal).
// NOTE: partially referenced in d06 via AltitudeFloorRule fields.
// This is the canonical full definition.
// Trace: REQ-DW-MST-02, MST-03, MST-04, MST-05, MST-06

CREATE (tMasteryNode:TGTType {
  name: 'MasteryNode',
  kind: 'class',
  style: 'value-object',
  description: 'Per-concept mastery record. bloomsCurrentAltitude is the highest altitude demonstrated — monotonically increasing, enforced by AltitudeNeverRegresses invariant. confidence is the bidirectional depth signal at the current altitude. altitudeGap is bloomsTargetAltitude − bloomsCurrentAltitude. source records the provenance of the initial mastery estimate.',
  invariants: 'AltitudeNeverRegresses (from d06), ConfidenceIsTheBidirectionalSignal (from d06)',
  satisfies: 'REQ-DW-MST-02, MST-03, MST-04, MST-05, MST-06'
})
CREATE (tMasteryNode)-[:HAS_FIELD]->(:TGTField {name: 'conceptId',             type: 'string',                                                              required: true,  description: 'Concept node ID from the domain knowledge graph'})
CREATE (tMasteryNode)-[:HAS_FIELD]->(:TGTField {name: 'bloomsCurrentAltitude', type: 'number',                                                              required: true,  description: 'Highest altitude demonstrated. Floor. Only increases. 0 = cold (no demonstrated altitude yet).'})
CREATE (tMasteryNode)-[:HAS_FIELD]->(:TGTField {name: 'bloomsTargetAltitude',  type: 'number',                                                              required: true,  description: 'Target altitude set by the Domain Twin. Ceiling. Immutable after load.'})
CREATE (tMasteryNode)-[:HAS_FIELD]->(:TGTField {name: 'altitudeGap',           type: 'number',                                                              required: true,  description: 'bloomsTargetAltitude − bloomsCurrentAltitude. Derived; always recomputed on update. ≥ 0.'})
CREATE (tMasteryNode)-[:HAS_FIELD]->(:TGTField {name: 'confidence',            type: 'number',                                                              required: true,  description: '0.0–1.0. Bidirectional depth signal at bloomsCurrentAltitude. Increases on positive outcomes; decreases on wrong answers, skips, dismissals.'})
CREATE (tMasteryNode)-[:HAS_FIELD]->(:TGTField {name: 'confidenceToAdvance',   type: 'number',                                                              required: true,  description: 'Threshold confidence must reach before Gatekeeper routes to altitude+1. Default 0.85. From F-7 Profile config.'})
CREATE (tMasteryNode)-[:HAS_FIELD]->(:TGTField {name: 'source',                type: "'prior-evidence'|'partial-credit'|'externally-validated'|'no-signal'", required: true,  description: 'Provenance of initial mastery estimate. prior-evidence = from Antiquarian; partial-credit = cross-domain transfer; externally-validated = cert upgrade; no-signal = cold start.'})

// MasteryMap — the full per-domain mastery state.
// Held in memory by Calibrator. Consumed by Surveyor and Gatekeeper via BB events.

CREATE (tMasteryMap:TGTType {
  name: 'MasteryMap',
  kind: 'class',
  style: 'value-object',
  description: 'Complete per-domain mastery state. nodes is one MasteryNode per concept in the domain knowledge graph. overallReadiness is a derived aggregate: mean(confidence * (bloomsCurrentAltitude / bloomsTargetAltitude)) across all nodes. Produced by initializeMastery(); mutated by update().',
  satisfies: 'REQ-DW-MST-02, REQ-DW-LGM-02'
})
CREATE (tMasteryMap)-[:HAS_FIELD]->(:TGTField {name: 'domain',           type: 'string',         required: true,  description: 'The domain this map covers'})
CREATE (tMasteryMap)-[:HAS_FIELD]->(:TGTField {name: 'nodes',            type: 'MasteryNode[]',  required: true,  description: 'One entry per concept in the domain graph'})
CREATE (tMasteryMap)-[:HAS_FIELD]->(:TGTField {name: 'overallReadiness', type: 'number',         required: true,  description: '0.0–1.0. Aggregate readiness. Reported in orientation summary. Trace: F-1.1 leaf "orientation must name starting readiness percentage".'})
CREATE (tMasteryMap)-[:HAS_FIELD]->(:TGTField {name: 'initializedAt',    type: 'ISO8601',        required: true,  description: 'When initializeMastery() completed'})

// PartialCreditResult — output of applyPartialCredit() for one concept.
// Trace: F-2.3, REQ-DW-MST-02, MST-06, MST-08, G6 resolution

CREATE (tPartialCreditResult:TGTType {
  name: 'PartialCreditResult',
  kind: 'interface',
  style: 'value-object',
  description: 'Result of applying PartialCreditFormula (d06) to one cross-domain equivalence. confidence = priorConfidence × similarityScore. bloomsCurrentAltitude depends on similarity threshold (≥0.80 full, 0.60–0.79 minus-1, <0.60 cold). basis records which branch was taken.',
  satisfies: 'REQ-DW-MST-02, MST-06, MST-08, F-2.3'
})
CREATE (tPartialCreditResult)-[:HAS_FIELD]->(:TGTField {name: 'conceptId',             type: 'string',                                       required: true,  description: 'Target domain concept ID'})
CREATE (tPartialCreditResult)-[:HAS_FIELD]->(:TGTField {name: 'confidence',            type: 'number',                                       required: true,  description: 'priorConfidence × similarityScore'})
CREATE (tPartialCreditResult)-[:HAS_FIELD]->(:TGTField {name: 'bloomsCurrentAltitude', type: 'number',                                       required: true,  description: 'Transferred altitude per threshold rules. 0 if cold.'})
CREATE (tPartialCreditResult)-[:HAS_FIELD]->(:TGTField {name: 'basis',                 type: "'full-transfer'|'partial-transfer'|'cold'",    required: true,  description: 'Which PartialCreditFormula branch applied. full = similarity≥0.80; partial = 0.60–0.79; cold = below 0.60.'})

// ──────────────────────────────────────────────────────────────
// FILES
// ──────────────────────────────────────────────────────────────

// === types.ts ===

CREATE (fTypes:TGTFile {
  name: 'types.ts',
  path: 'src/personal-twin/calibrator/types.ts',
  description: 'All Calibrator types: MasteryMap, MasteryNode, PartialCreditResult.',
  exports: 'MasteryMap, MasteryNode, PartialCreditResult'
})
CREATE (fTypes)-[:CONTAINS]->(tMasteryMap)
CREATE (fTypes)-[:CONTAINS]->(tMasteryNode)
CREATE (fTypes)-[:CONTAINS]->(tPartialCreditResult)

// === partial-credit.ts — Pure partial credit computation ===

CREATE (fPartialCredit:TGTFile {
  name: 'partial-credit.ts',
  path: 'src/personal-twin/calibrator/partial-credit.ts',
  description: 'Pure functions implementing the PartialCreditFormula (d06 G6). No state, no BB. All altitude threshold logic for cross-domain transfer lives here.',
  exports: 'applyPartialCredit, resolveMultiplePriorDomains'
})

CREATE (fnApplyPartialCredit:TGTFunction {
  name: 'applyPartialCredit',
  style: 'pure',
  signature: '(equivalence: CrossDomainEquivalence, priorNode: MasteryNode): PartialCreditResult',
  description: 'Implements PartialCreditFormula from d06 G6. confidence = priorNode.confidence × equivalence.similarityScore. Altitude: similarity ≥ 0.80 → full transfer; 0.60–0.79 → priorAltitude-1 (min 1); <0.60 → cold (altitude=0). Returns PartialCreditResult with basis tag. Pure — deterministic Tier 0. Trace: REQ-DW-MST-02, F-2.3.',
  async: false
})
CREATE (fnApplyPartialCredit)-[:ACCEPTS]->(tMasteryNode)
CREATE (fnApplyPartialCredit)-[:RETURNS]->(tPartialCreditResult)

CREATE (fnResolveMultiplePriorDomains:TGTFunction {
  name: 'resolveMultiplePriorDomains',
  style: 'pure',
  signature: '(results: PartialCreditResult[]): PartialCreditResult',
  description: 'When two or more prior domains both provide a cross-domain equivalence to the same target concept, take the higher confidence AND higher bloomsCurrentAltitude across all results. Higher wins on both dimensions independently. Pure — no state. Trace: REQ-DW-MST-08, F-2.3 leaf "higher result takes precedence".',
  async: false
})
CREATE (fnResolveMultiplePriorDomains)-[:ACCEPTS]->(tPartialCreditResult)
CREATE (fnResolveMultiplePriorDomains)-[:RETURNS]->(tPartialCreditResult)

CREATE (fPartialCredit)-[:CONTAINS]->(fnApplyPartialCredit)
CREATE (fPartialCredit)-[:CONTAINS]->(fnResolveMultiplePriorDomains)

// === mastery-updater.ts — Pure mastery node mutation ===

CREATE (fMasteryUpdater:TGTFile {
  name: 'mastery-updater.ts',
  path: 'src/personal-twin/calibrator/mastery-updater.ts',
  description: 'Pure functions for updating a MasteryNode in response to assessment and engagement outcomes. All functions are immutable — they return a new MasteryNode, never mutate the input. AltitudeNeverRegresses and ConfidenceIsTheBidirectionalSignal enforced here.',
  exports: 'updateFromAssessment, updateFromEngagement, canAdvanceAltitude'
})

CREATE (fnUpdateFromAssessment:TGTFunction {
  name: 'updateFromAssessment',
  style: 'pure',
  signature: '(node: MasteryNode, outcome: AssessmentOutcome): MasteryNode',
  description: 'Returns a new MasteryNode reflecting an assessment result. Correct + confident → confidence increases; correct + hesitant → confidence increases moderately; incorrect → confidence decreases. bloomsCurrentAltitude only increases: if outcome demonstrates competence at current target AND canAdvanceAltitude(), altitude increments. Enforces AltitudeNeverRegresses — wrong answer never reduces altitude. Pure — returns new node, input is immutable. Trace: REQ-DW-MST-03, MST-04, MST-05, F-2.2, G11.',
  async: false
})
CREATE (fnUpdateFromAssessment)-[:ACCEPTS]->(tMasteryNode)
CREATE (fnUpdateFromAssessment)-[:RETURNS]->(tMasteryNode)

CREATE (fnUpdateFromEngagement:TGTFunction {
  name: 'updateFromEngagement',
  style: 'pure',
  signature: "(node: MasteryNode, response: 'engaged'|'thanked'|'later'|'dismissed'): MasteryNode",
  description: 'Returns a new MasteryNode reflecting a bridge/attention engagement outcome. engaged and thanked → small confidence increase (positive signal). later → no change. dismissed → small confidence decrease (negative engagement signal). Never changes altitude. Pure — returns new node. Trace: REQ-DW-MST-04, REQ-DW-ATT-03.',
  async: false
})
CREATE (fnUpdateFromEngagement)-[:ACCEPTS]->(tMasteryNode)
CREATE (fnUpdateFromEngagement)-[:RETURNS]->(tMasteryNode)

CREATE (fnCanAdvanceAltitude:TGTFunction {
  name: 'canAdvanceAltitude',
  style: 'pure',
  signature: '(node: MasteryNode): boolean',
  description: 'Returns true if node.confidence >= node.confidenceToAdvance AND node.bloomsCurrentAltitude < node.bloomsTargetAltitude. Gatekeeper calls this before routing to altitude+1 content. Pure predicate. Trace: REQ-DW-MST-05, F-7.2.',
  async: false
})
CREATE (fnCanAdvanceAltitude)-[:ACCEPTS]->(tMasteryNode)

CREATE (fMasteryUpdater)-[:CONTAINS]->(fnUpdateFromAssessment)
CREATE (fMasteryUpdater)-[:CONTAINS]->(fnUpdateFromEngagement)
CREATE (fMasteryUpdater)-[:CONTAINS]->(fnCanAdvanceAltitude)

// === plateau-detector.ts — Pure plateau check ===

CREATE (fPlateauDetector:TGTFile {
  name: 'plateau-detector.ts',
  path: 'src/personal-twin/calibrator/plateau-detector.ts',
  description: 'Pure function checking all four PlateauDetectionPolicy conditions (d06 G7). No state — caller provides visit history. Returns PlateauSignal if all four conditions met; null otherwise.',
  exports: 'detectPlateau'
})

CREATE (fnDetectPlateau:TGTFunction {
  name: 'detectPlateau',
  style: 'pure',
  signature: '(node: MasteryNode, visitHistory: VisitRecord[], policy: PlateauDetectionPolicy): PlateauSignal | null',
  description: 'Evaluates all four PlateauDetectionPolicy conditions: (1) visitHistory.length >= policy.minimumVisits; (2) confidence delta between visits < policy.confidenceDeltaThreshold; (3) elapsed duration >= policy.minimumDurationMs; (4) node.confidence < policy.maxConfidenceToTrigger. Returns PlateauSignal with conceptIds, visitCount, confidenceDelta, durationMs, calibratorConfidence if all four met; null otherwise. Deterministic Tier 0 — no inference. Trace: REQ-DW-GAP-04, F-6.1, G7.',
  async: false
})
CREATE (fnDetectPlateau)-[:ACCEPTS]->(tMasteryNode)

CREATE (fPlateauDetector)-[:CONTAINS]->(fnDetectPlateau)

// === calibrator.ts — Stateful orchestrator ===

CREATE (fCalibrator:TGTFile {
  name: 'calibrator.ts',
  path: 'src/personal-twin/calibrator/calibrator.ts',
  description: 'Stateful Calibrator class. Holds MasteryMap in memory. Reacts to bb.learner.<domain>.baseline, bb.assessment.outcome, bb.attention.outcome. Posts bb.mastery.updated on change. Entry point for the module.',
  exports: 'Calibrator'
})

CREATE (tCalibratorClass:TGTType {
  name: 'Calibrator',
  kind: 'class',
  style: 'stateful-class',
  description: 'Stateful mastery tracker. Holds one MasteryMap per active domain in memory. initializeMastery() seeds the map from Antiquarian baseline and partial credit. update() routes to the correct pure updater and posts bb.mastery.updated. All altitude/confidence invariants are enforced by the pure functions in mastery-updater.ts — the class just orchestrates.',
  invariants: 'AltitudeNeverRegresses (enforced in updateFromAssessment), ConfidenceIsTheBidirectionalSignal (enforced in updateFromAssessment and updateFromEngagement)'
})

CREATE (fnInitializeMastery:TGTFunction {
  name: 'initializeMastery',
  style: 'effect',
  signature: '(baseline: AntiquarianBaseline, graph: DomainKnowledgeGraph, formula: PartialCreditFormula): MasteryMap',
  description: 'Seeds a new MasteryMap for the domain. For each concept node in graph: (1) check if Antiquarian baseline has evidence → set from prior-evidence; (2) check for cross-domain equivalences → apply applyPartialCredit() and resolveMultiplePriorDomains(); (3) no signal → cold start (altitude=0, source=no-signal). Stores map in memory. Posts bb.mastery.<domain>.initialized. Trace: REQ-DW-MST-01, MST-02, REQ-DW-LGM-02.',
  async: false
})
CREATE (fnInitializeMastery)-[:ACCEPTS]->(tMasteryMap)
CREATE (fnInitializeMastery)-[:RETURNS]->(tMasteryMap)

CREATE (fnUpdate:TGTFunction {
  name: 'update',
  style: 'effect',
  signature: "(conceptId: string, outcome: AssessmentOutcome | AttentionOutcome): void",
  description: 'Routes an incoming outcome to the correct pure updater: AssessmentOutcome → updateFromAssessment(); AttentionOutcome → updateFromEngagement(). Replaces the MasteryNode in the in-memory MasteryMap. Posts bb.mastery.updated with the changed node. Trace: REQ-DW-MST-03, MST-04, REQ-DW-ATT-03.',
  async: false
})

CREATE (tCalibratorClass)-[:HAS_FIELD]->(fnInitializeMastery)
CREATE (tCalibratorClass)-[:HAS_FIELD]->(fnUpdate)

CREATE (fCalibrator)-[:CONTAINS]->(tCalibratorClass)

// === Wire files to module ===

CREATE (mod)-[:CONTAINS]->(fTypes)
CREATE (mod)-[:CONTAINS]->(fPartialCredit)
CREATE (mod)-[:CONTAINS]->(fMasteryUpdater)
CREATE (mod)-[:CONTAINS]->(fPlateauDetector)
CREATE (mod)-[:CONTAINS]->(fCalibrator)

// ──────────────────────────────────────────────────────────────
// INVARIANTS
// ──────────────────────────────────────────────────────────────

// AltitudeNeverRegresses and ConfidenceIsTheBidirectionalSignal are
// defined authoritatively in d06 (G11). Re-referenced here as scope
// binding — Calibrator is the enforcement site.

CREATE (invCalibratorIsImmutable:TGTInvariant {
  name: 'MasteryNodeIsImmutable',
  rule: 'All mastery-updater.ts functions must return a new MasteryNode and never mutate the input node. MasteryNode is a value-object. Calibrator replaces nodes in the MasteryMap by substitution, not mutation.',
  scope: 'calibrator',
  satisfies: 'REQ-DW-ARC-04'
})

CREATE (invPartialCreditIsPure:TGTInvariant {
  name: 'PartialCreditIsDeterministic',
  rule: 'applyPartialCredit and resolveMultiplePriorDomains must be pure functions with no side effects, no I/O, no BB interaction. They implement the PartialCreditFormula thresholds (d06 G6) as direct branching logic — no LLM, no inference. Consistent with REQ-DW-ARC-04 Tier 0.',
  scope: 'calibrator',
  satisfies: 'REQ-DW-MST-02, REQ-DW-ARC-04'
})

CREATE (invPlateauIsPure:TGTInvariant {
  name: 'PlateauDetectionIsDeterministic',
  rule: 'detectPlateau must evaluate the four PlateauDetectionPolicy conditions as direct threshold comparisons — no inference, no probabilistic logic. All four conditions must be met simultaneously before PlateauSignal is returned. Thresholds sourced from PlateauDetectionPolicy config (G7) — never hardcoded.',
  scope: 'calibrator',
  satisfies: 'REQ-DW-GAP-04, REQ-DW-ARC-03, REQ-DW-ARC-04'
})

CREATE (mod)-[:ENFORCES]->(invCalibratorIsImmutable)
CREATE (mod)-[:ENFORCES]->(invPartialCreditIsPure)
CREATE (mod)-[:ENFORCES]->(invPlateauIsPure)

;
