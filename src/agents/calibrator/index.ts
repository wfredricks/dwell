/**
 * DwellCalibrator — the mastery tracker.
 *
 * Initializes per-concept mastery maps from Antiquarian baselines, then
 * updates them on every assessment outcome. Emits mastery events on change.
 *
 * Emits:    bb.mastery.<domain>.initialized (DwellMasteryInitialized)
 *           bb.mastery.<domain>.updated     (DwellMasteryUpdated)
 * Consumes: bb.learner.<domain>.baseline    (pattern: 'bb.learner.*.baseline')
 *           bb.assessment.outcome
 *
 * Invariants (from d06-gap-resolutions G11):
 *   AltitudeNeverRegresses        — bloomsCurrentAltitude is monotonically increasing.
 *   ConfidenceIsTheBidirectionalSignal — confidence increases on correct, decreases on wrong.
 *
 * @namespace dwell
 * @sig d08-calibrator.cypher
 */

import type { DwellDeps } from '../../types.js';
import type {
  DwellLearnerBaseline,
  DwellLearnerBaselineNode,
  DwellAssessmentOutcome,
  DwellMasteryInitialized,
  DwellMasteryUpdated,
  DwellMasteryUpdatedNode,
  DwellMasteryNode,
  DwellMasterySource,
  DwellSignalStrength,
  DwellConfidence,
} from '../../events/types.js';
import { BB } from '../../events/subjects.js';

// ── Seams ─────────────────────────────────────────────────────────────────
const DEFAULT_TARGET_ALTITUDE = 3;      // @adopt:dwell-default-target-altitude  [resolved: 3]
const CONFIDENCE_INCREASE_CERTAIN = 0.15; // @adopt:dwell-confidence-increase-certain  [resolved: 0.15]
const CONFIDENCE_INCREASE_HESITANT = 0.10; // @adopt:dwell-confidence-increase-hesitant  [resolved: 0.10]
const CONFIDENCE_INCREASE_GUESSED = 0.05; // @adopt:dwell-confidence-increase-guessed  [resolved: 0.05]
const CONFIDENCE_DECREASE = 0.10;       // @adopt:dwell-confidence-decrease  [resolved: 0.10]

// Signal strength → initial altitude mapping
// @adopt:dwell-signal-to-altitude  [resolved: strong→4, weak→2, conflicting→2, none→0]
const SIGNAL_TO_ALTITUDE: Readonly<Record<DwellSignalStrength, number>> = {
  'strong':      4,
  'weak':        2,
  'conflicting': 2,
  'none':        0,
} as const;

// Signal strength → initial confidence mapping
// @adopt:dwell-signal-to-confidence  [resolved: strong→0.8, weak→0.3, conflicting→0.4, none→0.0]
const SIGNAL_TO_CONFIDENCE: Readonly<Record<DwellSignalStrength, number>> = {
  'strong':      0.8,
  'weak':        0.3,
  'conflicting': 0.4,
  'none':        0.0,
} as const;

// Signal strength → mastery source mapping
const SIGNAL_TO_SOURCE: Readonly<Record<DwellSignalStrength, DwellMasterySource>> = {
  'strong':      'prior-evidence',
  'weak':        'prior-evidence',
  'conflicting': 'prior-evidence',
  'none':        'no-signal',
} as const;

// ── Internal types ────────────────────────────────────────────────────────

/** Internal per-concept mastery state held by Calibrator. */
interface DwellCalibratorNode {
  conceptId: string;
  bloomsCurrentAltitude: number;
  bloomsTargetAltitude: number;
  confidence: number;   // 0.0–1.0
  source: DwellMasterySource;
}

/** Internal domain mastery map: conceptId → DwellCalibratorNode */
type DwellCalibratorMap = Map<string, DwellCalibratorNode>;

// ── Pure helpers ──────────────────────────────────────────────────────────

/** Clamp a confidence value to [0, 1]. */
function clampConfidence(value: number): number {
  return Math.min(1.0, Math.max(0.0, value));
}

/** Compute altitudeGap: bloomsTargetAltitude − bloomsCurrentAltitude (≥ 0). */
function altitudeGap(node: DwellCalibratorNode): number {
  return Math.max(0, node.bloomsTargetAltitude - node.bloomsCurrentAltitude);
}

/** Confidence delta for a correct assessment outcome based on response confidence. */
function confidenceIncrement(responseConfidence: DwellConfidence): number {
  switch (responseConfidence) {
    case 'certain':  return CONFIDENCE_INCREASE_CERTAIN;
    case 'hesitant': return CONFIDENCE_INCREASE_HESITANT;
    case 'guessed':  return CONFIDENCE_INCREASE_GUESSED;
  }
}

/** Compute overallReadiness: mean of (confidence × currentAlt / targetAlt) across all nodes. */
function computeOverallReadiness(nodes: DwellCalibratorNode[]): number {
  if (nodes.length === 0) return 0;
  const sum = nodes.reduce((acc, n) => {
    const ratio = n.bloomsTargetAltitude > 0
      ? n.bloomsCurrentAltitude / n.bloomsTargetAltitude
      : 0;
    return acc + n.confidence * ratio;
  }, 0);
  return sum / nodes.length;
}

/** Convert an internal node to the DwellMasteryNode payload shape. */
function toMasteryNodePayload(n: DwellCalibratorNode): DwellMasteryNode {
  return {
    conceptId:     n.conceptId,
    confidence:    n.confidence,
    bloomsAltitude: n.bloomsCurrentAltitude as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    source:        n.source,
  };
}

// ── Agent class ───────────────────────────────────────────────────────────

export class DwellCalibrator {
  private readonly unsubscribers: Array<() => void> = [];

  /** In-memory mastery state: domain → concept map. */
  private readonly masteryMaps = new Map<string, DwellCalibratorMap>();

  constructor(private readonly deps: DwellDeps) {}

  /**
   * Register subscriptions for bb.learner.*.baseline and bb.assessment.outcome.
   * @sig-node DwellCalibrator.mount
   */
  mount(): void {
    // Subscribe to bb.learner.*.baseline (wildcard — all domains)
    const unsubBaseline = this.deps.nats.subscribe(BB.LEARNER_BASELINE_PATTERN, async (data) => {
      try {
        await this.handleLearnerBaseline(data as DwellLearnerBaseline);
      } catch (err) {
        // TODO: emit bb.dwell.agent.error when error event type is defined
        console.error('[DwellCalibrator] handleLearnerBaseline failed:', err);
      }
    });
    this.unsubscribers.push(unsubBaseline);

    // Subscribe to bb.assessment.outcome (plain subject)
    const unsubAssessment = this.deps.nats.subscribe(BB.ASSESSMENT_OUTCOME, async (data) => {
      try {
        await this.handleAssessmentOutcome(data as DwellAssessmentOutcome);
      } catch (err) {
        // TODO: emit bb.dwell.agent.error when error event type is defined
        console.error('[DwellCalibrator] handleAssessmentOutcome failed:', err);
      }
    });
    this.unsubscribers.push(unsubAssessment);
  }

  /** Tear down all subscriptions. @sig-node DwellCalibrator.dispose */
  dispose(): void {
    for (const unsub of [...this.unsubscribers].reverse()) unsub();
    this.unsubscribers.length = 0;
  }

  // ── Private handlers ────────────────────────────────────────────────────

  /**
   * Handle bb.learner.<domain>.baseline: initialize a MasteryMap from the baseline.
   * Maps each baseline node to a DwellCalibratorNode using signal-strength mappings.
   * Emits bb.mastery.<domain>.initialized.
   *
   * @sig-node DwellCalibrator.handleLearnerBaseline
   */
  private async handleLearnerBaseline(payload: DwellLearnerBaseline): Promise<void> {
    const { domain, nodes } = payload;

    const conceptMap: DwellCalibratorMap = new Map();
    for (const baselineNode of nodes) {
      const internalNode: DwellCalibratorNode = {
        conceptId:            baselineNode.conceptId,
        bloomsCurrentAltitude: SIGNAL_TO_ALTITUDE[baselineNode.signalStrength],
        bloomsTargetAltitude:  DEFAULT_TARGET_ALTITUDE,
        confidence:            SIGNAL_TO_CONFIDENCE[baselineNode.signalStrength],
        source:                SIGNAL_TO_SOURCE[baselineNode.signalStrength],
      };
      conceptMap.set(baselineNode.conceptId, internalNode);
    }
    this.masteryMaps.set(domain, conceptMap);

    const allNodes = Array.from(conceptMap.values());
    const masteryNodes: DwellMasteryNode[] = allNodes.map(toMasteryNodePayload);
    const overallReadiness = computeOverallReadiness(allNodes);

    const event: DwellMasteryInitialized = {
      domain,
      totalNodes:       masteryNodes.length,
      nodes:            masteryNodes,
      overallReadiness,
      initializedAt:    new Date().toISOString(),
    };

    this.deps.nats.publish(BB.MASTERY_INITIALIZED(domain), event);
  }

  /**
   * Handle bb.assessment.outcome: update MasteryNode confidence and bloomsCurrentAltitude.
   * Enforces AltitudeNeverRegresses (monotonically increasing altitude).
   * Enforces ConfidenceIsTheBidirectionalSignal (bidirectional confidence).
   * Emits bb.mastery.<domain>.updated with changed nodes only.
   *
   * @sig-node DwellCalibrator.handleAssessmentOutcome
   */
  private async handleAssessmentOutcome(payload: DwellAssessmentOutcome): Promise<void> {
    // Assessment outcome has no domain — search all MasteryMaps by conceptId.
    // Collect changes grouped by domain.
    const changesByDomain = new Map<string, DwellMasteryUpdatedNode[]>();

    for (const [domain, conceptMap] of this.masteryMaps) {
      const changedNodes: DwellMasteryUpdatedNode[] = [];

      for (const conceptId of payload.conceptIds) {
        const node = conceptMap.get(conceptId);
        if (!node) continue;

        const prevConfidence = node.confidence;
        const prevAltitude   = node.bloomsCurrentAltitude;

        // Update confidence — bidirectional
        let newConfidence: number;
        if (payload.correct) {
          newConfidence = clampConfidence(
            node.confidence + confidenceIncrement(payload.confidence),
          );
        } else {
          newConfidence = clampConfidence(node.confidence - CONFIDENCE_DECREASE);
        }

        // Update altitude — monotonically increasing (AltitudeNeverRegresses invariant)
        const newAltitude = payload.correct
          ? Math.max(node.bloomsCurrentAltitude, payload.bloomsLevelDemonstrated)
          : node.bloomsCurrentAltitude; // wrong answer never reduces altitude

        // Only record if something actually changed
        if (newConfidence !== prevConfidence || newAltitude !== prevAltitude) {
          // Mutate in place (value is the same object reference in the Map)
          node.confidence            = newConfidence;
          node.bloomsCurrentAltitude = newAltitude;
          // altitudeGap is derived — no field to update; callers recompute via altitudeGap()

          changedNodes.push({
            conceptId,
            confidencePrevious:     prevConfidence,
            confidenceNew:          newConfidence,
            bloomsAltitudePrevious: prevAltitude,
            bloomsAltitudeNew:      newAltitude,
            trigger:                'assessment',
          });
        }
      }

      if (changedNodes.length > 0) {
        changesByDomain.set(domain, changedNodes);
      }
    }

    // Emit bb.mastery.<domain>.updated for each domain that had changes
    for (const [domain, updatedNodes] of changesByDomain) {
      const event: DwellMasteryUpdated = {
        domain,
        updatedNodes,
        updatedAt: new Date().toISOString(),
      };
      this.deps.nats.publish(BB.MASTERY_UPDATED(domain), event);
    }
  }
}
