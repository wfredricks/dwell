/**
 * DwellAntiquarian — the prior-knowledge historian.
 *
 * Reads the learner's evidence record from the graph, aggregates it by
 * concept, and emits a domain baseline that seeds the Calibrator. Keeps
 * an AntiquarianSnapshot ContextNode current on the Blackboard after
 * every baseline update.
 *
 * Emits:    bb.learner.<domain>.baseline (DwellLearnerBaseline)
 * Consumes: bb.intent.declared, bb.cert.<domain>.achieved
 *
 * @namespace dwell
 * @sig d07-antiquarian.cypher
 */

import type { DwellDeps } from '../../types.js';
import type {
  DwellIntentDeclared,
  DwellCertAchieved,
  DwellLearnerBaseline,
  DwellLearnerBaselineNode,
  DwellAntiquarianSnapshot,
  DwellEvidence,
  DwellEvidenceType,
  DwellSignalStrength,
} from '../../events/types.js';
import { BB } from '../../events/subjects.js';

// ── Evidence altitude map ─────────────────────────────────────────────────
// @adopt:dwell-evidence-to-altitude  [resolved: read-about→1, explained→2, applied→3, diagnosed→4, evaluated→5, designed→6]
const EVIDENCE_TO_ALTITUDE: Readonly<Record<DwellEvidenceType, number>> = {
  'read-about': 1,
  'explained':  2,
  'applied':    3,
  'diagnosed':  4,
  'evaluated':  5,
  'designed':   6,
} as const;

// ── Signal strength thresholds ────────────────────────────────────────────
const STRONG_ALTITUDE_THRESHOLD  = 4; // @adopt:dwell-signal-strong-altitude-threshold  [resolved: 4]
const CONFLICTING_SPREAD_THRESHOLD = 3; // @adopt:dwell-conflicting-spread-threshold  [resolved: 3]

// ── Blackboard key ────────────────────────────────────────────────────────
const ANTIQUARIAN_SNAPSHOT_KEY = 'dwell.antiquarian.snapshot'; // @adopt:dwell-antiquarian-snapshot-key  [resolved: 'dwell.antiquarian.snapshot']

// ── Internal helper: map evidence records to altitude ───────────────────

/** @sig-node DwellAntiquarian.mapEvidenceToAltitude */
function mapEvidenceToAltitude(evidence: DwellEvidence): number {
  return EVIDENCE_TO_ALTITUDE[evidence.evidenceType];
}

/** @sig-node DwellAntiquarian.aggregateEvidence */
function aggregateEvidence(evidences: DwellEvidence[]): DwellLearnerBaselineNode[] {
  // Group by conceptId
  const byConceptId = new Map<string, DwellEvidence[]>();
  for (const ev of evidences) {
    const bucket = byConceptId.get(ev.conceptId) ?? [];
    bucket.push(ev);
    byConceptId.set(ev.conceptId, bucket);
  }

  const nodes: DwellLearnerBaselineNode[] = [];
  for (const [conceptId, conceptEvidences] of byConceptId) {
    const altitudes = conceptEvidences.map(mapEvidenceToAltitude);
    const maxAlt = Math.max(...altitudes);
    const minAlt = Math.min(...altitudes);
    const evidenceSources = conceptEvidences.map((ev) => ev.source);

    let signalStrength: DwellSignalStrength;
    if (maxAlt - minAlt >= CONFLICTING_SPREAD_THRESHOLD) {
      signalStrength = 'conflicting';
    } else if (maxAlt >= STRONG_ALTITUDE_THRESHOLD) {
      signalStrength = 'strong';
    } else {
      signalStrength = 'weak';
    }

    nodes.push({ conceptId, signalStrength, evidenceSources });
  }

  return nodes;
}

// ── Agent class ───────────────────────────────────────────────────────────

export class DwellAntiquarian {
  private readonly unsubscribers: Array<() => void> = [];

  constructor(private readonly deps: DwellDeps) {}

  /**
   * Register NATS subscriptions for bb.intent.declared and bb.cert.*.achieved.
   * @sig-node DwellAntiquarian.mount
   */
  mount(): void {
    // Subscribe to bb.intent.declared
    const unsubIntent = this.deps.nats.subscribe(BB.INTENT_DECLARED, async (data) => {
      try {
        await this.handleIntentDeclared(data as DwellIntentDeclared);
      } catch (err) {
        // TODO: emit bb.dwell.agent.error when error event type is defined
        console.error('[DwellAntiquarian] handleIntentDeclared failed:', err);
      }
    });
    this.unsubscribers.push(unsubIntent);

    // Subscribe to bb.cert.*.achieved (wildcard pattern)
    const unsubCert = this.deps.nats.subscribe(BB.CERT_ACHIEVED_PATTERN, async (data) => {
      try {
        await this.handleCertAchieved(data as DwellCertAchieved);
      } catch (err) {
        // TODO: emit bb.dwell.agent.error when error event type is defined
        console.error('[DwellAntiquarian] handleCertAchieved failed:', err);
      }
    });
    this.unsubscribers.push(unsubCert);
  }

  /** Tear down all subscriptions. @sig-node DwellAntiquarian.dispose */
  dispose(): void {
    for (const unsub of [...this.unsubscribers].reverse()) unsub();
    this.unsubscribers.length = 0;
  }

  // ── Private handlers ────────────────────────────────────────────────────

  /**
   * Handle bb.intent.declared: reads evidence for the declared intent domain,
   * aggregates it, and emits bb.learner.<domain>.baseline.
   * @sig-node DwellAntiquarian.handleIntentDeclared
   */
  private async handleIntentDeclared(payload: DwellIntentDeclared): Promise<void> {
    // Treat intent as the domain identifier for evidence lookup.
    // @adopt:dwell-intent-to-domain  [resolved: intent string IS the domain]
    await this.buildAndEmitBaseline(payload.intent);
  }

  /**
   * Handle bb.cert.<domain>.achieved: re-reads evidence for the certified domain
   * and re-emits baseline with updated signals.
   * @sig-node DwellAntiquarian.handleCertAchieved
   */
  private async handleCertAchieved(payload: DwellCertAchieved): Promise<void> {
    await this.buildAndEmitBaseline(payload.domain);
  }

  /**
   * Read evidence from the graph, aggregate by concept, emit baseline, and
   * update the AntiquarianSnapshot on the BB.
   * @sig-node DwellAntiquarian.buildAndEmitBaseline
   */
  private async buildAndEmitBaseline(domain: string): Promise<void> {
    // Read prior knowledge evidence from the graph
    const rawEvidence = (await this.deps.graph.query(
      'MATCH (e:Evidence {conceptDomain: $domain}) RETURN e', // @adopt:dwell-evidence-query  [resolved: match by conceptDomain]
      { domain },
    )) as DwellEvidence[];

    const nodes = aggregateEvidence(rawEvidence);

    const baseline: DwellLearnerBaseline = {
      domain,
      nodes,
      assessedAt: new Date().toISOString(),
    };

    // Emit bb.learner.<domain>.baseline
    this.deps.nats.publish(BB.LEARNER_BASELINE(domain), baseline);

    // Update AntiquarianSnapshot on the Blackboard (G8 resolution)
    const snapshot: DwellAntiquarianSnapshot = {
      domain,
      nodes,
      updatedAt: new Date().toISOString(),
    };
    await this.deps.bb.write(ANTIQUARIAN_SNAPSHOT_KEY, snapshot);
  }
}
