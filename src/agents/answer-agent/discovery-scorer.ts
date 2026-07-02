/**
 * discovery-scorer.ts — pure Tier 0 scoring functions for DiscoveryResponses.
 *
 * All functions are pure (no side effects, no LLM calls). All weights come from
 * a DiscoveryEvaluationPolicy config object — none are hardcoded.
 *
 * Satisfies: DiscoveryScoringIsAlgorithmic invariant (REQ-DW-ARC-03, REQ-DW-ARC-04)
 *
 * @namespace dwell
 * @sig d12-answer-agent.cypher
 */

import type { DwellDiscoveryResponse } from '../../events/types.js';
import type {
  DwellBBContext,
  DwellDiscoveryEvaluationPolicy,
  DwellEvaluatedResponse,
} from './types.js';

// ── Public scoring functions ───────────────────────────────────────────────

/**
 * Compute a weighted composite score for a single DiscoveryResponse.
 *
 * Formula:
 *   score = (coverage × policy.coverageWeight)
 *         + (qualityScore × policy.qualityScoreWeight)
 *         + (crossDomainMatch × policy.crossDomainMatchWeight)
 *         + (specificity × policy.specificityWeight)
 *
 * All weights come from policy. No weights are hardcoded.
 * @adopt:dwell-discovery-weights
 *
 * Pure — no side effects.
 *
 * @sig-node scoreDiscoveryResponse
 */
export function scoreDiscoveryResponse(
  response: DwellDiscoveryResponse,
  sourceDomains: string[],
  policy: DwellDiscoveryEvaluationPolicy,
  intent: string,
): number {
  const coverage        = response.coverage;
  const quality         = response.qualityScore;
  const crossDomain     = computeCrossDomainMatch(response, sourceDomains);
  const specificity     = computeSpecificity(response, intent);

  return (
    coverage    * policy.coverageWeight         // @adopt:dwell-discovery-weights
    + quality   * policy.qualityScoreWeight     // @adopt:dwell-discovery-weights
    + crossDomain * policy.crossDomainMatchWeight // @adopt:dwell-discovery-weights
    + specificity * policy.specificityWeight    // @adopt:dwell-discovery-weights
  );
}

/**
 * Compute the cross-domain match score for a response.
 *
 * Returns a value in [0, 1]: the proportion of the learner's source domains
 * that appear in response.crossDomainSupport. A Domain Twin that explicitly
 * supports the learner's prior domains scores higher.
 *
 * Returns 0 if either sourceDomains or crossDomainSupport is empty.
 *
 * Pure — no side effects.
 *
 * @sig-node computeCrossDomainMatch
 */
export function computeCrossDomainMatch(
  response: DwellDiscoveryResponse,
  sourceDomains: string[],
): number {
  if (sourceDomains.length === 0 || response.crossDomainSupport.length === 0) return 0;

  const supportSet = new Set(response.crossDomainSupport);
  let matchCount = 0;
  for (const domain of sourceDomains) {
    if (supportSet.has(domain)) matchCount++;
  }
  return matchCount / sourceDomains.length;
}

/**
 * Compute how specific the responding Domain Twin is to the declared intent.
 *
 * Returns a value in [0, 1]:
 *   - 1.0: cert-specific twin whose certName is referenced in the intent
 *   - 0.7: general domain twin whose domain is referenced in the intent
 *   - 0.5: cert-specific twin but cert name does not match intent
 *   - 0.3: fallback — no match found
 *
 * Higher score for cert-specific twin on cert-specific intent (e.g. AWS SAA twin
 * for an intent that mentions "SAA" or "Solutions Architect Associate").
 *
 * Pure — no side effects.
 *
 * @sig-node computeSpecificity
 */
export function computeSpecificity(
  response: DwellDiscoveryResponse,
  intent: string,
): number {
  const intentLower = intent.toLowerCase();

  if (response.certName !== null) {
    const certLower = response.certName.toLowerCase();
    // Cert name appears in intent, or intent appears in cert name — strong match
    if (intentLower.includes(certLower) || certLower.includes(intentLower)) {
      return 1.0; // @adopt:dwell-specificity-cert-match  [resolved: 1.0]
    }
    // Cert-specific twin but cert doesn't match the intent — moderate match
    return 0.5;   // @adopt:dwell-specificity-cert-nomatch  [resolved: 0.5]
  }

  // General domain twin — check if the domain is referenced in the intent
  const domainLower = response.domain.toLowerCase();
  if (intentLower.includes(domainLower) || domainLower.includes(intentLower)) {
    return 0.7;   // @adopt:dwell-specificity-domain-match  [resolved: 0.7]
  }

  return 0.3;     // @adopt:dwell-specificity-fallback  [resolved: 0.3]
}

/**
 * Score all responses, sort descending by score, and attach 1-based ranks.
 *
 * Returns an EvaluatedResponse[] sorted so rank 1 (best fit) comes first.
 * Pure — no side effects.
 *
 * @sig-node rankResponses
 */
export function rankResponses(
  responses: DwellDiscoveryResponse[],
  bbContext: DwellBBContext,
  policy: DwellDiscoveryEvaluationPolicy,
  intent: string,
): DwellEvaluatedResponse[] {
  const scored = responses.map((response) => ({
    response,
    score: scoreDiscoveryResponse(response, bbContext.sourceDomains, policy, intent),
  }));

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  return scored.map((item, index) => ({
    twinId: item.response.twinId,
    response: item.response,
    score: item.score,
    rank: index + 1, // 1-based
  }));
}
