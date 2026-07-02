/**
 * discovery-broadcast.ts — effect functions for the discovery broadcast/collect pattern.
 *
 * No central registry. Domain Twins self-announce in response to the broadcast.
 * Zero response is a first-class finding (REQ-DW-DTD-02) — not an error.
 *
 * Satisfies: REQ-DW-DTD-01 (broadcast, not registry), REQ-DW-DTD-02 (domain gap)
 *
 * @namespace dwell
 * @sig d14-zipper-intertwin.cypher
 */

import { DWELL } from '../../events/subjects.js';
import type {
  DwellBroadcastDiscovery,
  DwellDiscoveryResponse,
  DwellDomainGap,
  DwellSourceKnowledge,
} from '../../events/types.js';
import type { NatsClient } from '../../types.js';

/**
 * How long to wait for Domain Twins to respond to a discovery broadcast.
 * @adopt:dwell-discovery-timeout-ms  [resolved: 5000]
 */
const DEFAULT_DISCOVERY_TIMEOUT_MS = 5000;

/**
 * Fires DWELL.BROADCAST_DISCOVERY so any subscribed Domain Twin may respond.
 * The replyTo is set to DWELL.USER_DISCOVERY_RESPONSE(userId) — the only
 * place in inter-twin payloads where a userId appears.
 *
 * @sig-node DwellZipperIntertwin.broadcastDiscovery
 */
export async function broadcastDiscovery(
  intent: string,
  sourceKnowledge: DwellSourceKnowledge[],
  userId: string,
  nats: NatsClient,
): Promise<void> {
  const payload: DwellBroadcastDiscovery = {
    replyTo: DWELL.USER_DISCOVERY_RESPONSE(userId),
    intent,
    sourceKnowledge,
    requestedAt: new Date().toISOString(),
    timeoutMs: DEFAULT_DISCOVERY_TIMEOUT_MS, // @adopt:dwell-discovery-timeout-ms
  };
  nats.publish(DWELL.BROADCAST_DISCOVERY, payload);
}

/**
 * Collects DwellDiscoveryResponse messages on DWELL.USER_DISCOVERY_RESPONSE(userId)
 * until timeoutMs expires. Returns all responses received (may be empty — that is
 * handled by the caller, which fires fireDomainGap on empty).
 *
 * @sig-node DwellZipperIntertwin.collectResponses
 */
export function collectResponses(
  userId: string,
  nats: NatsClient,
  timeoutMs: number,
): Promise<DwellDiscoveryResponse[]> {
  return new Promise((resolve) => {
    const collected: DwellDiscoveryResponse[] = [];
    const replySubject = DWELL.USER_DISCOVERY_RESPONSE(userId);

    const unsub = nats.subscribe(replySubject, (data: unknown) => {
      collected.push(data as DwellDiscoveryResponse);
    });

    setTimeout(() => {
      unsub();
      resolve(collected);
    }, timeoutMs);
  });
}

/**
 * Fires DWELL.USER_DOMAIN_GAP(userId) when no Domain Twin responded within the
 * discovery timeout. This is a first-class platform finding, not an error.
 *
 * @sig-node DwellZipperIntertwin.fireDomainGap
 */
export async function fireDomainGap(
  userId: string,
  intent: string,
  nats: NatsClient,
): Promise<void> {
  const payload: DwellDomainGap = {
    intent,
    timeoutMs: DEFAULT_DISCOVERY_TIMEOUT_MS, // @adopt:dwell-discovery-timeout-ms
    requestedAt: new Date().toISOString(),
  };
  nats.publish(DWELL.USER_DOMAIN_GAP(userId), payload);
}
