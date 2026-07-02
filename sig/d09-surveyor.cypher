// ============================================================
// D-09 SURVEYOR — SIG Pre-Game Blueprint
// ============================================================
//
// The gap analyst. Continuously monitors coverage completeness
// across all concept nodes in the active domain. Classifies gaps
// by type (knowledge, drift, bridge, convergent-misconception).
// Detects confidence plateaus via Calibrator signals and fires
// bridge requests. Runs post-certification gap scans.
//
// Traces to:
//   DWELL-FEATURES.md  — F-6.1 (Plateau Detection triggers bridge)
//                        F-6.3 (Convergent Misconceptions)
//   DWELL-REQUIREMENTS.md — REQ-DW-GAP-01, GAP-02, GAP-03, GAP-04
//   d01-agents.cypher  — TGTModule {name: 'surveyor'}
//   d06-gap-resolutions.cypher — G7 (PlateauDetectionPolicy)
//   d08-calibrator.cypher — MasteryMap, PlateauSignal definition
//
// ============================================================

MERGE (mod:TGTModule {name: 'surveyor'})
SET mod.path = 'src/personal-twin/surveyor',
    mod.capability = 'gap-detection',
    mod.tier = 'PersonalTwin'

// ──────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────

// GapCluster — a named group of concept nodes sharing a gap type.
// Produced by coverage-scanner.ts. Consumed by Gatekeeper for path ordering.
// Trace: REQ-DW-GAP-01, GAP-02, F-6.3

CREATE (tGapCluster:TGTType {
  name: 'GapCluster',
  kind: 'class',
  style: 'value-object',
  description: 'A named cluster of concept nodes that share a gap condition. gapType classifies the cluster: knowledge = altitudeGap > 0; drift = domain changed since mastered; bridge = system has both sides but no connection yet; convergent-misconception = ≥2 prior domains produce same wrong intuition per misconception catalog. priority and examWeight drive Gatekeeper path ordering. Convergent-misconception clusters must appear at path head.',
  satisfies: 'REQ-DW-GAP-01, GAP-02, F-6.3'
})
CREATE (tGapCluster)-[:HAS_FIELD]->(:TGTField {name: 'clusterId',   type: 'string',                                                           required: true,  description: 'Unique cluster identifier'})
CREATE (tGapCluster)-[:HAS_FIELD]->(:TGTField {name: 'label',       type: 'string',                                                           required: true,  description: 'Human-readable cluster label (e.g. "IAM policy evaluation gaps")'})
CREATE (tGapCluster)-[:HAS_FIELD]->(:TGTField {name: 'gapType',     type: "'knowledge'|'drift'|'bridge'|'convergent-misconception'",           required: true,  description: 'Gap classification. convergent-misconception is highest-risk — path head priority enforced by Gatekeeper.'})
CREATE (tGapCluster)-[:HAS_FIELD]->(:TGTField {name: 'conceptIds',  type: 'string[]',                                                         required: true,  description: 'Concept node IDs belonging to this cluster'})
CREATE (tGapCluster)-[:HAS_FIELD]->(:TGTField {name: 'priority',    type: "'high'|'medium'|'low'",                                            required: true,  description: 'Relative priority for surfacing. convergent-misconception → always high.'})
CREATE (tGapCluster)-[:HAS_FIELD]->(:TGTField {name: 'examWeight',  type: 'number',                                                           required: true,  description: 'Aggregate exam weight of conceptIds in this cluster. Derived from DomainKnowledgeGraph node weights.'})

// PlateauSignal — carries the data Surveyor needs to file a bridge request.
// Produced by Calibrator.detectPlateau() (plateau-detector.ts in d08).
// Surveyor receives it on bb.mastery.updated and acts when non-null.
// Trace: REQ-DW-GAP-04, F-6.1, G7

CREATE (tPlateauSignal:TGTType {
  name: 'PlateauSignal',
  kind: 'interface',
  style: 'value-object',
  description: 'Signal produced by Calibrator when plateau conditions are met for a concept cluster. Surveyor receives this on bb.mastery.updated and posts bb.bridge.requested in response. All fields are known at detection time — no inference. Trace: REQ-DW-GAP-04, G7.',
  satisfies: 'REQ-DW-GAP-04, F-6.1'
})
CREATE (tPlateauSignal)-[:HAS_FIELD]->(:TGTField {name: 'conceptIds',            type: 'string[]', required: true,  description: 'Concepts in the plateau cluster'})
CREATE (tPlateauSignal)-[:HAS_FIELD]->(:TGTField {name: 'visitCount',            type: 'number',   required: true,  description: 'Total visits to this cluster since last confidence movement'})
CREATE (tPlateauSignal)-[:HAS_FIELD]->(:TGTField {name: 'confidenceDelta',       type: 'number',   required: true,  description: 'Confidence movement per visit over the plateau period (< policy.confidenceDeltaThreshold)'})
CREATE (tPlateauSignal)-[:HAS_FIELD]->(:TGTField {name: 'durationMs',            type: 'number',   required: true,  description: 'Wall-clock duration of the plateau in milliseconds'})
CREATE (tPlateauSignal)-[:HAS_FIELD]->(:TGTField {name: 'calibratorConfidence',  type: 'number',   required: true,  description: 'Calibrator confidence at time of plateau detection (< policy.maxConfidenceToTrigger)'})

// ──────────────────────────────────────────────────────────────
// FILES
// ──────────────────────────────────────────────────────────────

// === types.ts ===

CREATE (fTypes:TGTFile {
  name: 'types.ts',
  path: 'src/personal-twin/surveyor/types.ts',
  description: 'All Surveyor types: GapCluster, PlateauSignal.',
  exports: 'GapCluster, PlateauSignal'
})
CREATE (fTypes)-[:CONTAINS]->(tGapCluster)
CREATE (fTypes)-[:CONTAINS]->(tPlateauSignal)

// === coverage-scanner.ts — Pure gap scan functions ===

CREATE (fCoverageScanner:TGTFile {
  name: 'coverage-scanner.ts',
  path: 'src/personal-twin/surveyor/coverage-scanner.ts',
  description: 'Pure functions that produce GapCluster arrays from mastery and domain graph state. No state, no BB I/O. All gap classification logic lives here. Deterministic Tier 0 — no LLM.',
  exports: 'scanCoverage, classifyConvergentMisconceptions, runPostCertScan'
})

CREATE (fnScanCoverage:TGTFunction {
  name: 'scanCoverage',
  style: 'pure',
  signature: '(masteryMap: MasteryMap, graph: DomainKnowledgeGraph): GapCluster[]',
  description: 'Full coverage scan. For each concept node in graph: altitudeGap > 0 → knowledge gap. Groups into clusters by domain area and exam weight. Returns one GapCluster per distinct cluster. Does not classify convergent misconceptions (separate function). Does not check drift (requires domain version comparison — called separately by Cultivator). Pure — no state, no I/O. Trace: REQ-DW-GAP-01, GAP-02.',
  async: false
})

CREATE (fnClassifyConvergentMisconceptions:TGTFunction {
  name: 'classifyConvergentMisconceptions',
  style: 'pure',
  signature: '(masteryMap: MasteryMap, catalog: MisconceptionEntry[], priorDomains: string[]): GapCluster[]',
  description: 'Finds concepts where ≥2 of the learner\'s prior domains produce the same wrong intuition, per the MisconceptionEntry catalog supplied by the Domain Twin. Returns GapCluster(gapType: convergent-misconception, priority: high) for each affected cluster. Pure — inputs are all known at call time. Trace: REQ-DW-GAP-02, F-6.3, REQ-DW-KGM-03.',
  async: false
})

CREATE (fnRunPostCertScan:TGTFunction {
  name: 'runPostCertScan',
  style: 'pure',
  signature: '(masteryMap: MasteryMap, graph: DomainKnowledgeGraph): GapCluster[]',
  description: 'Post-certification coverage scan. Identifies concept nodes that are implied by the cert (via prerequisite edges in graph) but are not yet evidenced in masteryMap (source = no-signal or bloomsCurrentAltitude = 0). These are downstream knowledge the cert assumed the learner would have. Returns GapCluster array; these are non-urgent and surfaced via Donna at low priority. Trace: REQ-DW-GAP-03, F-1.3.',
  async: false
})

CREATE (fCoverageScanner)-[:CONTAINS]->(fnScanCoverage)
CREATE (fCoverageScanner)-[:CONTAINS]->(fnClassifyConvergentMisconceptions)
CREATE (fCoverageScanner)-[:CONTAINS]->(fnRunPostCertScan)

// === surveyor.ts — Stateful event handler ===

CREATE (fSurveyor:TGTFile {
  name: 'surveyor.ts',
  path: 'src/personal-twin/surveyor/surveyor.ts',
  description: 'Stateful Surveyor class. Holds latest GapCluster[] per domain in memory. Reacts to bb.mastery.<domain>.initialized, bb.mastery.<domain>.updated, and bb.cert.<domain>.achieved events. Posts bb.gaps.* and bb.bridge.requested events. Entry point for the module.',
  exports: 'Surveyor'
})

CREATE (tSurveyorClass:TGTType {
  name: 'Surveyor',
  kind: 'class',
  style: 'stateful-class',
  description: 'Stateful gap analyst. Holds latest GapCluster[] per domain in memory. Calls pure scanner functions on every mastery update, stores results, and posts BB events. Reacts to plateau signals from Calibrator. Does not generate bridge content — only fires bridge requests.',
  invariants: 'SurveyorDoesNotGenerateBridges — Surveyor only fires bb.bridge.requested; Bridge agent produces the content'
})

CREATE (fnOnMasteryUpdated:TGTFunction {
  name: 'onMasteryUpdated',
  style: 'effect',
  signature: '(masteryMap: MasteryMap, graph: DomainKnowledgeGraph): void',
  description: 'Called on bb.mastery.<domain>.initialized or bb.mastery.<domain>.updated. Re-runs scanCoverage() and classifyConvergentMisconceptions() with the new mastery state. If gap clusters changed, stores updated clusters and posts bb.gaps.<domain>.updated. Trace: REQ-DW-GAP-01.',
  async: false
})

CREATE (fnOnPlateauDetected:TGTFunction {
  name: 'onPlateauDetected',
  style: 'effect',
  signature: '(plateau: PlateauSignal): void',
  description: 'Called when Calibrator emits a PlateauSignal on bb.mastery.updated. Posts bb.bridge.requested with the plateau signal payload. Bridge agent picks this up. No content generation here. Trace: REQ-DW-GAP-04, F-6.1.',
  async: false
})
CREATE (fnOnPlateauDetected)-[:ACCEPTS]->(tPlateauSignal)

CREATE (fnOnCertificationAchieved:TGTFunction {
  name: 'onCertificationAchieved',
  style: 'effect',
  signature: '(cert: CertificationRecord, masteryMap: MasteryMap, graph: DomainKnowledgeGraph): void',
  description: 'Called on bb.cert.<domain>.achieved. Runs runPostCertScan() with updated mastery map. Stores post-cert gap clusters. Posts bb.gaps.<domain>.post-cert. These are non-urgent items; Donna surfaces them at low priority. Trace: REQ-DW-GAP-03, F-1.3.',
  async: false
})

CREATE (tSurveyorClass)-[:HAS_FIELD]->(fnOnMasteryUpdated)
CREATE (tSurveyorClass)-[:HAS_FIELD]->(fnOnPlateauDetected)
CREATE (tSurveyorClass)-[:HAS_FIELD]->(fnOnCertificationAchieved)

CREATE (fSurveyor)-[:CONTAINS]->(tSurveyorClass)

// === Wire files to module ===

CREATE (mod)-[:CONTAINS]->(fTypes)
CREATE (mod)-[:CONTAINS]->(fCoverageScanner)
CREATE (mod)-[:CONTAINS]->(fSurveyor)

// ──────────────────────────────────────────────────────────────
// INVARIANTS
// ──────────────────────────────────────────────────────────────

CREATE (invSurveyorNoBridgeGen:TGTInvariant {
  name: 'SurveyorDoesNotGenerateBridges',
  rule: 'Surveyor fires bb.bridge.requested events — it does not generate bridge card content. Bridge synthesis is the responsibility of the Bridge agent. Surveyor only detects the plateau condition and broadcasts the need.',
  scope: 'surveyor',
  satisfies: 'REQ-DW-ARC-02, REQ-DW-BRG-01'
})

CREATE (invConvergentMisconceptionFirst:TGTInvariant {
  name: 'ConvergentMisconceptionClustersAreHighPriority',
  rule: 'GapClusters with gapType=convergent-misconception must always be classified with priority=high. Gatekeeper reads this priority and places them at path head. Surveyor enforces the classification — Gatekeeper enforces the ordering.',
  scope: 'surveyor',
  satisfies: 'REQ-DW-GAP-02, F-6.3 leaf "convergent-misconception concepts must be placed at the head of the learning path"'
})

CREATE (invScannerIsPure:TGTInvariant {
  name: 'CoverageScannerIsPure',
  rule: 'scanCoverage, classifyConvergentMisconceptions, and runPostCertScan must have no side effects, no state reads, and no BB interaction. They are pure deterministic functions testable in isolation. Trace: REQ-DW-ARC-04.',
  scope: 'surveyor',
  satisfies: 'REQ-DW-ARC-04'
})

CREATE (invPostCertNonUrgent:TGTInvariant {
  name: 'PostCertGapsAreNonUrgent',
  rule: 'Gap clusters produced by runPostCertScan are always low-priority. They must not be surfaced immediately on certification — they are held by Donna and surface in ambient mode at appropriate moments. Trace: REQ-DW-GAP-03 "queued — not surfaced urgently".',
  scope: 'surveyor',
  satisfies: 'REQ-DW-GAP-03, F-1.3'
})

CREATE (mod)-[:ENFORCES]->(invSurveyorNoBridgeGen)
CREATE (mod)-[:ENFORCES]->(invConvergentMisconceptionFirst)
CREATE (mod)-[:ENFORCES]->(invScannerIsPure)
CREATE (mod)-[:ENFORCES]->(invPostCertNonUrgent)

;
