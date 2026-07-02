/**
 * item-selector.ts — Pure functions for selecting calibrated assessment items.
 *
 * selectItems — pure: given a request and a bank, returns calibrated items
 *               matching the requested Bloom's level and concept scope.
 *
 * @namespace dwell
 * @sig d17-tester.cypher
 */

import type { AssessmentItem } from './types.js';
import type { DwellAssessmentRequest, DwellAssessmentDeliveredItem } from '../../../events/types.js';

// ── Seam constants ────────────────────────────────────────────────────────────

/**
 * Minimum discrimination index for an item to be preferred during selection.
 * Items with discriminationIndex above this threshold are prioritised.
 */
const MIN_DISCRIMINATION_INDEX = 0.3; // @adopt:dwell-tester-min-discrimination-index  [resolved: 0.3]

// ── Pure functions ─────────────────────────────────────────────────────────────

/**
 * Selects assessment items from the bank matching request.bloomsLevel and
 * request.conceptIds. Prioritises items with discriminationIndex > MIN_DISCRIMINATION_INDEX.
 * Returns up to request.count items (or fewer if the bank is exhausted).
 * Pure — given the same inputs, always returns the same output.
 *
 * @sig-node DwellTester.selectItems
 */
export function selectItems(
  request: DwellAssessmentRequest,
  bank: AssessmentItem[],
): DwellAssessmentDeliveredItem[] {
  const { bloomsLevel, conceptIds, count } = request;
  const conceptSet = new Set(conceptIds);

  // Filter: must match bloomsLevel and at least one requested conceptId
  const eligible = bank.filter(
    (item) =>
      item.bloomsLevel === bloomsLevel &&
      item.conceptIds.some((cid) => conceptSet.has(cid)),
  );

  // Sort: prefer items with discriminationIndex > threshold first, then by difficulty
  const sorted = [...eligible].sort((a, b) => {
    const aPreferred = a.discriminationIndex > MIN_DISCRIMINATION_INDEX ? 1 : 0;
    const bPreferred = b.discriminationIndex > MIN_DISCRIMINATION_INDEX ? 1 : 0;
    if (bPreferred !== aPreferred) return bPreferred - aPreferred;
    // Secondary sort: prefer items closest to 0.5 difficulty (most informative)
    const aDist = Math.abs(a.difficultyScore - 0.5);
    const bDist = Math.abs(b.difficultyScore - 0.5);
    return aDist - bDist;
  });

  // Take up to count items
  const selected = sorted.slice(0, count);

  // Map to inter-twin wire type (DwellAssessmentDeliveredItem)
  return selected.map((item) => ({
    itemId: item.itemId,
    question: item.question,
    bloomsLevel: item.bloomsLevel as DwellAssessmentDeliveredItem['bloomsLevel'],
    conceptIds: item.conceptIds,
    distractors: item.distractors,
    correctAnswer: item.correctAnswer,
  }));
}
