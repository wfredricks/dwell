/**
 * DwellCultivatorPersonal — tracks subject-level growth signals over time.
 *
 * Accumulates evidence of progress from assessments, attention outcomes,
 * mastery advances, and certification achievements. Emits growth
 * acknowledgment and milestone celebration surfacings when thresholds
 * are crossed.
 *
 * Consumes: bb.assessment.outcome, bb.attention.outcome,
 *           bb.mastery.<domain>.updated (pattern: 'bb.mastery.*.updated'),
 *           bb.cert.<domain>.achieved   (pattern: 'bb.cert.*.achieved')
 * Emits:    bb.attention.surfaced
 *
 * @namespace dwell
 * @sig d13-cultivator-personal.cypher
 */

import type { DwellDeps } from '../../types.js';
import {
  BB,
} from '../../events/subjects.js';
import type {
  DwellAssessmentOutcome,
  DwellAttentionOutcome,
  DwellMasteryUpdated,
  DwellCertAchieved,
  DwellAttentionSurfaced,
} from '../../events/types.js';

// ── Seam constants ───────────────────────────────────────────────────────────

/** Minimum confidence level on a mastery node that triggers a growth acknowledgment. */
const CONFIDENCE_THRESHOLD = 0.85; // @adopt:dwell-cultivator-confidence-threshold  [resolved: 0.85]

/** BB key for persisted growth state. */
const STATE_KEY = 'dwell.cultivator-personal.state'; // @adopt:dwell-cultivator-state-key  [resolved: dwell.cultivator-personal.state]

// ── Internal state types ─────────────────────────────────────────────────────

/** A recorded certification milestone. */
interface DwellCultivatorMilestone {
  domain: string;
  certName: string;
  achievedAt: string; // ISO8601
}

/** Per-domain assessment trend accumulator. */
interface DwellDomainTrend {
  domain: string;
  correctCount: number;
  totalCount: number;
  /** concept-level correct counts */
  conceptCorrect: Record<string, number>;
}

/** Engagement record for an attention item. */
interface DwellEngagementRecord {
  itemId: string;
  itemType: string;
  response: string;
  respondedAt: string; // ISO8601
}

/** Full growth state persisted to BB. */
interface DwellCultivatorPersonalState {
  milestones: DwellCultivatorMilestone[];
  trends: Record<string, DwellDomainTrend>;
  engagement: DwellEngagementRecord[];
  lastUpdated: string; // ISO8601
}

// ── Agent ────────────────────────────────────────────────────────────────────

export class DwellCultivatorPersonal {
  private readonly unsubscribers: Array<() => void> = [];

  private milestones: DwellCultivatorMilestone[] = [];
  private trends: Record<string, DwellDomainTrend> = {};
  private engagement: DwellEngagementRecord[] = [];

  constructor(private readonly deps: DwellDeps) {}

  /** Register all NATS subscriptions. Called by mountDwell(). */
  mount(): void {
    // Subscribe: bb.assessment.outcome
    const unsubAssessment = this.deps.nats.subscribe(
      BB.ASSESSMENT_OUTCOME,
      (data) => {
        try {
          this.handleAssessmentOutcome(data as DwellAssessmentOutcome);
        } catch (err) {
          console.error('[DwellCultivatorPersonal] handleAssessmentOutcome failed:', err);
        }
      },
    );
    this.unsubscribers.push(unsubAssessment);

    // Subscribe: bb.attention.outcome
    const unsubAttention = this.deps.nats.subscribe(
      BB.ATTENTION_OUTCOME,
      (data) => {
        try {
          this.handleAttentionOutcome(data as DwellAttentionOutcome);
        } catch (err) {
          console.error('[DwellCultivatorPersonal] handleAttentionOutcome failed:', err);
        }
      },
    );
    this.unsubscribers.push(unsubAttention);

    // Subscribe: bb.mastery.*.updated  (wildcard — all domains)
    const MASTERY_PATTERN = 'bb.mastery.*.updated'; // @adopt:dwell-cultivator-mastery-pattern  [resolved: bb.mastery.*.updated]
    const unsubMastery = this.deps.nats.subscribe(
      MASTERY_PATTERN,
      (data) => {
        try {
          this.handleMasteryUpdated(data as DwellMasteryUpdated);
        } catch (err) {
          console.error('[DwellCultivatorPersonal] handleMasteryUpdated failed:', err);
        }
      },
    );
    this.unsubscribers.push(unsubMastery);

    // Subscribe: bb.cert.*.achieved  (wildcard — all domains)
    const CERT_PATTERN = 'bb.cert.*.achieved'; // @adopt:dwell-cultivator-cert-pattern  [resolved: bb.cert.*.achieved]
    const unsubCert = this.deps.nats.subscribe(
      CERT_PATTERN,
      (data) => {
        try {
          this.handleCertAchieved(data as DwellCertAchieved);
        } catch (err) {
          console.error('[DwellCultivatorPersonal] handleCertAchieved failed:', err);
        }
      },
    );
    this.unsubscribers.push(unsubCert);
  }

  /** Tear down all subscriptions. Called by DwellHandle.dispose(). */
  dispose(): void {
    for (const unsub of [...this.unsubscribers].reverse()) {
      unsub();
    }
    this.unsubscribers.length = 0;
  }

  // ── Private Handlers ────────────────────────────────────────────────────────

  /**
   * Accumulate correct answers per domain/concept for trend tracking.
   * @sig-node DwellCultivatorPersonal.handleAssessmentOutcome
   */
  private handleAssessmentOutcome(event: DwellAssessmentOutcome): void {
    // Derive domain key from conceptIds (first concept prefix or fall back to 'unknown')
    const domain = this.domainFromConcepts(event.conceptIds);

    if (!this.trends[domain]) {
      this.trends[domain] = {
        domain,
        correctCount: 0,
        totalCount: 0,
        conceptCorrect: {},
      };
    }

    const trend = this.trends[domain];
    trend.totalCount += 1;

    if (event.correct) {
      trend.correctCount += 1;
      for (const conceptId of event.conceptIds) {
        trend.conceptCorrect[conceptId] = (trend.conceptCorrect[conceptId] ?? 0) + 1;
      }
    }

    this.persistState();
  }

  /**
   * Update engagement records — what the subject engaged with, dismissed, etc.
   * @sig-node DwellCultivatorPersonal.handleAttentionOutcome
   */
  private handleAttentionOutcome(event: DwellAttentionOutcome): void {
    this.engagement.push({
      itemId: event.itemId,
      itemType: event.itemType,
      response: event.response,
      respondedAt: event.respondedAt,
    });

    this.persistState();
  }

  /**
   * Check if any updated mastery nodes crossed the confidence threshold.
   * If so, emit bb.attention.surfaced with a growth acknowledgment.
   * @sig-node DwellCultivatorPersonal.handleMasteryUpdated
   */
  private handleMasteryUpdated(event: DwellMasteryUpdated): void {
    const crossedThreshold = event.updatedNodes.some(
      (node) =>
        node.confidencePrevious < CONFIDENCE_THRESHOLD &&
        node.confidenceNew >= CONFIDENCE_THRESHOLD,
    );

    if (crossedThreshold) {
      const payload: DwellAttentionSurfaced = {
        itemType: 'brief',
        itemId: `growth-ack-${event.domain}-${Date.now()}`,
        mode: 'growth-acknowledgment',
        surfacedAt: new Date().toISOString(),
      };
      this.deps.nats.publish(BB.ATTENTION_SURFACED, payload);
    }

    this.persistState();
  }

  /**
   * Record a certification milestone and emit a milestone celebration surfacing.
   * @sig-node DwellCultivatorPersonal.handleCertAchieved
   */
  private handleCertAchieved(event: DwellCertAchieved): void {
    const milestone: DwellCultivatorMilestone = {
      domain: event.domain,
      certName: event.certName,
      achievedAt: event.achievedAt,
    };
    this.milestones.push(milestone);

    const payload: DwellAttentionSurfaced = {
      itemType: 'brief',
      itemId: `milestone-${event.domain}-${Date.now()}`,
      mode: 'milestone-celebration',
      surfacedAt: new Date().toISOString(),
    };
    this.deps.nats.publish(BB.ATTENTION_SURFACED, payload);

    this.persistState();
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  /**
   * Persist the current growth state to BB.
   * Errors are caught and logged; persistence failures must not propagate to subscription handlers.
   * @sig-node DwellCultivatorPersonal.persistState
   */
  private persistState(): void {
    const state: DwellCultivatorPersonalState = {
      milestones: this.milestones,
      trends: this.trends,
      engagement: this.engagement,
      lastUpdated: new Date().toISOString(),
    };
    this.deps.bb.write(STATE_KEY, state).catch((err) => {
      console.error('[DwellCultivatorPersonal] persistState failed:', err);
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Derive a domain key from an array of concept IDs.
   * Concepts are expected to follow the convention "<domain>/<concept>" or
   * just use the first concept as a proxy domain label. Falls back to 'unknown'.
   */
  private domainFromConcepts(conceptIds: string[]): string {
    if (conceptIds.length === 0) return 'unknown';
    const first = conceptIds[0];
    const slashIdx = first.indexOf('/');
    return slashIdx > 0 ? first.slice(0, slashIdx) : first;
  }
}
