/**
 * DwellAnswerAgent — the evaluation hub for discovery responses and bridge candidates.
 *
 * When multiple Domain Twins respond to a discovery broadcast, or multiple
 * bridge card candidates arrive, the Answer Agent uses full BB context to
 * rank, select, and route. All scoring is Tier 0 — deterministic weighted
 * formulas only. No LLM calls. Satisfies DiscoveryScoringIsAlgorithmic invariant.
 *
 * Emits:    bb.answer.discovery         (DwellEvaluatedResponse[])
 *           bb.answer.bridge-candidate  (DwellBridgeCandidate | null)
 *
 * Consumes: bb.contribution.discovery         (DwellDiscoveryContribution)
 *           bb.contribution.bridge-candidates  (DwellBridgeCandidatesContribution)
 *           bb.mastery.*.initialized           (DwellMasteryInitialized)
 *           bb.mastery.*.updated               (DwellMasteryUpdated)
 *           bb.gaps.*.initial                  (DwellGapsInitial)
 *           bb.gaps.*.updated                  (DwellGapsUpdated)
 *           bb.learner.*.baseline              (DwellLearnerBaseline)
 *
 * Invariant: DiscoveryScoringIsAlgorithmic — no external calls in scoring path.
 *
 * @namespace dwell
 * @sig d12-answer-agent.cypher
 */

import { BB } from '../../events/subjects.js';
import type {
  DwellBridgeCandidate,
  DwellBridgeCandidatesContribution,
  DwellDiscoveryContribution,
  DwellGapCluster,
  DwellGapsInitial,
  DwellGapsUpdated,
  DwellLearnerBaseline,
  DwellMasteryInitialized,
  DwellMasteryNode,
  DwellMasteryUpdated,
} from '../../events/types.js';
import type { DwellDeps } from '../../types.js';
import { selectBestBridgeCandidate } from './bridge-candidate-filter.js';
import { rankResponses } from './discovery-scorer.js';
import {
  DEFAULT_DISCOVERY_POLICY,
  type DwellBBContext,
  type DwellDiscoveryEvaluationPolicy,
  type DwellEvaluatedResponse,
  type DwellMasteryMap,
} from './types.js';

export class DwellAnswerAgent {
  private readonly unsubscribers: Array<() => void> = [];

  /**
   * Internal mastery map: conceptId → DwellMasteryNode.
   * Built from bb.mastery.*.initialized and bb.mastery.*.updated events.
   */
  private readonly masteryMap: DwellMasteryMap = {};

  /**
   * Internal gap clusters per domain: domain → DwellGapCluster[].
   * Built from bb.gaps.*.initial and bb.gaps.*.updated events.
   */
  private readonly gapsByDomain: Map<string, DwellGapCluster[]> = new Map();

  /**
   * Domains in which the learner has meaningful mastery (confidence ≥ threshold).
   * Populated from bb.learner.*.baseline events.
   *
   * @adopt:dwell-source-domain-mastery-threshold  [resolved: 0.3]
   */
  private readonly sourceDomains: Set<string> = new Set();

  /**
   * The evaluation policy (weights). Sourced from config; never hardcoded.
   * @adopt:dwell-discovery-weights
   */
  private readonly policy: DwellDiscoveryEvaluationPolicy;

  constructor(private readonly deps: DwellDeps) {
    // @adopt:dwell-discovery-weights — policy comes from config seam; default until injected
    this.policy = DEFAULT_DISCOVERY_POLICY;
  }

  /** Register all NATS subscriptions. Called by mountDwell(). */
  mount(): void {
    // ── Mastery state subscriptions ────────────────────────────────────────

    const unsubMasteryInit = this.deps.nats.subscribe(
      BB.MASTERY_INITIALIZED_PATTERN,
      (data: unknown) => {
        try {
          this.handleMasteryInitialized(data as DwellMasteryInitialized);
        } catch (err) {
          // TODO: emit bb.dwell.agent.error when error event type is defined
          console.error('[DwellAnswerAgent] handleMasteryInitialized failed:', err);
        }
      },
    );
    this.unsubscribers.push(unsubMasteryInit);

    const unsubMasteryUpdated = this.deps.nats.subscribe(
      BB.MASTERY_UPDATED_PATTERN,
      (data: unknown) => {
        try {
          this.handleMasteryUpdated(data as DwellMasteryUpdated);
        } catch (err) {
          // TODO: emit bb.dwell.agent.error when error event type is defined
          console.error('[DwellAnswerAgent] handleMasteryUpdated failed:', err);
        }
      },
    );
    this.unsubscribers.push(unsubMasteryUpdated);

    // ── Gap state subscriptions ────────────────────────────────────────────

    const unsubGapsInitial = this.deps.nats.subscribe(
      BB.GAPS_INITIAL_PATTERN,
      (data: unknown) => {
        try {
          this.handleGapsInitial(data as DwellGapsInitial);
        } catch (err) {
          // TODO: emit bb.dwell.agent.error when error event type is defined
          console.error('[DwellAnswerAgent] handleGapsInitial failed:', err);
        }
      },
    );
    this.unsubscribers.push(unsubGapsInitial);

    const unsubGapsUpdated = this.deps.nats.subscribe(
      BB.GAPS_UPDATED_PATTERN,
      (data: unknown) => {
        try {
          this.handleGapsUpdated(data as DwellGapsUpdated);
        } catch (err) {
          // TODO: emit bb.dwell.agent.error when error event type is defined
          console.error('[DwellAnswerAgent] handleGapsUpdated failed:', err);
        }
      },
    );
    this.unsubscribers.push(unsubGapsUpdated);

    // ── Learner baseline subscription (source domains) ─────────────────────

    const unsubBaseline = this.deps.nats.subscribe(
      BB.LEARNER_BASELINE_PATTERN,
      (data: unknown) => {
        try {
          this.handleLearnerBaseline(data as DwellLearnerBaseline);
        } catch (err) {
          // TODO: emit bb.dwell.agent.error when error event type is defined
          console.error('[DwellAnswerAgent] handleLearnerBaseline failed:', err);
        }
      },
    );
    this.unsubscribers.push(unsubBaseline);

    // ── Contribution subscriptions ─────────────────────────────────────────

    const unsubDiscovery = this.deps.nats.subscribe(
      BB.CONTRIBUTION('discovery'),
      (data: unknown) => {
        try {
          this.handleDiscoveryContribution(data as DwellDiscoveryContribution);
        } catch (err) {
          // TODO: emit bb.dwell.agent.error when error event type is defined
          console.error('[DwellAnswerAgent] handleDiscoveryContribution failed:', err);
        }
      },
    );
    this.unsubscribers.push(unsubDiscovery);

    const unsubBridgeCandidates = this.deps.nats.subscribe(
      BB.CONTRIBUTION('bridge-candidates'),
      (data: unknown) => {
        try {
          this.handleBridgeCandidatesContribution(data as DwellBridgeCandidatesContribution);
        } catch (err) {
          // TODO: emit bb.dwell.agent.error when error event type is defined
          console.error('[DwellAnswerAgent] handleBridgeCandidatesContribution failed:', err);
        }
      },
    );
    this.unsubscribers.push(unsubBridgeCandidates);
  }

  /** Tear down all subscriptions. Called by DwellHandle.dispose(). */
  dispose(): void {
    for (const unsub of [...this.unsubscribers].reverse()) unsub();
  }

  // ── Private handlers ───────────────────────────────────────────────────────

  /**
   * Handle mastery initialization: seed the internal mastery map.
   * @sig-node DwellAnswerAgent.handleMasteryInitialized
   */
  private handleMasteryInitialized(payload: DwellMasteryInitialized): void {
    for (const node of payload.nodes) {
      this.masteryMap[node.conceptId] = node;
    }
  }

  /**
   * Handle mastery update: patch changed nodes in the internal mastery map.
   * @sig-node DwellAnswerAgent.handleMasteryUpdated
   */
  private handleMasteryUpdated(payload: DwellMasteryUpdated): void {
    for (const updated of payload.updatedNodes) {
      const existing = this.masteryMap[updated.conceptId];
      if (existing) {
        this.masteryMap[updated.conceptId] = {
          ...existing,
          confidence: updated.confidenceNew,
          bloomsAltitude: updated.bloomsAltitudeNew as DwellMasteryNode['bloomsAltitude'],
        };
      }
    }
  }

  /**
   * Handle initial gap clusters: record per-domain.
   * @sig-node DwellAnswerAgent.handleGapsInitial
   */
  private handleGapsInitial(payload: DwellGapsInitial): void {
    this.gapsByDomain.set(payload.domain, payload.clusters);
  }

  /**
   * Handle updated gap clusters: replace per-domain.
   * @sig-node DwellAnswerAgent.handleGapsUpdated
   */
  private handleGapsUpdated(payload: DwellGapsUpdated): void {
    this.gapsByDomain.set(payload.domain, payload.clusters);
  }

  /**
   * Handle learner baseline: record this domain as a source domain if the
   * learner has meaningful mastery there.
   *
   * A domain is a source domain when at least one node has 'strong' signal.
   * @adopt:dwell-source-domain-mastery-threshold  [resolved: signal=strong]
   *
   * @sig-node DwellAnswerAgent.handleLearnerBaseline
   */
  private handleLearnerBaseline(payload: DwellLearnerBaseline): void {
    const hasMastery = payload.nodes.some((n) => n.signalStrength === 'strong');
    if (hasMastery) {
      this.sourceDomains.add(payload.domain);
    }
  }

  /**
   * Handle a bb.contribution.discovery event.
   *
   * Reads current internal BB context, ranks all discovery responses using
   * the pure Tier 0 scoring functions, and publishes bb.answer.discovery
   * with the ranked EvaluatedResponse[].
   *
   * All scoring is algorithmic — no LLM calls (DiscoveryScoringIsAlgorithmic).
   *
   * @sig-node DwellAnswerAgent.onDiscoveryContributions
   */
  private handleDiscoveryContribution(payload: DwellDiscoveryContribution): void {
    const context = this.assembleBBContext();
    const ranked: DwellEvaluatedResponse[] = rankResponses(
      payload.responses,
      context,
      this.policy,
      payload.intent,
    );
    this.deps.nats.publish(BB.ANSWER('discovery'), ranked);
  }

  /**
   * Handle a bb.contribution.bridge-candidates event.
   *
   * Reads current internal BB context, selects the single best-fit bridge
   * candidate, and publishes bb.answer.bridge-candidate with that candidate
   * (or null when no candidates are available).
   *
   * @sig-node DwellAnswerAgent.onBridgeCandidates
   */
  private handleBridgeCandidatesContribution(
    payload: DwellBridgeCandidatesContribution,
  ): void {
    const context = this.assembleBBContext();
    const best: DwellBridgeCandidate | null = selectBestBridgeCandidate(
      payload.candidates,
      context,
    );
    this.deps.nats.publish(BB.ANSWER('bridge-candidate'), best);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Assemble a DwellBBContext snapshot from internal state.
   * Called once at the start of each evaluation pass — immutable during the pass.
   */
  private assembleBBContext(): DwellBBContext {
    const allGapClusters: DwellGapCluster[] = [];
    for (const clusters of this.gapsByDomain.values()) {
      allGapClusters.push(...clusters);
    }
    return {
      masteryMap: { ...this.masteryMap },
      gapClusters: allGapClusters,
      sourceDomains: Array.from(this.sourceDomains),
    };
  }
}
