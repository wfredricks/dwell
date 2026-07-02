/**
 * outcome-accumulator.ts — Accumulates anonymized outcome signals for analytics.
 *
 * accumulate — accumulates outcome signals for item effectiveness analytics.
 *              NO PII is stored — only itemId, bloom level, and correctness.
 *
 * @namespace dwell
 * @sig d17-tester.cypher
 */

import type { DwellOutcomeSignal } from '../../../events/types.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Anonymized accumulator record for a single item.
 * No learner identity, no user-linkable data.
 *
 * Invariant: correctCount always <= totalCount.
 */
export interface ItemOutcomeRecord {
  /** Item this record belongs to */
  itemId: string;
  /** Number of correct responses recorded */
  correctCount: number;
  /** Total outcome signals received for this item */
  totalCount: number;
  /** Bloom's level at which interactions occurred (for calibration context) */
  bloomsLevels: number[];
}

/**
 * Outcome store — keyed by itemId.
 * Passed in by the agent; accumulate() mutates it in place.
 */
export type OutcomeStore = Map<string, ItemOutcomeRecord>;

// ── Effect functions ───────────────────────────────────────────────────────────

/**
 * Accumulates an anonymized outcome signal into the store.
 *
 * Only signals with a non-null itemId are accumulated (item-level calibration).
 * No PII is stored — only itemId, bloomsLevel, and whether the answer was correct.
 *
 * Effect — mutates the store.
 *
 * @sig-node DwellTester.accumulate
 */
export function accumulate(signal: DwellOutcomeSignal, store: OutcomeStore): void {
  // Only accumulate item-level outcomes
  if (!signal.itemId) return;

  const existing = store.get(signal.itemId);
  const isCorrect = signal.outcome === 'correct';

  if (existing) {
    existing.totalCount += 1;
    if (isCorrect) existing.correctCount += 1;
    existing.bloomsLevels.push(signal.bloomsAltitudeAtInteraction);
  } else {
    store.set(signal.itemId, {
      itemId: signal.itemId,
      correctCount: isCorrect ? 1 : 0,
      totalCount: 1,
      bloomsLevels: [signal.bloomsAltitudeAtInteraction],
    });
  }
}
