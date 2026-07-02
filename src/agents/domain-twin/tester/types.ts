/**
 * DwellTester internal types.
 *
 * AssessmentItem — an item in the Tester's item bank (richer than the inter-twin wire type).
 * AssessmentBank — interface for a collection of items the Tester can select from.
 *
 * @namespace dwell
 * @sig d17-tester.cypher
 */

/**
 * A single assessment item in the Tester's item bank.
 * Immutable after creation. Carries a discriminationIndex derived from calibration records.
 *
 * Invariants:
 *   - bloomsLevel always 1–6
 *   - difficultyScore always 0–1
 *   - distractors always non-empty
 */
export interface AssessmentItem {
  /** Unique item identifier */
  itemId: string;
  /** Question text */
  question: string;
  /** Bloom's cognitive level 1–6 this item targets */
  bloomsLevel: number;
  /** Concepts this item assesses */
  conceptIds: string[];
  /** Incorrect answer options (non-empty) */
  distractors: string[];
  /** The correct answer */
  correctAnswer: string;
  /** Difficulty score 0–1 based on calibration history */
  difficultyScore: number;
  /**
   * Discrimination index: proportion correct among high-mastery learners
   * minus proportion correct among low-mastery learners. Range [-1, 1].
   */
  discriminationIndex: number;
}

/**
 * Interface for a collection of assessment items the Tester can select from.
 * Domain Twin implementations provide their own in-memory or persistent bank.
 */
export interface AssessmentBank {
  getItems(): AssessmentItem[];
}
