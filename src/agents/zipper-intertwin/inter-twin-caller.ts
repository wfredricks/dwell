/**
 * inter-twin-caller.ts — effect functions for directed inter-twin calls.
 *
 * callDomainTwin: publishes a tool-specific dwell.{twinId}.{tool} request on NATS
 *   and awaits the response on the user inbox subject. Single directed-call gateway
 *   for all Personal Twin → Domain Twin interactions.
 *
 * fireOutcomeSignal: fires dwell.{twinId}.outcome.signal, fire-and-forget, no PII.
 *
 * relayUpdateNotification: relays a thin dwell.domain.{twinId}.updated signal into
 *   the BB as bb.domain.{domain}.change-available.
 *
 * Invariant: no PII in outcome signals (REQ-DW-OUT-02).
 *
 * @namespace dwell
 * @sig d14-zipper-intertwin.cypher
 */

import { BB, DWELL } from '../../events/subjects.js';
import type { DwellOutcomeSignal } from '../../events/types.js';
import type { NatsClient } from '../../types.js';

/**
 * Timeout for a single Domain Twin tool call before treating it as failed.
 * @adopt:dwell-twin-call-timeout-ms  [resolved: 10000]
 */
const CALL_TIMEOUT_MS = 10000;

// ── Subject routing maps ───────────────────────────────────────────────────

/**
 * Maps a tool method name to the NATS subject used to invoke it on a Domain Twin.
 * @adopt:dwell-twin-call-subject-map
 */
const TOOL_REQUEST_SUBJECT: Record<string, (twinId: string) => string> = {
  getKnowledgeGraph: DWELL.TWIN_KG_REQUEST,
  queryBridge:       DWELL.TWIN_BRIDGE_QUERY,
  requestAssessment: DWELL.TWIN_ASSESSMENT_REQUEST,
  requestUpdate:     DWELL.TWIN_UPDATE_REQUEST,
};

/**
 * Maps a tool method name to the NATS subject where the Domain Twin delivers its response.
 * @adopt:dwell-twin-reply-subject-map
 */
const TOOL_REPLY_SUBJECT: Record<string, (userId: string) => string> = {
  getKnowledgeGraph: DWELL.USER_KG_DELIVERED,
  queryBridge:       DWELL.USER_BRIDGE_RESPONSE,
  requestAssessment: DWELL.USER_ASSESSMENT_DELIVERED,
  requestUpdate:     DWELL.USER_UPDATE_DELIVERED,
};

// ── Exported functions ─────────────────────────────────────────────────────

/**
 * Sends a tool-specific dwell.{twinId}.{tool} request on NATS and awaits the
 * Domain Twin's response on the user's personal inbox subject.
 *
 * This is the single directed-call gateway for all Personal Twin → Domain Twin
 * interactions (REQ-DW-ARC-01).
 *
 * @param twinId   - target Domain Twin identifier
 * @param toolName - tool method to invoke (e.g. "getKnowledgeGraph")
 * @param payload  - tool-specific request payload
 * @param userId   - learner userId; determines reply subject (only userId usage in inter-twin)
 * @param nats     - NATS client
 *
 * @sig-node DwellZipperIntertwin.callDomainTwin
 */
export function callDomainTwin(
  twinId: string,
  toolName: string,
  payload: unknown,
  userId: string,
  nats: NatsClient,
): Promise<unknown> {
  const requestFn = TOOL_REQUEST_SUBJECT[toolName];
  const replyFn = TOOL_REPLY_SUBJECT[toolName];
  if (!requestFn || !replyFn) {
    return Promise.reject(new Error(`[callDomainTwin] Unknown toolName: ${toolName}`));
  }

  const requestSubject = requestFn(twinId);
  const replySubject = replyFn(userId);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new Error(`[callDomainTwin] Timeout after ${CALL_TIMEOUT_MS}ms waiting for ${toolName} response from ${twinId}`));
    }, CALL_TIMEOUT_MS); // @adopt:dwell-twin-call-timeout-ms

    const unsub = nats.subscribe(replySubject, (data: unknown) => {
      clearTimeout(timer);
      unsub();
      resolve(data);
    });

    nats.publish(requestSubject, payload);
  });
}

/**
 * Fires dwell.{twinId}.outcome.signal to the Domain Twin.
 * Fire-and-forget — no response is expected.
 *
 * The signal carries NO personal identifiers: no userId, no email, no name.
 * Only anonymized interaction metadata. (REQ-DW-OUT-02)
 *
 * @sig-node DwellZipperIntertwin.fireOutcomeSignal
 */
export async function fireOutcomeSignal(
  twinId: string,
  signal: DwellOutcomeSignal,
  nats: NatsClient,
): Promise<void> {
  nats.publish(DWELL.TWIN_OUTCOME_SIGNAL(twinId), signal);
}

/**
 * Receives a thin dwell.domain.{twinId}.updated notification from a Domain Twin
 * channel connector and relays it into the BB as bb.domain.{domain}.change-available.
 *
 * This is how Cultivator learns of domain changes without the Domain Twin knowing
 * who is subscribed (REQ-DW-CUR-03). The BB subject carries domain only — no twinId,
 * no learner identity.
 *
 * @sig-node DwellZipperIntertwin.relayUpdateNotification
 */
export async function relayUpdateNotification(
  twinId: string,
  domain: string,
  nats: NatsClient,
): Promise<void> {
  // Relay: dwell.domain.{twinId}.updated → bb.domain.{domain}.change-available
  nats.publish(BB.DOMAIN_CHANGE_AVAILABLE(domain), { domain, detectedAt: new Date().toISOString() });
}
