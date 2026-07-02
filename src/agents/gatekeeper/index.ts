/**
 * DwellGatekeeper — readiness gate before Domain Twin calls.
 *
 * Maintains internal readiness state from gap clusters and learner preferences.
 * Exposes checkReadiness() for point-in-time query.
 * Automatically fires bb.bridge.requested when a domain transitions from
 * not-ready to ready.
 *
 * Emits:   bb.bridge.requested  (DwellBridgeRequested)
 * Consumes: bb.gaps.<domain>.initial         (DwellGapsInitial)
 *           bb.gaps.<domain>.updated         (DwellGapsUpdated)
 *           bb.learner.preferences.updated   (DwellLearnerPreferencesUpdated)
 *
 * @namespace dwell
 * @sig d10-gatekeeper.cypher
 */

import { BB } from '../../events/subjects.js';
import type {
  DwellBridgeRequested,
  DwellCalibratorSignal,
  DwellGapCluster,
  DwellGapsInitial,
  DwellGapsUpdated,
  DwellLearnerPreferencesUpdated,
  DwellPriority,
} from '../../events/types.js';
import type { DwellDeps } from '../../types.js';

// ── Internal state types ───────────────────────────────────────────────────

/** Tracks which domains have fired their first bridge request this session. */
type ReadinessMap = Map<string, boolean>;

export class DwellGatekeeper {
  private readonly unsubscribers: Array<() => void> = [];

  /** Current gap clusters per domain, updated by surveyor events. */
  private readonly gapsByDomain: Map<string, DwellGapCluster[]> = new Map();

  /** Most recent learner preference updates. */
  private readonly preferences: DwellLearnerPreferencesUpdated[] = [];

  /**
   * Tracks per-domain readiness at last evaluation.
   * Used to detect not-ready → ready transitions.
   */
  private readonly readyDomains: ReadinessMap = new Map();

  constructor(private readonly deps: DwellDeps) {}

  /** Register all NATS subscriptions. Called by mountDwell(). */
  mount(): void {
    // Subscribe to gaps.initial across all domains
    const unsubGapsInitial = this.deps.nats.subscribe(
      BB.GAPS_INITIAL_PATTERN,
      (data: unknown) => {
        try {
          this.handleGapsInitial(data as DwellGapsInitial);
        } catch (err) {
          // TODO: emit bb.dwell.agent.error when error event type is defined
          console.error('[DwellGatekeeper] handleGapsInitial failed:', err);
        }
      },
    );
    this.unsubscribers.push(unsubGapsInitial);

    // Subscribe to gaps.updated across all domains
    const unsubGapsUpdated = this.deps.nats.subscribe(
      BB.GAPS_UPDATED_PATTERN,
      (data: unknown) => {
        try {
          this.handleGapsUpdated(data as DwellGapsUpdated);
        } catch (err) {
          // TODO: emit bb.dwell.agent.error when error event type is defined
          console.error('[DwellGatekeeper] handleGapsUpdated failed:', err);
        }
      },
    );
    this.unsubscribers.push(unsubGapsUpdated);

    // Subscribe to learner preference updates
    const unsubPrefs = this.deps.nats.subscribe(
      BB.LEARNER_PREFERENCES_UPDATED,
      (data: unknown) => {
        try {
          this.handlePreferencesUpdated(data as DwellLearnerPreferencesUpdated);
        } catch (err) {
          // TODO: emit bb.dwell.agent.error when error event type is defined
          console.error('[DwellGatekeeper] handlePreferencesUpdated failed:', err);
        }
      },
    );
    this.unsubscribers.push(unsubPrefs);
  }

  /** Tear down all subscriptions. Called by DwellHandle.dispose(). */
  dispose(): void {
    for (const unsub of [...this.unsubscribers].reverse()) unsub();
  }

  /**
   * Check whether the given conceptIds in a domain are ready for a Domain Twin call.
   *
   * Ready means:
   *   - Gap clusters exist for the domain (state is known)
   *   - None of the requested conceptIds appear in a 'high' priority gap cluster
   *     (high-priority gaps are too large; bridge is premature until they close)
   *   - Convergent-misconception clusters always use 'high' priority per the
   *     SIG invariant ConvergentMisconceptionClustersAreHighPriority — they
   *     automatically block readiness until resolved.
   *
   * @sig-node DwellGatekeeper.checkReadiness
   */
  checkReadiness(domain: string, conceptIds: string[]): boolean {
    const clusters = this.gapsByDomain.get(domain);
    if (!clusters || clusters.length === 0) return false; // No gap data → not ready

    // Build a map from conceptId to its highest-ranked priority across all clusters
    const conceptHighestPriority = new Map<string, DwellPriority>();
    for (const cluster of clusters) {
      for (const id of cluster.conceptIds) {
        const current = conceptHighestPriority.get(id);
        if (!current || priorityRank(cluster.priority) > priorityRank(current)) {
          conceptHighestPriority.set(id, cluster.priority);
        }
      }
    }

    // If any requested conceptId carries 'high' priority → not ready
    for (const id of conceptIds) {
      if (conceptHighestPriority.get(id) === 'high') return false;
    }

    return true;
  }

  // ── Private handlers ──────────────────────────────────────────────────────

  /**
   * Handle initial gap clusters for a domain (from DwellSurveyor).
   * @sig-node DwellGatekeeper.handleGapsInitial
   */
  private handleGapsInitial(payload: DwellGapsInitial): void {
    this.gapsByDomain.set(payload.domain, payload.clusters);
    this.evaluateReadinessTransition(payload.domain);
  }

  /**
   * Handle updated gap clusters for a domain (from DwellSurveyor).
   * @sig-node DwellGatekeeper.handleGapsUpdated
   */
  private handleGapsUpdated(payload: DwellGapsUpdated): void {
    this.gapsByDomain.set(payload.domain, payload.clusters);
    this.evaluateReadinessTransition(payload.domain);
  }

  /**
   * Handle learner preference updates.
   * Preferences are stored and available to checkReadiness callers but do not
   * directly alter the readiness gate in Sprint 1.
   * @sig-node DwellGatekeeper.handlePreferencesUpdated
   */
  private handlePreferencesUpdated(payload: DwellLearnerPreferencesUpdated): void {
    this.preferences.push(payload);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Evaluate whether the given domain has transitioned from not-ready to ready.
   * If so, emit bb.bridge.requested.
   */
  private evaluateReadinessTransition(domain: string): void {
    const clusters = this.gapsByDomain.get(domain) ?? [];

    // Collect all concept IDs in this domain's gap clusters
    const allConceptIds: string[] = [];
    for (const cluster of clusters) {
      allConceptIds.push(...cluster.conceptIds);
    }

    const wasReady = this.readyDomains.get(domain) ?? false;
    const isReady  = this.checkReadiness(domain, allConceptIds);

    this.readyDomains.set(domain, isReady);

    if (!wasReady && isReady) {
      this.emitBridgeRequested(domain, allConceptIds);
    }
  }

  /**
   * Emit bb.bridge.requested for a domain that has become ready.
   */
  private emitBridgeRequested(domain: string, conceptIds: string[]): void {
    // Construct a minimal calibrator signal — Gatekeeper doesn't own mastery telemetry.
    // The bridge agent and calibrator will enrich with real signal when available.
    const calibratorSignal: DwellCalibratorSignal = {
      confidenceCurrent: 0, // @adopt:dwell-gatekeeper-default-confidence  [resolved: 0]
      visitsCount: 0,
      plateauDuration: '0min',
    };

    const event: DwellBridgeRequested = {
      domain,
      conceptIds,
      learnerState: 'plateau', // Gatekeeper triggers on readiness; plateau is the canonical state
      calibratorSignal,
      requestedAt: new Date().toISOString(),
    };

    this.deps.nats.publish(BB.BRIDGE_REQUESTED, event);
  }
}

// ── Module-private helpers ─────────────────────────────────────────────────

/**
 * Numeric rank for priority comparison (higher = more urgent).
 * Used to find the "worst" classification for a conceptId across clusters.
 */
function priorityRank(p: DwellPriority): number {
  if (p === 'high') return 3;
  if (p === 'medium') return 2;
  return 1; // 'low'
}
