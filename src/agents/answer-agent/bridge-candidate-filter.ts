/**
 * bridge-candidate-filter.ts — pure pre-filter for bridge card candidates.
 *
 * Eliminates or ranks bridge card candidates before Bridge personalizes them.
 * Uses BBContext (mastery + gap clusters + source domains) to find the single
 * best-fit generic card.
 *
 * Satisfies: REQ-DW-BRG-03
 *
 * @namespace dwell
 * @sig d12-answer-agent.cypher
 */

import type { DwellBridgeCandidate } from '../../events/types.js';
import type { DwellBBContext } from './types.js';

// ── Scoring constants ──────────────────────────────────────────────────────

/** Extra score added when the candidate's targetConcept is in an active gap cluster. */
const GAP_OVERLAP_BONUS = 0.25; // @adopt:dwell-bridge-gap-bonus  [resolved: 0.25]

/** Weight applied to profileClusterMatch when computing the composite filter score. */
const PROFILE_MATCH_WEIGHT = 0.3; // @adopt:dwell-bridge-profile-weight  [resolved: 0.3]

// ── selectBestBridgeCandidate ──────────────────────────────────────────────

/**
 * Select the single best-fit bridge card candidate for Bridge to personalize.
 *
 * Scoring:
 *   composite = effectivenessScore
 *             + (profileClusterMatch × PROFILE_MATCH_WEIGHT)   ← source domain alignment
 *             + (GAP_OVERLAP_BONUS if targetConcept in active gap cluster)
 *
 * Returns null when candidates is empty.
 *
 * Pure — no side effects.
 *
 * @sig-node selectBestBridgeCandidate
 */
export function selectBestBridgeCandidate(
  candidates: DwellBridgeCandidate[],
  context: DwellBBContext,
): DwellBridgeCandidate | null {
  if (candidates.length === 0) return null;

  // Build a fast-lookup set of active gap concept IDs
  const gapConceptIds = new Set<string>(
    context.gapClusters.flatMap((cluster) => cluster.conceptIds),
  );

  // Score each candidate
  const scored = candidates.map((candidate) => {
    let score = candidate.effectivenessScore;

    // Bonus when the target concept is in an active gap (highest-priority bridge)
    if (gapConceptIds.has(candidate.targetConcept)) {
      score += GAP_OVERLAP_BONUS; // @adopt:dwell-bridge-gap-bonus
    }

    // Factor in how well the candidate's source domain profile matches the learner
    score += candidate.profileClusterMatch * PROFILE_MATCH_WEIGHT; // @adopt:dwell-bridge-profile-weight

    return { candidate, score };
  });

  // Sort descending and return the best
  scored.sort((a, b) => b.score - a.score);
  return scored[0].candidate;
}
