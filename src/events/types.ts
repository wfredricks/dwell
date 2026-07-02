/**
 * Dwell Event Payload Types
 *
 * TypeScript interfaces for every bb.* and dwell.* event payload.
 * Derived from DWELL-EVENT-ARCHITECTURE.md.
 *
 * Sections mirror the architecture doc:
 *   Part 1 — Intra-Twin (bb.*)
 *   Part 2 — Inter-Twin (dwell.*)
 *
 * @namespace dwell
 * @adopt:dwell-event-schema-version  [resolved: 1.0.0]
 */

// ── Common Types ──────────────────────────────────────────────────────────

/** Evidence type — maps directly to a Bloom's altitude. read-about→1, explained→2, applied→3, diagnosed→4, evaluated→5, designed→6. */
export type DwellEvidenceType = 'read-about' | 'explained' | 'applied' | 'diagnosed' | 'evaluated' | 'designed';

/** A single piece of evidence from a learner's history with a concept. */
export interface DwellEvidence {
  evidenceId: string;
  /** Specific concept node ID from the domain knowledge graph */
  conceptId: string;
  /** High-level domain, e.g. "IAM", "EC2", "nuclear-safety" */
  conceptDomain: string;
  evidenceType: DwellEvidenceType;
  source: string;
  occurredAt: string; // ISO8601
}

/** Bloom's Taxonomy altitude (1=Remember → 6=Create) */
export type DwellBloomsLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type DwellSignalStrength = 'strong' | 'weak' | 'none' | 'conflicting';
export type DwellGapType = 'knowledge' | 'drift' | 'bridge' | 'convergent-misconception';
export type DwellPriority = 'high' | 'medium' | 'low';
export type DwellAttentionResponse = 'engaged' | 'thanked' | 'later' | 'dismissed';
export type DwellInteractionType = 'learning-node' | 'bridge-card' | 'assessment-item' | 'methodology';
export type DwellOutcome = DwellAttentionResponse | 'correct' | 'incorrect';
export type DwellConfidence = 'certain' | 'hesitant' | 'guessed';
export type DwellChangeType = 'added' | 'deprecated' | 'modified' | 'reweighted';
export type DwellChangeSeverity = 'minor' | 'major';
export type DwellEdgeType = 'prerequisite' | 'reinforces' | 'contrasts';
export type DwellBridgeOrigin = 'domain-twin-generic' | 'personal-twin-synthesized';
export type DwellLearnerState = 'plateau' | 'confused' | 'slow';
export type DwellPreferenceType = 'path-order' | 'methodology' | 'batch-start';

// ── Part 1: Intra-Twin Event Payloads (bb.*) ──────────────────────────────

// Antiquarian ──────────────────────────────────────────────────────────────

/**
 * AntiquarianSnapshot — ContextNode written to the Blackboard after each baseline update.
 * Key: 'dwell.antiquarian.snapshot'. Consumed by Bridge and other agents via BB;
 * no agent calls Antiquarian directly (G8 resolution).
 */
export interface DwellAntiquarianSnapshot {
  domain: string;
  nodes: DwellLearnerBaselineNode[];
  updatedAt: string; // ISO8601
}

// Intent & Lifecycle ───────────────────────────────────────────────────────

export interface DwellIntentDeclared {
  intent: string;
  declaredAt: string; // ISO8601
}

export interface DwellCertAchieved {
  domain: string;
  certName: string;
  achievedAt: string; // ISO8601
  validatedExternally: boolean;
}

// Learner Model ────────────────────────────────────────────────────────────

export interface DwellLearnerBaselineNode {
  conceptId: string;
  signalStrength: DwellSignalStrength;
  evidenceSources: string[];
}

export interface DwellLearnerBaseline {
  domain: string;
  nodes: DwellLearnerBaselineNode[];
  assessedAt: string; // ISO8601
}

export interface DwellLearnerPreferencesUpdated {
  preferenceType: DwellPreferenceType;
  value: string;
  context: string;
}

// Mastery ──────────────────────────────────────────────────────────────────

export type DwellMasterySource = 'prior-evidence' | 'partial-credit' | 'no-signal';

export interface DwellMasteryNode {
  conceptId: string;
  confidence: number;       // 0.0–1.0
  bloomsAltitude: DwellBloomsLevel;
  source: DwellMasterySource;
}

export interface DwellMasteryInitialized {
  domain: string;
  totalNodes: number;
  nodes: DwellMasteryNode[];
  overallReadiness: number; // 0.0–1.0
  initializedAt: string;   // ISO8601
}

export interface DwellMasteryUpdatedNode {
  conceptId: string;
  confidencePrevious: number;
  confidenceNew: number;
  bloomsAltitudePrevious: number;
  bloomsAltitudeNew: number;
  trigger: 'learning-interaction' | 'assessment' | 'bridge-engagement';
}

export interface DwellMasteryUpdated {
  domain: string;
  updatedNodes: DwellMasteryUpdatedNode[]; // only changed nodes
  updatedAt: string; // ISO8601
}

// Gaps ─────────────────────────────────────────────────────────────────────

export interface DwellGapCluster {
  clusterId: string;
  label: string;
  gapType: DwellGapType;
  conceptIds: string[];
  priority: DwellPriority;
  examWeight: number; // 0.0–1.0
}

export interface DwellGaps {
  domain: string;
  clusters: DwellGapCluster[];
  assessedAt: string; // ISO8601
}

// same shape for initial, updated, and post-cert
export type DwellGapsInitial = DwellGaps;
export type DwellGapsUpdated = DwellGaps;
export type DwellGapsPostCert = DwellGaps;

// Path ─────────────────────────────────────────────────────────────────────

export interface DwellPathNode {
  conceptId: string;
  batchId: string | null;
  estimatedSessions: number;
  methodology: string | null;
}

export interface DwellPathReady {
  domain: string;
  sequence: DwellPathNode[];
  generatedAt: string; // ISO8601
}

export interface DwellPathUpdated extends DwellPathReady {
  updateReason: string;
}

// Bridge ───────────────────────────────────────────────────────────────────

export interface DwellCalibratorSignal {
  confidenceCurrent: number;
  visitsCount: number;
  plateauDuration: string; // e.g. "18min"
}

export interface DwellBridgeRequested {
  domain: string;
  conceptIds: string[];
  learnerState: DwellLearnerState;
  calibratorSignal: DwellCalibratorSignal;
  requestedAt: string; // ISO8601
}

export interface DwellBridgeCard {
  body: string;
  origin: DwellBridgeOrigin;
}

export interface DwellBridgeReady {
  domain: string;
  conceptIds: string[];
  sourceAnchor: string;
  bridgeType: string;
  card: DwellBridgeCard;
  readyAt: string; // ISO8601
}

// Assessment ───────────────────────────────────────────────────────────────

export interface DwellAssessmentItem {
  itemId: string;
  question: string;
  bloomsLevel: DwellBloomsLevel;
  conceptIds: string[];
}

export interface DwellAssessmentDiagnostic {
  topic: string;
  items: DwellAssessmentItem[];
}

export interface DwellAssessmentOutcome {
  itemId: string;
  conceptIds: string[];
  bloomsLevelDemonstrated: number;
  correct: boolean;
  responseTimeMs: number;
  confidence: DwellConfidence;
}

// Attention (Donna) ────────────────────────────────────────────────────────

export type DwellSurfacedItemType = 'bridge-card' | 'gap-item' | 'brief' | 'learning-node';

export interface DwellAttentionSurfaced {
  itemType: DwellSurfacedItemType;
  itemId: string;
  mode: string;
  surfacedAt: string; // ISO8601
}

export interface DwellAttentionOutcome {
  itemId: string;
  itemType: string;
  response: DwellAttentionResponse;
  noteAdded: string | null;
  respondedAt: string; // ISO8601
}

// Domain Currency ──────────────────────────────────────────────────────────

export interface DwellDomainChange {
  conceptId: string;
  changeType: DwellChangeType;
  examWeightDelta: number | null;
  severity: DwellChangeSeverity;
}

export interface DwellDomainUpdated {
  domain: string;
  changes: DwellDomainChange[];
  detectedAt: string; // ISO8601
}

export interface DwellStalenessWatchActive {
  domain: string;
  certName: string;
  achievedAt: string;  // ISO8601
  firstReviewAt: string; // ISO8601
}

// ── Part 2: Inter-Twin Event Payloads (dwell.*) ───────────────────────────

// Discovery ────────────────────────────────────────────────────────────────

export interface DwellSourceKnowledge {
  domain: string;
  masteryLevel: number; // 0.0–1.0
  validated: boolean;
}

export interface DwellBroadcastDiscovery {
  replyTo: string;        // "dwell.{userId}.discovery.response" — the only userId in inter-twin payloads
  intent: string;
  sourceKnowledge: DwellSourceKnowledge[];
  requestedAt: string;   // ISO8601
  timeoutMs: number;
}

export interface DwellDiscoveryResponse {
  twinId: string;
  domain: string;
  certName: string | null;
  coverage: number;        // 0.0–1.0
  qualityScore: number;    // 0.0–1.0
  crossDomainSupport: string[];
  version: string;
}

export interface DwellDomainGap {
  intent: string;
  timeoutMs: number;
  requestedAt: string; // ISO8601
}

// Knowledge Graph ──────────────────────────────────────────────────────────

export interface DwellLearnerBaselineRef {
  domain: string;
  masteryNodes: { conceptId: string; confidence: number; bloomsAltitude: number }[];
}

export interface DwellKgRequest {
  learnerBaseline: DwellLearnerBaselineRef[];
}

export interface DwellKgNode {
  conceptId: string;
  label: string;
  bloomsTargetAltitude: DwellBloomsLevel;
  examWeight: number; // 0.0–1.0
  crossDomainEquivalents: {
    domain: string;
    conceptId: string;
    similarityScore: number;
    deltaNote: string | null;
  }[];
}

export interface DwellKgEdge {
  from: string;
  to: string;
  relationshipType: DwellEdgeType;
}

export interface DwellCuratedBatch {
  batchId: string;
  label: string;
  conceptIds: string[];
  teachTogetherReason: string;
}

export interface DwellMisconception {
  misconceptionId: string;
  conceptIds: string[];
  sourceDomain: string | null;
  description: string;
}

export interface DwellKgDelivered {
  twinId: string;
  domain: string;
  graph: {
    nodes: DwellKgNode[];
    edges: DwellKgEdge[];
  };
  curatedBatches: DwellCuratedBatch[];
  misconceptionCatalog: DwellMisconception[];
}

// Bridge Query ─────────────────────────────────────────────────────────────

export interface DwellBridgeQuery {
  targetConceptIds: string[];
  sourceDomains: { domain: string; masteryLevel: number }[];
}

export interface DwellBridgeCandidate {
  bridgeId: string;
  bridgeType: string;
  sourceAnchor: string;
  targetConcept: string;
  genericText: string;
  effectivenessScore: number;
  profileClusterMatch: number;
}

export interface DwellBridgeResponse {
  twinId: string;
  targetConceptIds: string[];
  candidates: DwellBridgeCandidate[];
}

// Assessment (inter-twin) ──────────────────────────────────────────────────

export interface DwellAssessmentRequest {
  conceptIds: string[];
  bloomsLevel: DwellBloomsLevel;
  count: number;
  masteryContext: { conceptId: string; currentConfidence: number }[];
}

export interface DwellAssessmentDeliveredItem {
  itemId: string;
  question: string;
  bloomsLevel: DwellBloomsLevel;
  conceptIds: string[];
  distractors: string[];
  correctAnswer: string;
}

export interface DwellAssessmentDelivered {
  twinId: string;
  items: DwellAssessmentDeliveredItem[];
}

// Outcome Signal ───────────────────────────────────────────────────────────

export interface DwellOutcomeSignal {
  conceptId: string;
  interactionType: DwellInteractionType;
  bridgeId: string | null;
  itemId: string | null;
  sourceDomains: string[];
  outcome: DwellOutcome;
  bloomsAltitudeAtInteraction: DwellBloomsLevel;
  occurredAt: string; // ISO8601
}

// Domain Currency (inter-twin) ─────────────────────────────────────────────

export interface DwellDomainUpdatedBroadcast {
  twinId: string;
  domain: string;
  notifiedAt: string; // ISO8601
}

export interface DwellUpdateRequest {
  sinceVersion: string;
}

export interface DwellAffectedConcept {
  conceptId: string;
  changeType: DwellChangeType;
  severity: DwellChangeSeverity;
  changeNote: string;
}

export interface DwellUpdateDelivered {
  twinId: string;
  domain: string;
  fromVersion: string;
  toVersion: string;
  affectedConcepts: DwellAffectedConcept[];
  deliveredAt: string; // ISO8601
}

// Lifecycle ────────────────────────────────────────────────────────────────

export interface DwellMounted {
  version: string;
  timestamp: string; // ISO8601
}

export interface DwellUnmounted {
  timestamp: string; // ISO8601
}
