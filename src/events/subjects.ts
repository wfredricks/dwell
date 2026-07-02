/**
 * Dwell NATS Subject Constants
 *
 * All Dwell communications live on two namespaces:
 *   bb.*    — intra-twin (agents within a single twin coordinating on the BB)
 *   dwell.* — inter-twin (Zipper ↔ Domain Twin across constellation boundaries)
 *
 * Rule: bb.* never leaves the twin. dwell.* always crosses a twin boundary.
 *
 * @namespace dwell
 * @adopt:dwell-nats-namespace  [resolved: bb.* and dwell.*]
 */

// ── Intra-Twin Subjects (bb.*) ────────────────────────────────────────────

export const BB = {
  // Intent & Lifecycle
  INTENT_DECLARED:              'bb.intent.declared',
  CERT_ACHIEVED:                (domain: string) => `bb.cert.${domain}.achieved`,

  // Learner Model
  LEARNER_BASELINE:             (domain: string) => `bb.learner.${domain}.baseline`,
  LEARNER_PREFERENCES_UPDATED:  'bb.learner.preferences.updated',

  // Mastery
  MASTERY_INITIALIZED:          (domain: string) => `bb.mastery.${domain}.initialized`,
  MASTERY_UPDATED:              (domain: string) => `bb.mastery.${domain}.updated`,

  // Gaps
  GAPS_INITIAL:                 (domain: string) => `bb.gaps.${domain}.initial`,
  GAPS_UPDATED:                 (domain: string) => `bb.gaps.${domain}.updated`,
  GAPS_POST_CERT:               (domain: string) => `bb.gaps.${domain}.post-cert`,

  // Path
  PATH_READY:                   (domain: string) => `bb.path.${domain}.ready`,
  PATH_UPDATED:                 (domain: string) => `bb.path.${domain}.updated`,

  // Bridge
  BRIDGE_REQUESTED:             'bb.bridge.requested',
  BRIDGE_READY:                 'bb.bridge.ready',

  // Assessment
  ASSESSMENT_DIAGNOSTIC:        (topic: string) => `bb.assessment.diagnostic.${topic}`,
  ASSESSMENT_OUTCOME:           'bb.assessment.outcome',

  // Attention (Donna)
  SYNTHESIS_COMPLETED:          'bb.synthesis.completed',
  ATTENTION_SURFACED:           'bb.attention.surfaced',
  ATTENTION_OUTCOME:            'bb.attention.outcome',

  // Domain Currency
  DOMAIN_UPDATED:               (domain: string) => `bb.domain.${domain}.updated`,
  DOMAIN_CHANGE_AVAILABLE:      (domain: string) => `bb.domain.${domain}.change-available`,
  STALENESS_WATCH_ACTIVE:       (domain: string) => `bb.staleness.watch.${domain}.active`,

  // Answer / Contribution / Need (Zipper ↔ agents)
  ANSWER:                       (kind: string) => `bb.answer.${kind}`,
  CONTRIBUTION:                 (kind: string) => `bb.contribution.${kind}`,
  NEED:                         (kind: string) => `bb.need.${kind}`,
} as const;

// ── Inter-Twin Subjects (dwell.*) ─────────────────────────────────────────
// Written by the Zipper. Never seen directly by internal agents.
// Subjects encode the addressee — no routing data in payloads.
//   dwell.broadcast.>     — no owner; any Domain Twin listens
//   dwell.{userId}.>      — Personal Twin's inbox
//   dwell.{twinId}.>      — Domain Twin's inbox

export const DWELL = {
  // Discovery (broadcast — no owner)
  BROADCAST_DISCOVERY:          'dwell.broadcast.discovery',

  // Personal Twin inbox (userId-addressed)
  USER_DISCOVERY_RESPONSE:      (userId: string) => `dwell.${userId}.discovery.response`,
  USER_DOMAIN_GAP:              (userId: string) => `dwell.${userId}.domain.gap`,
  USER_KG_DELIVERED:            (userId: string) => `dwell.${userId}.kg.delivered`,
  USER_BRIDGE_RESPONSE:         (userId: string) => `dwell.${userId}.bridge.response`,
  USER_ASSESSMENT_DELIVERED:    (userId: string) => `dwell.${userId}.assessment.delivered`,
  USER_UPDATE_DELIVERED:        (userId: string) => `dwell.${userId}.update.delivered`,

  // Domain Twin inbox (twinId-addressed)
  TWIN_KG_REQUEST:              (twinId: string) => `dwell.${twinId}.kg.request`,
  TWIN_BRIDGE_QUERY:            (twinId: string) => `dwell.${twinId}.bridge.query`,
  TWIN_ASSESSMENT_REQUEST:      (twinId: string) => `dwell.${twinId}.assessment.request`,
  TWIN_OUTCOME_SIGNAL:          (twinId: string) => `dwell.${twinId}.outcome.signal`,
  TWIN_UPDATE_REQUEST:          (twinId: string) => `dwell.${twinId}.update.request`,

  // Domain currency broadcast (through channel connector)
  DOMAIN_UPDATED:               (twinId: string) => `dwell.domain.${twinId}.updated`,

  // Dwell lifecycle
  MOUNTED:                      'dwell.mounted',
  UNMOUNTED:                    'dwell.unmounted',
} as const;
