/**
 * Answer Agent type definitions.
 *
 * EvaluatedResponse  — a scored and ranked DiscoveryResponse.
 * DwellBBContext     — snapshot of BB state assembled before each evaluation pass.
 * DwellDiscoveryEvaluationPolicy — weight config for the composite scoring formula.
 *
 * @namespace dwell
 * @sig d12-answer-agent.cypher
 */

import type { DwellDiscoveryResponse, DwellGapCluster, DwellMasteryNode } from '../../events/types.js';

// ── MasteryMap ─────────────────────────────────────────────────────────────

/** Per-concept mastery state: conceptId → DwellMasteryNode. */
export type DwellMasteryMap = Record<string, DwellMasteryNode>;

// ── EvaluatedResponse ──────────────────────────────────────────────────────

/**
 * A DiscoveryResponse after scoring and ranking.
 * Carries the original response plus its computed composite score and rank position.
 * Produced by rankResponses(). Satisfies DiscoveryScoringIsAlgorithmic invariant.
 *
 * Invariants:
 *   - score in [0.0, 1.0]
 *   - rank is 1-based
 *   - twinId never empty
 *
 * @sig-node EvaluatedResponse
 */
export interface DwellEvaluatedResponse {
  /** ID of the Domain Twin that produced this response. */
  twinId: string;
  /** The raw DiscoveryResponse from the Domain Twin. */
  response: DwellDiscoveryResponse;
  /** Weighted composite score 0.0–1.0 from scoreDiscoveryResponse(). */
  score: number;
  /** 1-based rank among all evaluated responses (1 = best fit). */
  rank: number;
}

// ── BBContext ──────────────────────────────────────────────────────────────

/**
 * Snapshot of the relevant BB state needed to evaluate discovery responses and
 * bridge candidates. Assembled by the Answer Agent from its internal state
 * before each evaluation pass. Immutable during a single pass.
 *
 * Invariant: sourceDomains never empty when called during active intent.
 *
 * @sig-node BBContext
 */
export interface DwellBBContext {
  /** Current per-concept mastery state (conceptId → DwellMasteryNode). */
  masteryMap: DwellMasteryMap;
  /** Current gap clusters from Surveyor's last post. */
  gapClusters: DwellGapCluster[];
  /** Domain IDs from the learner's prior mastered domains — used for cross-domain match scoring. */
  sourceDomains: string[];
}

// ── DiscoveryEvaluationPolicy ──────────────────────────────────────────────

/**
 * Weight configuration for the composite discovery scoring formula.
 * All weights are sourced from this object — none are hardcoded.
 * Satisfies the DiscoveryScoringIsAlgorithmic invariant.
 *
 * Formula: (coverage × coverageWeight) + (qualityScore × qualityScoreWeight)
 *        + (crossDomainMatch × crossDomainMatchWeight) + (specificity × specificityWeight)
 *
 * @adopt:dwell-discovery-weights
 */
export interface DwellDiscoveryEvaluationPolicy {
  /** Weight for the coverage dimension (0.0–1.0). @adopt:dwell-discovery-weights */
  coverageWeight: number;
  /** Weight for the qualityScore dimension (0.0–1.0). @adopt:dwell-discovery-weights */
  qualityScoreWeight: number;
  /** Weight for the crossDomainMatch dimension (0.0–1.0). @adopt:dwell-discovery-weights */
  crossDomainMatchWeight: number;
  /** Weight for the specificity dimension (0.0–1.0). @adopt:dwell-discovery-weights */
  specificityWeight: number;
}

/**
 * Default discovery evaluation policy weights.
 * @adopt:dwell-discovery-weights  [resolved: coverage=0.35, quality=0.30, crossDomain=0.20, specificity=0.15]
 */
export const DEFAULT_DISCOVERY_POLICY: DwellDiscoveryEvaluationPolicy = {
  coverageWeight:         0.35, // @adopt:dwell-discovery-weights  [resolved: 0.35]
  qualityScoreWeight:     0.30, // @adopt:dwell-discovery-weights  [resolved: 0.30]
  crossDomainMatchWeight: 0.20, // @adopt:dwell-discovery-weights  [resolved: 0.20]
  specificityWeight:      0.15, // @adopt:dwell-discovery-weights  [resolved: 0.15]
};
