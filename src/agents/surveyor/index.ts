/**
 * DwellSurveyor — maps knowledge graph gaps by domain, clusters by priority.
 *
 * For each domain, computes the altitude gap per concept node
 * (altitudeGap = bloomsTargetAltitude - bloomsCurrentAltitude), then
 * groups concept nodes into GapClusters bucketed by priority.
 *
 * Emits:   bb.gaps.<domain>.initial   (DwellGapsInitial)
 *          bb.gaps.<domain>.updated   (DwellGapsUpdated)
 * Consumes: bb.mastery.<domain>.initialized (DwellMasteryInitialized)
 *           bb.mastery.<domain>.updated     (DwellMasteryUpdated)
 *
 * @namespace dwell
 * @sig d09-surveyor.cypher
 */

import { BB } from '../../events/subjects.js';
import type {
  DwellGapCluster,
  DwellGapsInitial,
  DwellGapsUpdated,
  DwellMasteryInitialized,
  DwellMasteryNode,
  DwellMasterySource,
  DwellMasteryUpdated,
  DwellBloomsLevel,
  DwellPriority,
} from '../../events/types.js';
import type { DwellDeps } from '../../types.js';

// ── Thresholds ──────────────────────────────────────────────────────────────
/** Altitude gap at or above this value → 'high' priority cluster. */
const HIGH_GAP_THRESHOLD = 3; // @adopt:dwell-surveyor-high-gap-threshold  [resolved: 3]
/** Altitude gap at or above this value (but < HIGH) → 'medium' priority cluster. */
const MEDIUM_GAP_THRESHOLD = 2; // @adopt:dwell-surveyor-medium-gap-threshold  [resolved: 2]

/** Shape of a row returned by the knowledge-graph Cypher query. */
type KgNodeRow = {
  conceptId: string;
  bloomsTargetAltitude: number;
  examWeight: number;
};

export class DwellSurveyor {
  private readonly unsubscribers: Array<() => void> = [];

  constructor(private readonly deps: DwellDeps) {}

  /** Register all NATS subscriptions. Called by mountDwell(). */
  mount(): void {
    // Subscribe to mastery.initialized across all domains
    const unsubInit = this.deps.nats.subscribe(
      BB.MASTERY_INITIALIZED_PATTERN,
      (data: unknown) => {
        this.handleMasteryInitialized(data as DwellMasteryInitialized).catch((err: unknown) => {
          // TODO: emit bb.dwell.agent.error when error event type is defined
          console.error('[DwellSurveyor] handleMasteryInitialized failed:', err);
        });
      },
    );
    this.unsubscribers.push(unsubInit);

    // Subscribe to mastery.updated across all domains
    const unsubUpdate = this.deps.nats.subscribe(
      BB.MASTERY_UPDATED_PATTERN,
      (data: unknown) => {
        this.handleMasteryUpdated(data as DwellMasteryUpdated).catch((err: unknown) => {
          // TODO: emit bb.dwell.agent.error when error event type is defined
          console.error('[DwellSurveyor] handleMasteryUpdated failed:', err);
        });
      },
    );
    this.unsubscribers.push(unsubUpdate);
  }

  /** Tear down all subscriptions. Called by DwellHandle.dispose(). */
  dispose(): void {
    for (const unsub of [...this.unsubscribers].reverse()) unsub();
  }

  // ── Private handlers ──────────────────────────────────────────────────────

  /**
   * Handle mastery initialization for a domain.
   * Reads the KG, computes full gap set, emits bb.gaps.<domain>.initial.
   * @sig-node DwellSurveyor.handleMasteryInitialized
   */
  private async handleMasteryInitialized(payload: DwellMasteryInitialized): Promise<void> {
    const kgNodes = await this.fetchKgNodes(payload.domain);
    const clusters = this.buildGapClusters(payload.domain, payload.nodes, kgNodes);
    const event: DwellGapsInitial = {
      domain: payload.domain,
      clusters,
      assessedAt: new Date().toISOString(),
    };
    this.deps.nats.publish(BB.GAPS_INITIAL(payload.domain), event);
  }

  /**
   * Handle mastery update for a domain.
   * Recomputes gap clusters for changed nodes and emits bb.gaps.<domain>.updated.
   * @sig-node DwellSurveyor.handleMasteryUpdated
   */
  private async handleMasteryUpdated(payload: DwellMasteryUpdated): Promise<void> {
    const kgNodes = await this.fetchKgNodes(payload.domain);

    // Map updated nodes into the DwellMasteryNode shape for cluster computation
    const masteryNodes: DwellMasteryNode[] = payload.updatedNodes.map((n) => ({
      conceptId: n.conceptId,
      confidence: n.confidenceNew,
      bloomsAltitude: n.bloomsAltitudeNew as DwellBloomsLevel,
      source: 'partial-credit' as DwellMasterySource,
    }));

    const clusters = this.buildGapClusters(payload.domain, masteryNodes, kgNodes);
    const event: DwellGapsUpdated = {
      domain: payload.domain,
      clusters,
      assessedAt: new Date().toISOString(),
    };
    this.deps.nats.publish(BB.GAPS_UPDATED(payload.domain), event);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Query the knowledge graph for target altitude and exam weight per concept.
   * Returns one row per concept node in the domain.
   */
  private async fetchKgNodes(domain: string): Promise<KgNodeRow[]> {
    const rows = await this.deps.graph.query(
      // @adopt:dwell-surveyor-kg-query  [resolved: MATCH (n:KgNode {domain: $domain}) ...]
      'MATCH (n:KgNode {domain: $domain}) ' +
        'RETURN n.conceptId AS conceptId, ' +
        'n.bloomsTargetAltitude AS bloomsTargetAltitude, ' +
        'n.examWeight AS examWeight',
      { domain },
    );
    return rows as KgNodeRow[];
  }

  /**
   * Build GapCluster array from mastery nodes + KG metadata.
   *
   * Groups concepts into three priority buckets based on altitude gap:
   *   high   → altitudeGap >= HIGH_GAP_THRESHOLD  (3+)
   *   medium → altitudeGap >= MEDIUM_GAP_THRESHOLD (2)
   *   low    → altitudeGap == 1
   *
   * Concepts with altitudeGap <= 0 are mastered/beyond target — skipped.
   *
   * @sig-node DwellSurveyor.buildGapClusters
   */
  private buildGapClusters(
    domain: string,
    masteryNodes: DwellMasteryNode[],
    kgNodes: KgNodeRow[],
  ): DwellGapCluster[] {
    // Build lookup: conceptId → KG metadata
    const kgMap = new Map<string, KgNodeRow>();
    for (const n of kgNodes) kgMap.set(n.conceptId, n);

    const buckets: Record<DwellPriority, { ids: string[]; totalWeight: number }> = {
      high:   { ids: [], totalWeight: 0 },
      medium: { ids: [], totalWeight: 0 },
      low:    { ids: [], totalWeight: 0 },
    };

    for (const mNode of masteryNodes) {
      const kg = kgMap.get(mNode.conceptId);
      if (!kg) continue; // Not in graph — skip
      const altitudeGap = kg.bloomsTargetAltitude - mNode.bloomsAltitude;
      if (altitudeGap <= 0) continue; // Mastered or beyond target

      let priority: DwellPriority;
      if (altitudeGap >= HIGH_GAP_THRESHOLD) {
        priority = 'high';
      } else if (altitudeGap >= MEDIUM_GAP_THRESHOLD) {
        priority = 'medium';
      } else {
        priority = 'low';
      }

      buckets[priority].ids.push(mNode.conceptId);
      buckets[priority].totalWeight += kg.examWeight;
    }

    const clusters: DwellGapCluster[] = [];

    for (const priority of ['high', 'medium', 'low'] as DwellPriority[]) {
      const { ids, totalWeight } = buckets[priority];
      if (ids.length === 0) continue;
      clusters.push({
        clusterId:  `${domain}-knowledge-${priority}`,
        label:      `${domain} ${priority}-priority knowledge gaps`,
        gapType:    'knowledge',
        conceptIds: ids,
        priority,
        examWeight: totalWeight / ids.length, // average exam weight per cluster
      });
    }

    return clusters;
  }
}
