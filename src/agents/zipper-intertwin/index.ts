/**
 * DwellZipperIntertwin — the ONLY agent that crosses the bb.* / dwell.* boundary.
 *
 * All internal Dwell agents (Antiquarian, Calibrator, Surveyor, etc.) communicate
 * exclusively through bb.* subjects. They post bb.need.{kind} events when they
 * require data from a Domain Twin. The Zipper handles those needs by routing them
 * across the bb.{*} / dwell.{*} boundary to the appropriate Domain Twin.
 *
 * Domain Twins register at MCP channel-open time via DwellHandle.registry.
 * Once registered, the Zipper routes bb.need.* events to their tool implementations.
 *
 * Invariants:
 *   - ZipperIsOnlyCrossBoundaryAgent: no other agent may use DWELL subjects.
 *   - EverythingOnZipperLooksLikeATool: Domain Twins are BBTools; calls are uniform.
 *
 * Emits (to BB):
 *   bb.contribution.discovery     — DwellDiscoveryContribution
 *   bb.contribution.kg            — DwellKgDelivered
 *   bb.contribution.bridge-candidates  — DwellBridgeCandidatesContribution
 *   bb.contribution.assessment    — DwellAssessmentDelivered
 *   bb.domain.{domain}.change-available (via relayUpdateNotification)
 *
 * Consumes from BB:
 *   bb.need.discovery       — DwellDiscoveryNeed
 *   bb.need.kg              — DwellKgNeed
 *   bb.need.bridge          — DwellBridgeNeed
 *   bb.need.assessment      — DwellAssessmentNeed
 *   bb.need.outcome-signal  — DwellOutcomeSignalNeed
 *
 * Consumes from dwell.*:
 *   dwell.domain.*.updated  — DwellDomainUpdatedBroadcast (from Domain Twins)
 *
 * @namespace dwell
 * @sig d14-zipper-intertwin.cypher
 */

import { BB, DWELL } from '../../events/subjects.js';
import type {
  DwellAssessmentNeed,
  DwellBridgeCandidatesContribution,
  DwellBridgeNeed,
  DwellDiscoveryContribution,
  DwellDiscoveryNeed,
  DwellDomainUpdatedBroadcast,
  DwellKgNeed,
  DwellOutcomeSignalNeed,
} from '../../events/types.js';
import type { DwellDeps } from '../../types.js';
import { DwellChannelRegistry } from './channel-registry.js';
import {
  broadcastDiscovery,
  collectResponses,
  fireDomainGap,
} from './discovery-broadcast.js';
import {
  callDomainTwin,
  fireOutcomeSignal,
  relayUpdateNotification,
} from './inter-twin-caller.js';

/**
 * Default discovery response window.
 * @adopt:dwell-discovery-timeout-ms  [resolved: 5000]
 */
const DISCOVERY_TIMEOUT_MS = 5000;

export class DwellZipperIntertwin {
  private readonly unsubscribers: Array<() => void> = [];

  /**
   * Domain Twin channel registry. Exposed on DwellHandle.registry so callers
   * can register Domain Twin BBTools at connection time.
   */
  readonly registry: DwellChannelRegistry;

  constructor(private readonly deps: DwellDeps) {
    this.registry = new DwellChannelRegistry();
  }

  /**
   * Register all NATS subscriptions. Called by mountDwell().
   *
   * @sig-node DwellZipperIntertwin.mount
   */
  mount(): void {
    const { nats } = this.deps;

    // ── bb.need.discovery ────────────────────────────────────────────────────
    const unsubDiscovery = nats.subscribe(BB.NEED('discovery'), async (data: unknown) => {
      try {
        await this.handleDiscoveryNeed(data as DwellDiscoveryNeed);
      } catch (err) {
        // TODO: emit bb.dwell.agent.error when error event type is defined
        console.error('[DwellZipperIntertwin] handleDiscoveryNeed failed:', err);
      }
    });
    this.unsubscribers.push(unsubDiscovery);

    // ── bb.need.kg ───────────────────────────────────────────────────────────
    const unsubKg = nats.subscribe(BB.NEED('kg'), async (data: unknown) => {
      try {
        await this.handleKgNeed(data as DwellKgNeed);
      } catch (err) {
        console.error('[DwellZipperIntertwin] handleKgNeed failed:', err);
      }
    });
    this.unsubscribers.push(unsubKg);

    // ── bb.need.bridge ───────────────────────────────────────────────────────
    const unsubBridge = nats.subscribe(BB.NEED('bridge'), async (data: unknown) => {
      try {
        await this.handleBridgeNeed(data as DwellBridgeNeed);
      } catch (err) {
        console.error('[DwellZipperIntertwin] handleBridgeNeed failed:', err);
      }
    });
    this.unsubscribers.push(unsubBridge);

    // ── bb.need.assessment ───────────────────────────────────────────────────
    const unsubAssessment = nats.subscribe(BB.NEED('assessment'), async (data: unknown) => {
      try {
        await this.handleAssessmentNeed(data as DwellAssessmentNeed);
      } catch (err) {
        console.error('[DwellZipperIntertwin] handleAssessmentNeed failed:', err);
      }
    });
    this.unsubscribers.push(unsubAssessment);

    // ── bb.need.outcome-signal ───────────────────────────────────────────────
    const unsubOutcome = nats.subscribe(BB.NEED('outcome-signal'), async (data: unknown) => {
      try {
        await this.handleOutcomeSignalNeed(data as DwellOutcomeSignalNeed);
      } catch (err) {
        console.error('[DwellZipperIntertwin] handleOutcomeSignalNeed failed:', err);
      }
    });
    this.unsubscribers.push(unsubOutcome);

    // ── dwell.domain.*.updated ───────────────────────────────────────────────
    // Thin update signals from Domain Twins; relayed into the BB.
    const unsubDomainUpdated = nats.subscribe(
      DWELL.DOMAIN_UPDATED_PATTERN,
      async (data: unknown) => {
        try {
          await this.handleDomainUpdated(data as DwellDomainUpdatedBroadcast);
        } catch (err) {
          console.error('[DwellZipperIntertwin] handleDomainUpdated failed:', err);
        }
      },
    );
    this.unsubscribers.push(unsubDomainUpdated);
  }

  /**
   * Tear down all subscriptions. Called by DwellHandle.dispose().
   *
   * @sig-node DwellZipperIntertwin.dispose
   */
  dispose(): void {
    for (const unsub of [...this.unsubscribers].reverse()) unsub();
  }

  // ── Private handlers ───────────────────────────────────────────────────────

  /**
   * Handle bb.need.discovery:
   * 1. Broadcast to all Domain Twins via dwell.broadcast.discovery
   * 2. Collect responses on dwell.{userId}.discovery.response
   * 3. If empty → fire domain gap (first-class finding, not an error)
   * 4. Post bb.contribution.discovery with all collected responses
   *
   * @sig-node DwellZipperIntertwin.handleDiscoveryNeed
   */
  private async handleDiscoveryNeed(need: DwellDiscoveryNeed): Promise<void> {
    const { nats } = this.deps;
    const timeoutMs = need.timeoutMs ?? DISCOVERY_TIMEOUT_MS; // @adopt:dwell-discovery-timeout-ms

    await broadcastDiscovery(need.intent, need.sourceKnowledge, need.userId, nats);
    const responses = await collectResponses(need.userId, nats, timeoutMs);

    if (responses.length === 0) {
      // Domain gap is a first-class platform finding — not an error.
      await fireDomainGap(need.userId, need.intent, nats);
    }

    const contribution: DwellDiscoveryContribution = {
      intent: need.intent,
      responses,
    };
    nats.publish(BB.CONTRIBUTION('discovery'), contribution);
  }

  /**
   * Handle bb.need.kg:
   * Calls the Domain Twin's getKnowledgeGraph via NATS and posts the result.
   *
   * @sig-node DwellZipperIntertwin.handleKgNeed
   */
  private async handleKgNeed(need: DwellKgNeed): Promise<void> {
    const { nats } = this.deps;
    const result = await callDomainTwin(
      need.twinId,
      'getKnowledgeGraph',
      need.request,
      need.userId,
      nats,
    );
    nats.publish(BB.CONTRIBUTION('kg'), result);
  }

  /**
   * Handle bb.need.bridge:
   * Calls the Domain Twin's queryBridge via NATS and posts bridge candidates.
   *
   * @sig-node DwellZipperIntertwin.handleBridgeNeed
   */
  private async handleBridgeNeed(need: DwellBridgeNeed): Promise<void> {
    const { nats } = this.deps;
    const result = await callDomainTwin(
      need.twinId,
      'queryBridge',
      need.request,
      need.userId,
      nats,
    );
    const contribution: DwellBridgeCandidatesContribution = {
      candidates: (result as { candidates: DwellBridgeCandidatesContribution['candidates'] }).candidates,
    };
    nats.publish(BB.CONTRIBUTION('bridge-candidates'), contribution);
  }

  /**
   * Handle bb.need.assessment:
   * Calls the Domain Twin's requestAssessment via NATS and posts the items.
   *
   * @sig-node DwellZipperIntertwin.handleAssessmentNeed
   */
  private async handleAssessmentNeed(need: DwellAssessmentNeed): Promise<void> {
    const { nats } = this.deps;
    const result = await callDomainTwin(
      need.twinId,
      'requestAssessment',
      need.request,
      need.userId,
      nats,
    );
    nats.publish(BB.CONTRIBUTION('assessment'), result);
  }

  /**
   * Handle bb.need.outcome-signal:
   * Fires an anonymized outcome signal to the Domain Twin — fire-and-forget.
   * No PII in the signal (verified by test).
   *
   * @sig-node DwellZipperIntertwin.handleOutcomeSignalNeed
   */
  private async handleOutcomeSignalNeed(need: DwellOutcomeSignalNeed): Promise<void> {
    const { nats } = this.deps;
    await fireOutcomeSignal(need.twinId, need.signal, nats);
  }

  /**
   * Handle dwell.domain.*.updated:
   * Relays a thin Domain Twin update signal into the BB so Cultivator can react
   * without the Domain Twin knowing who is subscribed (REQ-DW-CUR-03).
   *
   * @sig-node DwellZipperIntertwin.handleDomainUpdated
   */
  private async handleDomainUpdated(broadcast: DwellDomainUpdatedBroadcast): Promise<void> {
    const { nats } = this.deps;
    await relayUpdateNotification(broadcast.twinId, broadcast.domain, nats);
  }
}
