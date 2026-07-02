// ============================================================
// D-02 BB EVENTS — SIG Pre-Game Blueprint
// ============================================================
//
// TGTType nodes for every bb.* event in the Dwell architecture.
// Traceable to: DWELL-EVENT-ARCHITECTURE.md Part 1 — Intra-Twin Events (bb.*)
//
// Agents referenced here are MERGE'd (created in d01-agents.cypher).
// Pattern: MERGE agent by name, then CREATE event type and edges.
//
// Node Labels: TGTType (kind:'event'), TGTField
// Relationship Types: HAS_FIELD, EMITS, CONSUMES
//
// ============================================================

// ──────────────────────────────────────────────────────────────
// AGENT REFERENCES (MERGE — created in d01)
// ──────────────────────────────────────────────────────────────

MERGE (mAntiquarian:TGTModule {name: 'antiquarian'})
MERGE (mCalibrator:TGTModule {name: 'calibrator'})
MERGE (mSurveyor:TGTModule {name: 'surveyor'})
MERGE (mGatekeeper:TGTModule {name: 'gatekeeper'})
MERGE (mBridge:TGTModule {name: 'bridge'})
MERGE (mAnswerAgent:TGTModule {name: 'answer-agent'})
MERGE (mEngagement:TGTModule {name: 'engagement-agent'})
MERGE (mCultivator:TGTModule {name: 'cultivator'})
MERGE (mDonna:TGTModule {name: 'donna'})
MERGE (mZipper:TGTModule {name: 'zipper'})

// ──────────────────────────────────────────────────────────────
// INTENT & LIFECYCLE EVENTS
// ──────────────────────────────────────────────────────────────

// Trace: Part 1 — bb.intent.declared
CREATE (eBbIntentDeclared:TGTType {
  name: 'BbIntentDeclared',
  kind: 'event',
  topic: 'bb.intent.declared',
  namespace: 'bb',
  routing: 'fire-and-forget',
  description: 'Bill declares a learning intent. Triggers domain discovery, baseline extraction, and initial calibration.'
})
CREATE (eBbIntentDeclared)-[:HAS_FIELD]->(:TGTField {name: 'intent',       type: 'string',  required: true,  description: 'Human-readable intent string e.g. "AWS Solutions Architect cert"'})
CREATE (eBbIntentDeclared)-[:HAS_FIELD]->(:TGTField {name: 'declaredAt',   type: 'ISO8601', required: true,  description: 'Timestamp of declaration'})

// Producer: UI / User (no TGTModule node — external source)
// Consumers: Bridge, Antiquarian, Calibrator, Surveyor
CREATE (mBridge)-[:CONSUMES]->(eBbIntentDeclared)
CREATE (mAntiquarian)-[:CONSUMES]->(eBbIntentDeclared)
CREATE (mCalibrator)-[:CONSUMES]->(eBbIntentDeclared)
CREATE (mSurveyor)-[:CONSUMES]->(eBbIntentDeclared)

// ──────────────────────────────────────────────────────────────

// Trace: Part 1 — bb.cert.<domain>.achieved
CREATE (eBbCertAchieved:TGTType {
  name: 'BbCertAchieved',
  kind: 'event',
  topic: 'bb.cert.<domain>.achieved',
  namespace: 'bb',
  routing: 'fire-and-forget',
  description: 'External validation received — Bill has passed a certification. Triggers baseline update, mastery recalibration, post-cert gap analysis, and staleness watch registration.'
})
CREATE (eBbCertAchieved)-[:HAS_FIELD]->(:TGTField {name: 'domain',              type: 'string',  required: true,  description: 'Domain identifier e.g. "aws-saa"'})
CREATE (eBbCertAchieved)-[:HAS_FIELD]->(:TGTField {name: 'certName',            type: 'string',  required: true,  description: 'Human-readable cert name'})
CREATE (eBbCertAchieved)-[:HAS_FIELD]->(:TGTField {name: 'achievedAt',          type: 'ISO8601', required: true,  description: 'When the cert was achieved'})
CREATE (eBbCertAchieved)-[:HAS_FIELD]->(:TGTField {name: 'validatedExternally', type: 'boolean', required: true,  description: 'Whether the cert was externally validated'})

// Producer: UI / User (external). Consumers: Antiquarian, Calibrator, Cultivator, Surveyor
CREATE (mAntiquarian)-[:CONSUMES]->(eBbCertAchieved)
CREATE (mCalibrator)-[:CONSUMES]->(eBbCertAchieved)
CREATE (mCultivator)-[:CONSUMES]->(eBbCertAchieved)
CREATE (mSurveyor)-[:CONSUMES]->(eBbCertAchieved)

// ──────────────────────────────────────────────────────────────
// LEARNER MODEL EVENTS
// ──────────────────────────────────────────────────────────────

// Trace: Part 1 — bb.learner.<domain>.baseline
CREATE (eBbLearnerBaseline:TGTType {
  name: 'BbLearnerBaseline',
  kind: 'event',
  topic: 'bb.learner.<domain>.baseline',
  namespace: 'bb',
  routing: 'fire-and-forget',
  description: 'Antiquarian\'s initial read of Bill\'s prior knowledge in a domain, before any active learning begins. Signal strength per concept node from evidence sources.'
})
CREATE (eBbLearnerBaseline)-[:HAS_FIELD]->(:TGTField {name: 'domain',       type: 'string',  required: true,  description: 'Domain identifier'})
CREATE (eBbLearnerBaseline)-[:HAS_FIELD]->(:TGTField {name: 'nodes',        type: 'BaselineNode[]', required: true, description: 'Array of concept nodes with signal strength and evidence sources'})
CREATE (eBbLearnerBaseline)-[:HAS_FIELD]->(:TGTField {name: 'assessedAt',   type: 'ISO8601', required: true,  description: 'Timestamp of assessment'})
// BaselineNode fields (inline sub-type):
//   conceptId: string, signalStrength: "strong"|"weak"|"none"|"conflicting", evidenceSources: string[]

CREATE (mAntiquarian)-[:EMITS]->(eBbLearnerBaseline)
CREATE (mCalibrator)-[:CONSUMES]->(eBbLearnerBaseline)

// ──────────────────────────────────────────────────────────────

// Trace: Part 1 — bb.learner.preferences.updated
CREATE (eBbPreferencesUpdated:TGTType {
  name: 'BbLearnerPreferencesUpdated',
  kind: 'event',
  topic: 'bb.learner.preferences.updated',
  namespace: 'bb',
  routing: 'fire-and-forget',
  description: 'Learner has made an explicit choice affecting path ordering or methodology.'
})
CREATE (eBbPreferencesUpdated)-[:HAS_FIELD]->(:TGTField {name: 'preferenceType', type: '"path-order"|"methodology"|"batch-start"', required: true,  description: 'Type of preference change'})
CREATE (eBbPreferencesUpdated)-[:HAS_FIELD]->(:TGTField {name: 'value',          type: 'string',  required: true,  description: 'New preference value'})
CREATE (eBbPreferencesUpdated)-[:HAS_FIELD]->(:TGTField {name: 'context',        type: 'string',  required: true,  description: 'What decision prompted this change'})

// Producer: UI / Donna. Consumer: Gatekeeper
CREATE (mDonna)-[:EMITS]->(eBbPreferencesUpdated)
CREATE (mGatekeeper)-[:CONSUMES]->(eBbPreferencesUpdated)

// ──────────────────────────────────────────────────────────────
// MASTERY EVENTS
// ──────────────────────────────────────────────────────────────

// Trace: Part 1 — bb.mastery.<domain>.initialized
CREATE (eBbMasteryInitialized:TGTType {
  name: 'BbMasteryInitialized',
  kind: 'event',
  topic: 'bb.mastery.<domain>.initialized',
  namespace: 'bb',
  routing: 'fire-and-forget',
  description: 'Calibrator posts the first mastery estimate for a domain, reconciling the domain knowledge graph against the learner baseline. Includes Bloom\'s altitude per node and overall readiness.'
})
CREATE (eBbMasteryInitialized)-[:HAS_FIELD]->(:TGTField {name: 'domain',          type: 'string',  required: true,  description: 'Domain identifier'})
CREATE (eBbMasteryInitialized)-[:HAS_FIELD]->(:TGTField {name: 'totalNodes',      type: 'number',  required: true,  description: 'Total concept nodes in domain graph'})
CREATE (eBbMasteryInitialized)-[:HAS_FIELD]->(:TGTField {name: 'nodes',           type: 'MasteryNode[]', required: true, description: 'Array of concept mastery nodes'})
CREATE (eBbMasteryInitialized)-[:HAS_FIELD]->(:TGTField {name: 'overallReadiness',type: 'number',  required: true,  description: 'Overall readiness score 0.0–1.0'})
CREATE (eBbMasteryInitialized)-[:HAS_FIELD]->(:TGTField {name: 'initializedAt',   type: 'ISO8601', required: true,  description: 'Timestamp of initialization'})
// MasteryNode fields: conceptId, confidence (0.0-1.0), bloomsAltitude (1-6), source ("prior-evidence"|"partial-credit"|"no-signal")

CREATE (mCalibrator)-[:EMITS]->(eBbMasteryInitialized)
CREATE (mSurveyor)-[:CONSUMES]->(eBbMasteryInitialized)
CREATE (mGatekeeper)-[:CONSUMES]->(eBbMasteryInitialized)

// ──────────────────────────────────────────────────────────────

// Trace: Part 1 — bb.mastery.<domain>.updated
CREATE (eBbMasteryUpdated:TGTType {
  name: 'BbMasteryUpdated',
  kind: 'event',
  topic: 'bb.mastery.<domain>.updated',
  namespace: 'bb',
  routing: 'fire-and-forget',
  description: 'Calibrator posts an updated mastery estimate after a learning interaction. Only changed nodes are included.'
})
CREATE (eBbMasteryUpdated)-[:HAS_FIELD]->(:TGTField {name: 'domain',       type: 'string',  required: true,  description: 'Domain identifier'})
CREATE (eBbMasteryUpdated)-[:HAS_FIELD]->(:TGTField {name: 'updatedNodes', type: 'MasteryUpdate[]', required: true, description: 'Only changed nodes; includes previous and new altitude/confidence values'})
CREATE (eBbMasteryUpdated)-[:HAS_FIELD]->(:TGTField {name: 'updatedAt',    type: 'ISO8601', required: true,  description: 'Timestamp of update'})
// MasteryUpdate fields: conceptId, confidencePrevious, confidenceNew, bloomsAltitudePrevious, bloomsAltitudeNew,
//   trigger ("learning-interaction"|"assessment"|"bridge-engagement")

CREATE (mCalibrator)-[:EMITS]->(eBbMasteryUpdated)
CREATE (mSurveyor)-[:CONSUMES]->(eBbMasteryUpdated)
CREATE (mGatekeeper)-[:CONSUMES]->(eBbMasteryUpdated)
CREATE (mDonna)-[:CONSUMES]->(eBbMasteryUpdated)

// ──────────────────────────────────────────────────────────────
// GAP EVENTS
// ──────────────────────────────────────────────────────────────

// Trace: Part 1 — bb.gaps.<domain>.initial
CREATE (eBbGapsInitial:TGTType {
  name: 'BbGapsInitial',
  kind: 'event',
  topic: 'bb.gaps.<domain>.initial',
  namespace: 'bb',
  routing: 'fire-and-forget',
  description: 'Surveyor posts the first gap cluster analysis for a domain after mastery is initialized. Includes gap type, priority, and exam weight per cluster.'
})
CREATE (eBbGapsInitial)-[:HAS_FIELD]->(:TGTField {name: 'domain',      type: 'string',  required: true,  description: 'Domain identifier'})
CREATE (eBbGapsInitial)-[:HAS_FIELD]->(:TGTField {name: 'clusters',    type: 'GapCluster[]', required: true, description: 'Gap clusters with type, priority, and exam weight'})
CREATE (eBbGapsInitial)-[:HAS_FIELD]->(:TGTField {name: 'assessedAt',  type: 'ISO8601', required: true,  description: 'Timestamp of assessment'})
// GapCluster fields: clusterId, label, gapType ("knowledge"|"drift"|"bridge"|"convergent-misconception"),
//   conceptIds, priority ("high"|"medium"|"low"), examWeight (0.0-1.0)

CREATE (mSurveyor)-[:EMITS]->(eBbGapsInitial)
CREATE (mGatekeeper)-[:CONSUMES]->(eBbGapsInitial)
CREATE (mDonna)-[:CONSUMES]->(eBbGapsInitial)

// ──────────────────────────────────────────────────────────────

// Trace: Part 1 — bb.gaps.<domain>.updated
CREATE (eBbGapsUpdated:TGTType {
  name: 'BbGapsUpdated',
  kind: 'event',
  topic: 'bb.gaps.<domain>.updated',
  namespace: 'bb',
  routing: 'fire-and-forget',
  description: 'Surveyor posts revised gap analysis as mastery state changes. Same shape as initial.'
})
CREATE (eBbGapsUpdated)-[:HAS_FIELD]->(:TGTField {name: 'domain',     type: 'string',       required: true, description: 'Domain identifier'})
CREATE (eBbGapsUpdated)-[:HAS_FIELD]->(:TGTField {name: 'clusters',   type: 'GapCluster[]', required: true, description: 'Updated gap clusters'})
CREATE (eBbGapsUpdated)-[:HAS_FIELD]->(:TGTField {name: 'assessedAt', type: 'ISO8601',      required: true, description: 'Timestamp of revised assessment'})

CREATE (mSurveyor)-[:EMITS]->(eBbGapsUpdated)
CREATE (mGatekeeper)-[:CONSUMES]->(eBbGapsUpdated)
CREATE (mDonna)-[:CONSUMES]->(eBbGapsUpdated)

// ──────────────────────────────────────────────────────────────

// Trace: Part 1 — bb.gaps.<domain>.post-cert
CREATE (eBbGapsPostCert:TGTType {
  name: 'BbGapsPostCert',
  kind: 'event',
  topic: 'bb.gaps.<domain>.post-cert',
  namespace: 'bb',
  routing: 'fire-and-forget',
  description: 'Surveyor posts gaps discovered from a certification — downstream knowledge implied by the cert but not yet evidenced. gapType typically "knowledge" or "bridge".'
})
CREATE (eBbGapsPostCert)-[:HAS_FIELD]->(:TGTField {name: 'domain',     type: 'string',       required: true, description: 'Domain identifier'})
CREATE (eBbGapsPostCert)-[:HAS_FIELD]->(:TGTField {name: 'clusters',   type: 'GapCluster[]', required: true, description: 'Post-cert gap clusters'})
CREATE (eBbGapsPostCert)-[:HAS_FIELD]->(:TGTField {name: 'assessedAt', type: 'ISO8601',      required: true, description: 'Timestamp of assessment'})

CREATE (mSurveyor)-[:EMITS]->(eBbGapsPostCert)
CREATE (mDonna)-[:CONSUMES]->(eBbGapsPostCert)

// ──────────────────────────────────────────────────────────────
// PATH EVENTS
// ──────────────────────────────────────────────────────────────

// Trace: Part 1 — bb.path.<domain>.ready
CREATE (eBbPathReady:TGTType {
  name: 'BbPathReady',
  kind: 'event',
  topic: 'bb.path.<domain>.ready',
  namespace: 'bb',
  routing: 'fire-and-forget',
  description: 'Gatekeeper posts the learning path — the ordered sequence of concept nodes to address, with curated batch groupings and methodology hints.'
})
CREATE (eBbPathReady)-[:HAS_FIELD]->(:TGTField {name: 'domain',       type: 'string',        required: true, description: 'Domain identifier'})
CREATE (eBbPathReady)-[:HAS_FIELD]->(:TGTField {name: 'sequence',     type: 'PathNode[]',    required: true, description: 'Ordered concept nodes with batch and methodology info'})
CREATE (eBbPathReady)-[:HAS_FIELD]->(:TGTField {name: 'generatedAt',  type: 'ISO8601',       required: true, description: 'Timestamp of path generation'})
// PathNode fields: conceptId, batchId (string|null), estimatedSessions, methodology (string|null)

CREATE (mGatekeeper)-[:EMITS]->(eBbPathReady)
CREATE (mDonna)-[:CONSUMES]->(eBbPathReady)
// Note: "methodology layer" consumer noted in spec — not a named TGTModule; omitted per hard constraint

// ──────────────────────────────────────────────────────────────

// Trace: Part 1 — bb.path.<domain>.updated
CREATE (eBbPathUpdated:TGTType {
  name: 'BbPathUpdated',
  kind: 'event',
  topic: 'bb.path.<domain>.updated',
  namespace: 'bb',
  routing: 'fire-and-forget',
  description: 'Gatekeeper posts a revised path after a domain graph update or learner preference change. Same shape as ready, plus updateReason.'
})
CREATE (eBbPathUpdated)-[:HAS_FIELD]->(:TGTField {name: 'domain',        type: 'string',     required: true, description: 'Domain identifier'})
CREATE (eBbPathUpdated)-[:HAS_FIELD]->(:TGTField {name: 'sequence',      type: 'PathNode[]', required: true, description: 'Revised ordered concept nodes'})
CREATE (eBbPathUpdated)-[:HAS_FIELD]->(:TGTField {name: 'generatedAt',   type: 'ISO8601',    required: true, description: 'Timestamp of path revision'})
CREATE (eBbPathUpdated)-[:HAS_FIELD]->(:TGTField {name: 'updateReason',  type: 'string',     required: true, description: 'Why the path was updated'})

CREATE (mGatekeeper)-[:EMITS]->(eBbPathUpdated)
CREATE (mDonna)-[:CONSUMES]->(eBbPathUpdated)

// ──────────────────────────────────────────────────────────────
// BRIDGE EVENTS
// ──────────────────────────────────────────────────────────────

// Trace: Part 1 — bb.bridge.requested
CREATE (eBbBridgeRequested:TGTType {
  name: 'BbBridgeRequested',
  kind: 'event',
  topic: 'bb.bridge.requested',
  namespace: 'bb',
  routing: 'fire-and-forget',
  description: 'Surveyor files a bridge request when Calibrator signals a confidence plateau — indicating the learner is stuck and more content alone won\'t help.'
})
CREATE (eBbBridgeRequested)-[:HAS_FIELD]->(:TGTField {name: 'domain',            type: 'string',  required: true, description: 'Domain identifier'})
CREATE (eBbBridgeRequested)-[:HAS_FIELD]->(:TGTField {name: 'conceptIds',        type: 'string[]',required: true, description: 'Concept cluster where plateau was detected'})
CREATE (eBbBridgeRequested)-[:HAS_FIELD]->(:TGTField {name: 'learnerState',      type: '"plateau"|"confused"|"slow"', required: true, description: 'Learner state triggering bridge request'})
CREATE (eBbBridgeRequested)-[:HAS_FIELD]->(:TGTField {name: 'calibratorSignal',  type: 'CalibratorSignal', required: true, description: 'Signal from Calibrator: current confidence, visit count, plateau duration'})
CREATE (eBbBridgeRequested)-[:HAS_FIELD]->(:TGTField {name: 'requestedAt',       type: 'ISO8601', required: true, description: 'Timestamp of request'})
// CalibratorSignal fields: confidenceCurrent (number), visitsCount (number), plateauDuration (string)

CREATE (mSurveyor)-[:EMITS]->(eBbBridgeRequested)
CREATE (mBridge)-[:CONSUMES]->(eBbBridgeRequested)

// ──────────────────────────────────────────────────────────────

// Trace: Part 1 — bb.bridge.ready
CREATE (eBbBridgeReady:TGTType {
  name: 'BbBridgeReady',
  kind: 'event',
  topic: 'bb.bridge.ready',
  namespace: 'bb',
  routing: 'fire-and-forget',
  description: 'Bridge posts the personalized connection card for Donna to surface. The card body is synthesized from the Domain Twin\'s generic template and Bill\'s specific mental model anchor.'
})
CREATE (eBbBridgeReady)-[:HAS_FIELD]->(:TGTField {name: 'domain',       type: 'string',  required: true, description: 'Domain identifier'})
CREATE (eBbBridgeReady)-[:HAS_FIELD]->(:TGTField {name: 'conceptIds',   type: 'string[]',required: true, description: 'Target concepts this bridge addresses'})
CREATE (eBbBridgeReady)-[:HAS_FIELD]->(:TGTField {name: 'sourceAnchor', type: 'string',  required: true, description: 'Bill-specific mental model used e.g. "Peach Bottom containment zones"'})
CREATE (eBbBridgeReady)-[:HAS_FIELD]->(:TGTField {name: 'bridgeType',   type: 'string',  required: true, description: 'Generic bridge type from Domain Twin Librarian'})
CREATE (eBbBridgeReady)-[:HAS_FIELD]->(:TGTField {name: 'card',         type: 'BridgeCard', required: true, description: 'Personalized bridge card: body text and origin label'})
CREATE (eBbBridgeReady)-[:HAS_FIELD]->(:TGTField {name: 'readyAt',      type: 'ISO8601', required: true, description: 'Timestamp'})
// BridgeCard fields: body (string), origin ("domain-twin-generic"|"personal-twin-synthesized")

CREATE (mBridge)-[:EMITS]->(eBbBridgeReady)
CREATE (mDonna)-[:CONSUMES]->(eBbBridgeReady)

// ──────────────────────────────────────────────────────────────
// ASSESSMENT EVENTS
// ──────────────────────────────────────────────────────────────

// Trace: Part 1 — bb.assessment.diagnostic.<topic>
CREATE (eBbAssessmentDiagnostic:TGTType {
  name: 'BbAssessmentDiagnostic',
  kind: 'event',
  topic: 'bb.assessment.diagnostic.<topic>',
  namespace: 'bb',
  routing: 'fire-and-forget',
  description: 'Tester posts calibrated diagnostic questions to probe mastery depth on a specific topic. Items include Bloom\'s level and associated concept IDs.'
})
CREATE (eBbAssessmentDiagnostic)-[:HAS_FIELD]->(:TGTField {name: 'topic', type: 'string',       required: true, description: 'Topic being assessed'})
CREATE (eBbAssessmentDiagnostic)-[:HAS_FIELD]->(:TGTField {name: 'items', type: 'AssessmentItem[]', required: true, description: 'Diagnostic question items'})
// AssessmentItem fields: itemId, question, bloomsLevel (1-6), conceptIds (string[])

// Producer: Tester (Domain Twin, relayed). Consumers: Calibrator, methodology layer
CREATE (mCalibrator)-[:CONSUMES]->(eBbAssessmentDiagnostic)

// ──────────────────────────────────────────────────────────────

// Trace: Part 1 — bb.assessment.outcome
CREATE (eBbAssessmentOutcome:TGTType {
  name: 'BbAssessmentOutcome',
  kind: 'event',
  topic: 'bb.assessment.outcome',
  namespace: 'bb',
  routing: 'fire-and-forget',
  description: 'Result of an assessment interaction returned from the methodology layer. Used by Calibrator to update mastery and by Tester for item calibration feedback.'
})
CREATE (eBbAssessmentOutcome)-[:HAS_FIELD]->(:TGTField {name: 'itemId',                   type: 'string',  required: true, description: 'Assessment item ID'})
CREATE (eBbAssessmentOutcome)-[:HAS_FIELD]->(:TGTField {name: 'conceptIds',               type: 'string[]',required: true, description: 'Concepts assessed'})
CREATE (eBbAssessmentOutcome)-[:HAS_FIELD]->(:TGTField {name: 'bloomsLevelDemonstrated',  type: 'number',  required: true, description: 'Bloom\'s level demonstrated (1-6)'})
CREATE (eBbAssessmentOutcome)-[:HAS_FIELD]->(:TGTField {name: 'correct',                  type: 'boolean', required: true, description: 'Whether the response was correct'})
CREATE (eBbAssessmentOutcome)-[:HAS_FIELD]->(:TGTField {name: 'responseTimeMs',           type: 'number',  required: true, description: 'Response time in milliseconds'})
CREATE (eBbAssessmentOutcome)-[:HAS_FIELD]->(:TGTField {name: 'confidence',               type: '"certain"|"hesitant"|"guessed"', required: true, description: 'Learner confidence signal'})

// Producer: methodology layer (MCP server — not a named TGTModule in spec)
CREATE (mCalibrator)-[:CONSUMES]->(eBbAssessmentOutcome)
// Tester consumes for item calibration feedback (Tester is domain-side; relayed via Zipper)

// ──────────────────────────────────────────────────────────────
// ATTENTION EVENTS
// ──────────────────────────────────────────────────────────────

// Trace: Part 1 — bb.synthesis.completed (existing, from Donna/UDT SIG F-13)
CREATE (eBbSynthesisCompleted:TGTType {
  name: 'BbSynthesisCompleted',
  kind: 'event',
  topic: 'bb.synthesis.completed',
  namespace: 'bb',
  routing: 'fire-and-forget',
  description: 'Existing event (UDT SIG F-13). Signals that the Office of Facts pipeline has produced a brief ready for Donna. Emitted by Janitor at end of Scribe→Reader→Sorter→Curator→Steward→Janitor pipeline.'
})
// Producer: Janitor (existing pipeline). Consumer: Donna
CREATE (mDonna)-[:CONSUMES]->(eBbSynthesisCompleted)

// ──────────────────────────────────────────────────────────────

// Trace: Part 1 — bb.attention.surfaced
CREATE (eBbAttentionSurfaced:TGTType {
  name: 'BbAttentionSurfaced',
  kind: 'event',
  topic: 'bb.attention.surfaced',
  namespace: 'bb',
  routing: 'fire-and-forget',
  description: 'Donna has surfaced an item to Bill. Used for analytics and logging to track what was shown and when.'
})
CREATE (eBbAttentionSurfaced)-[:HAS_FIELD]->(:TGTField {name: 'itemType',   type: '"bridge-card"|"gap-item"|"brief"|"learning-node"', required: true, description: 'Type of item surfaced'})
CREATE (eBbAttentionSurfaced)-[:HAS_FIELD]->(:TGTField {name: 'itemId',     type: 'string',  required: true, description: 'ID of the item surfaced'})
CREATE (eBbAttentionSurfaced)-[:HAS_FIELD]->(:TGTField {name: 'mode',       type: 'string',  required: true, description: 'Bill\'s mode at time of surfacing'})
CREATE (eBbAttentionSurfaced)-[:HAS_FIELD]->(:TGTField {name: 'surfacedAt', type: 'ISO8601', required: true, description: 'Timestamp of surfacing'})

CREATE (mDonna)-[:EMITS]->(eBbAttentionSurfaced)

// ──────────────────────────────────────────────────────────────

// Trace: Part 1 — bb.attention.outcome
CREATE (eBbAttentionOutcome:TGTType {
  name: 'BbAttentionOutcome',
  kind: 'event',
  topic: 'bb.attention.outcome',
  namespace: 'bb',
  routing: 'fire-and-forget',
  description: 'Bill\'s response to a surfaced item. Drives Calibrator updates (if learning card), Bridge follow-up (if bridge card), and Donna\'s attention model.'
})
CREATE (eBbAttentionOutcome)-[:HAS_FIELD]->(:TGTField {name: 'itemId',      type: 'string',  required: true,  description: 'ID of the item responded to'})
CREATE (eBbAttentionOutcome)-[:HAS_FIELD]->(:TGTField {name: 'itemType',    type: 'string',  required: true,  description: 'Type of item'})
CREATE (eBbAttentionOutcome)-[:HAS_FIELD]->(:TGTField {name: 'response',    type: '"engaged"|"thanked"|"later"|"dismissed"', required: true, description: 'Bill\'s response'})
CREATE (eBbAttentionOutcome)-[:HAS_FIELD]->(:TGTField {name: 'noteAdded',   type: 'string',  required: false, description: 'Bill\'s optional note'})
CREATE (eBbAttentionOutcome)-[:HAS_FIELD]->(:TGTField {name: 'respondedAt', type: 'ISO8601', required: true,  description: 'Timestamp of response'})

// Producer: UI (external). Consumers: Donna, Calibrator, Bridge
CREATE (mDonna)-[:CONSUMES]->(eBbAttentionOutcome)
CREATE (mCalibrator)-[:CONSUMES]->(eBbAttentionOutcome)
CREATE (mBridge)-[:CONSUMES]->(eBbAttentionOutcome)

// ──────────────────────────────────────────────────────────────
// DOMAIN CURRENCY EVENTS
// ──────────────────────────────────────────────────────────────

// Trace: Part 1 — bb.domain.<domain>.updated
CREATE (eBbDomainUpdated:TGTType {
  name: 'BbDomainUpdated',
  kind: 'event',
  topic: 'bb.domain.<domain>.updated',
  namespace: 'bb',
  routing: 'fire-and-forget',
  description: 'Cultivator relays a domain graph update from the Domain Twin — cert syllabus changed, service deprecated, new content added.'
})
CREATE (eBbDomainUpdated)-[:HAS_FIELD]->(:TGTField {name: 'domain',      type: 'string',   required: true, description: 'Domain identifier'})
CREATE (eBbDomainUpdated)-[:HAS_FIELD]->(:TGTField {name: 'changes',     type: 'DomainChange[]', required: true, description: 'List of concept changes from Domain Twin delta'})
CREATE (eBbDomainUpdated)-[:HAS_FIELD]->(:TGTField {name: 'detectedAt',  type: 'ISO8601',  required: true, description: 'Timestamp of detection'})
// DomainChange fields: conceptId, changeType ("added"|"deprecated"|"modified"|"reweighted"),
//   examWeightDelta (number|null), severity ("minor"|"major")

CREATE (mCultivator)-[:EMITS]->(eBbDomainUpdated)
CREATE (mSurveyor)-[:CONSUMES]->(eBbDomainUpdated)
CREATE (mGatekeeper)-[:CONSUMES]->(eBbDomainUpdated)

// ──────────────────────────────────────────────────────────────

// Trace: Part 1 — bb.staleness.watch.<domain>.active
CREATE (eBbStalenessWatch:TGTType {
  name: 'BbStalenessWatchActive',
  kind: 'event',
  topic: 'bb.staleness.watch.<domain>.active',
  namespace: 'bb',
  routing: 'fire-and-forget',
  description: 'Cultivator confirms it has registered a staleness watch for a mastered domain. 6-month default review interval.'
})
CREATE (eBbStalenessWatch)-[:HAS_FIELD]->(:TGTField {name: 'domain',          type: 'string',  required: true, description: 'Domain identifier'})
CREATE (eBbStalenessWatch)-[:HAS_FIELD]->(:TGTField {name: 'certName',        type: 'string',  required: true, description: 'Cert being watched'})
CREATE (eBbStalenessWatch)-[:HAS_FIELD]->(:TGTField {name: 'achievedAt',      type: 'ISO8601', required: true, description: 'When the cert was achieved'})
CREATE (eBbStalenessWatch)-[:HAS_FIELD]->(:TGTField {name: 'firstReviewAt',   type: 'ISO8601', required: true, description: 'First scheduled review (default 6 months from achievedAt)'})

CREATE (mCultivator)-[:EMITS]->(eBbStalenessWatch)

// ──────────────────────────────────────────────────────────────
// INTERNAL ZIPPER RELAY EVENT
// ──────────────────────────────────────────────────────────────

// Trace: "Zipper receives [dwell.domain.{twinId}.updated] and posts bb.domain.<domain>.change-available to the BB"
CREATE (eBbChangeAvailable:TGTType {
  name: 'BbDomainChangeAvailable',
  kind: 'event',
  topic: 'bb.domain.<domain>.change-available',
  namespace: 'bb',
  routing: 'fire-and-forget',
  description: 'Zipper posts this when the Domain Twin notifies it of a knowledge graph change (via dwell.domain.{twinId}.updated through channel connector). Triggers Cultivator to request the delta.'
})
CREATE (eBbChangeAvailable)-[:HAS_FIELD]->(:TGTField {name: 'domain',  type: 'string', required: true, description: 'Domain identifier'})
CREATE (eBbChangeAvailable)-[:HAS_FIELD]->(:TGTField {name: 'twinId',  type: 'string', required: true, description: 'Domain Twin ID that changed'})

CREATE (mZipper)-[:EMITS]->(eBbChangeAvailable)
CREATE (mCultivator)-[:CONSUMES]->(eBbChangeAvailable)
