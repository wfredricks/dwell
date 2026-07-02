/**
 * DwellTester — generates calibrated assessment items for the Personal Twin.
 *
 * Serves assessment items from a Domain Twin–owned item bank on request.
 * Accumulates anonymized outcome signals for item calibration over time.
 * The Personal Twin never generates assessment items — all items originate here.
 *
 * Tier: Domain — instantiated by Domain Twin implementations,
 * NOT by mountDwell() in the Personal Twin.
 *
 * Consumes:
 *   dwell.{twinId}.assessment.request — deliver calibrated items at requested Bloom's level
 *   dwell.{twinId}.outcome.signal     — accumulate anonymized signals for internal analytics
 *
 * Emits:
 *   dwell.{userId}.assessment.delivered — calibrated items with distractors and correct answers
 *
 * @namespace dwell
 * @sig d17-tester.cypher
 */

import type { DwellDeps } from '../../../types.js';
import { DWELL } from '../../../events/subjects.js';
import type {
  DwellAssessmentRequest,
  DwellAssessmentDelivered,
  DwellOutcomeSignal,
} from '../../../events/types.js';
import type { AssessmentItem } from './types.js';
import { selectItems } from './item-selector.js';
import { accumulate, type OutcomeStore } from './outcome-accumulator.js';

export type { AssessmentItem, AssessmentBank } from './types.js';
export { selectItems } from './item-selector.js';
export { accumulate } from './outcome-accumulator.js';
export type { ItemOutcomeRecord, OutcomeStore } from './outcome-accumulator.js';

// ── Identity ──────────────────────────────────────────────────────────────────

export interface DwellTesterIdentity {
  /** Stable twinId — matches the twinId used in dwell.* NATS subjects. */
  twinId: string;
}

// ── Agent ─────────────────────────────────────────────────────────────────────

export class DwellTester {
  private readonly unsubscribers: Array<() => void> = [];

  /** The item bank — provided by the Domain Twin implementation at construction. */
  private readonly bank: AssessmentItem[];

  /** Anonymized outcome accumulator store — keyed by itemId. */
  private readonly outcomeStore: OutcomeStore = new Map();

  /**
   * @param deps     — Dwell dependencies (nats, bb, graph, zipper)
   * @param identity — twinId for this Domain Twin
   * @param bank     — initial item bank; Domain Twin implementations populate this
   */
  constructor(
    private readonly deps: DwellDeps,
    private readonly identity: DwellTesterIdentity,
    bank: AssessmentItem[] = [],
  ) {
    this.bank = [...bank];
  }

  /**
   * Register all NATS subscriptions.
   * Called by Domain Twin implementations at startup.
   */
  mount(): void {
    const { twinId } = this.identity;

    // Subscribe to DWELL.TWIN_ASSESSMENT_REQUEST(twinId)
    const unsubAssessment = this.deps.nats.subscribe(
      DWELL.TWIN_ASSESSMENT_REQUEST(twinId),
      (data) => {
        try {
          this.handleAssessmentRequest(data as DwellAssessmentRequest);
        } catch (err) {
          console.error('[DwellTester] handleAssessmentRequest failed:', err);
        }
      },
    );
    this.unsubscribers.push(unsubAssessment);

    // Subscribe to DWELL.TWIN_OUTCOME_SIGNAL(twinId)
    const unsubOutcome = this.deps.nats.subscribe(
      DWELL.TWIN_OUTCOME_SIGNAL(twinId),
      (data) => {
        try {
          this.handleOutcomeSignal(data as DwellOutcomeSignal);
        } catch (err) {
          console.error('[DwellTester] handleOutcomeSignal failed:', err);
        }
      },
    );
    this.unsubscribers.push(unsubOutcome);
  }

  /**
   * Tear down all subscriptions.
   * Called by Domain Twin implementations at shutdown.
   */
  dispose(): void {
    for (const unsub of [...this.unsubscribers].reverse()) {
      unsub();
    }
    this.unsubscribers.length = 0;
  }

  // ── Private handlers ──────────────────────────────────────────────────────────

  /**
   * Handle an assessment request — select calibrated items and deliver them.
   *
   * Selects items from the bank using selectItems(), then publishes
   * DwellAssessmentDelivered to DWELL.USER_ASSESSMENT_DELIVERED(userId).
   *
   * The userId is derived from the request payload's replyTo field if present,
   * or falls back to the twinId as a proxy when the userId is not provided.
   *
   * @sig-node DwellTester.handleAssessmentRequest
   */
  private handleAssessmentRequest(request: DwellAssessmentRequest): void {
    const items = selectItems(request, this.bank);

    // Derive the userId delivery subject. In production the request carries
    // a replyTo subject; here we publish to USER_ASSESSMENT_DELIVERED using the
    // twinId as a proxy when the userId isn't embedded.
    // @adopt:dwell-tester-reply-subject  [resolved: DWELL.USER_ASSESSMENT_DELIVERED(twinId)]
    const replySubject = DWELL.USER_ASSESSMENT_DELIVERED(this.identity.twinId);

    const payload: DwellAssessmentDelivered = {
      twinId: this.identity.twinId,
      items,
    };

    this.deps.nats.publish(replySubject, payload);
  }

  /**
   * Handle an outcome signal — accumulate it for item effectiveness analytics.
   * Fire-and-forget — no response is published. No PII stored.
   *
   * @sig-node DwellTester.handleOutcomeSignal
   */
  private handleOutcomeSignal(signal: DwellOutcomeSignal): void {
    accumulate(signal, this.outcomeStore);
  }
}
