/**
 * update-notifier.ts — Emits thin broadcast notifications and delivers pre-curated deltas.
 *
 * notifyConnectedTwins — effect: emits a thin broadcast via DWELL.DOMAIN_UPDATED.
 *                        DOES NOT maintain a subscriber list.
 *                        Invariant enforced: DomainTwinDoesNotTrackSubscribers.
 *
 * deliverDelta         — effect: publishes a DwellUpdateDelivered payload to the reply subject.
 *
 * @namespace dwell
 * @sig d18-cultivator-domain.cypher
 */

import type { NatsClient } from '../../../types.js';
import { DWELL } from '../../../events/subjects.js';
import type { DomainDelta } from './types.js';
import type {
  DwellDomainUpdatedBroadcast,
  DwellUpdateDelivered,
  DwellAffectedConcept,
} from '../../../events/types.js';

/**
 * Emits a thin broadcast via DWELL.DOMAIN_UPDATED(twinId).
 *
 * Payload contains ONLY: twinId, domain, notifiedAt.
 * No change detail. No affected concept list. No subscriber list maintained.
 *
 * Invariant DomainTwinDoesNotTrackSubscribers: this function emits once on the
 * channel connector infrastructure. NATS fan-out handles delivery to all
 * connected Personal Twins. No subscriber list is consulted or maintained here.
 *
 * @sig-node DwellCultivatorDomain.notifyConnectedTwins
 */
export function notifyConnectedTwins(
  twinId: string,
  domain: string,
  nats: NatsClient,
): void {
  // Invariant: DomainTwinDoesNotTrackSubscribers
  // Emit once. NATS fan-out reaches all connected Personal Twins.
  // This function must never iterate a subscriber list.
  const payload: DwellDomainUpdatedBroadcast = {
    twinId,
    domain,
    notifiedAt: new Date().toISOString(),
  };
  nats.publish(DWELL.DOMAIN_UPDATED(twinId), payload);
}

/**
 * Delivers a pre-curated DomainDelta to the requesting Personal Twin.
 * Publishes a DwellUpdateDelivered payload to replySubject
 * (typically DWELL.USER_UPDATE_DELIVERED(userId)).
 *
 * The delta was prepared proactively on change detection — this function
 * only delivers what is already packaged.
 *
 * @sig-node DwellCultivatorDomain.deliverDelta
 */
export function deliverDelta(
  delta: DomainDelta,
  replySubject: string,
  twinId: string,
  domain: string,
  nats: NatsClient,
): void {
  const affectedConcepts: DwellAffectedConcept[] = delta.affectedConcepts.map((c) => ({
    conceptId: c.conceptId,
    changeType: c.changeType,
    severity: c.severity,
    changeNote: c.changeNote,
  }));

  const payload: DwellUpdateDelivered = {
    twinId,
    domain,
    fromVersion: delta.fromVersion,
    toVersion: delta.toVersion,
    affectedConcepts,
    deliveredAt: new Date().toISOString(),
  };

  nats.publish(replySubject, payload);
}
