// ============================================================
// D-05 SYSTEM INVARIANTS — SIG Pre-Game Blueprint
// ============================================================
//
// TGTInvariant nodes for every system rule in the Dwell
// architecture.
// Traceable to: DWELL-EVENT-ARCHITECTURE.md — Namespace Rules,
// The Zipper, Routing Type Vocabulary, Bloom's Altitude Model,
// Domain Currency Protocol, and design decisions.
//
// Node Label: TGTInvariant
//
// ============================================================

// ──────────────────────────────────────────────────────────────
// ARCHITECTURE INVARIANTS
// ──────────────────────────────────────────────────────────────

// Trace: DWELL-EVENT-ARCHITECTURE.md — Namespace Rules
// "bb.* communications never leave the twin."
CREATE (:TGTInvariant {
  name: 'BbNeverLeavesTheTwin',
  rule: 'bb.* events never cross twin boundaries. They coordinate agents within a single twin only.',
  scope: 'architecture'
})

// Trace: DWELL-EVENT-ARCHITECTURE.md — The Zipper
// "The only agent that straddles bb.* and dwell.*."
// "Every other agent works exclusively on the BB and never interacts with inter-twin communication directly."
CREATE (:TGTInvariant {
  name: 'ZipperIsOnlyCrossBoundaryAgent',
  rule: 'Only the Zipper straddles bb.* and dwell.*. All other Personal Twin agents work exclusively on the BB.',
  scope: 'architecture'
})

// Trace: DWELL-EVENT-ARCHITECTURE.md — Outcome Signal Protocol
// "Personal Twin reports; Domain Twin learns."
// "Domain Twin Librarian accumulates these signals over time and performs its own internal clustering."
CREATE (:TGTInvariant {
  name: 'PersonalTwinReportsDomainTwinLearns',
  rule: 'Personal Twin emits lean outcome signals (what happened). Domain Twin does all analytics, clustering, and pattern recognition internally.',
  scope: 'outcome-signal'
})

// Trace: DWELL-EVENT-ARCHITECTURE.md — Outcome Signal Protocol
// "The signal ... contains domain-level facts about an interaction, not personal data."
// "No cluster label is computed or attached by the Personal Twin."
CREATE (:TGTInvariant {
  name: 'OutcomeSignalCarriesNoPII',
  rule: 'dwell.{twinId}.outcome.signal must never contain a personal identifier, a twin id traceable to a specific person, or any field from the learner\'s personal knowledge graph.',
  scope: 'privacy'
})

// Trace: DWELL-EVENT-ARCHITECTURE.md — Bloom's Altitude Model
// "To reach altitude N, all levels 1 through N must be traversed in sequence. There is no skipping."
CREATE (:TGTInvariant {
  name: 'BloomsAltitudeIsCumulative',
  rule: 'To reach altitude N, all levels 1 through N must be traversed in sequence. No skipping.',
  scope: 'pedagogy'
})

// Trace: DWELL-EVENT-ARCHITECTURE.md — Two Distinct Altitude Values
// "bloomsTargetAltitude — set by the course or cert offering. The Domain Twin owns this.
//  Learners never set it directly."
CREATE (:TGTInvariant {
  name: 'DomainTwinSetsCeiling',
  rule: 'bloomsTargetAltitude is set by the Domain Twin / course offering. Learners never set their own target altitude directly.',
  scope: 'pedagogy'
})

// Trace: DWELL-EVENT-ARCHITECTURE.md — Domain Twin Regulates Both Ceiling and Floor
// "Floor = bloomsCurrentAltitude + 1 — where content starts for this learner on this node"
// "A warm student receives content starting at Analyze (4). A cold student receives content starting at Remember (1)."
CREATE (:TGTInvariant {
  name: 'LearnerBaselineSetsFloor',
  rule: 'Content floor per node = bloomsCurrentAltitude + 1. Domain Twin never serves content at or below the learner\'s current altitude.',
  scope: 'pedagogy'
})

// Trace: DWELL-EVENT-ARCHITECTURE.md — The Zipper
// "Discovery happens at connection time. When an internal agent raises a need, the Zipper already
//  knows which tools can satisfy it — there is no per-need discovery broadcast at the agent level."
// "The dwell.broadcast.discovery subject exists as the Zipper's own connection-time mechanism,
//  not as an agent-facing operation."
CREATE (:TGTInvariant {
  name: 'DiscoveryIsRegistrationNotPerNeedBroadcast',
  rule: 'Domain Twin registration happens at Zipper connection time (MCP channel connect). No per-need discovery broadcast is issued to already-connected Domain Twins.',
  scope: 'architecture'
})

// Trace: DWELL-EVENT-ARCHITECTURE.md — The Zipper
// "everything looks like a tool. A Domain Twin is a tool. A methodology server is a tool.
//  An external API is a tool."
// "The inter-twin event catalog in Part 2 describes communication between the Zipper and its
//  connected MCP servers. Internal agents never see dwell.* subjects."
CREATE (:TGTInvariant {
  name: 'EverythingOnZipperLooksLikeATool',
  rule: 'The Zipper exposes all external capabilities (Domain Twins, methodology servers, external APIs) as tools via MCP channel connectors. Internal agents do not know or care about the underlying transport.',
  scope: 'architecture'
})

// Trace: DWELL-EVENT-ARCHITECTURE.md — The Zipper, Resolves #1
// "Subscription management is NATS subscription to the Domain Twin's update notification channel,
//  handled by the Zipper at connection time. No explicit subscription event needed."
// "the channel connector IS the subscription"
CREATE (:TGTInvariant {
  name: 'ChannelConnectorIsSubscription',
  rule: 'Establishing an MCP channel connector to a Domain Twin IS the staleness subscription. No explicit subscription management event is needed.',
  scope: 'architecture'
})

// Trace: DWELL-EVENT-ARCHITECTURE.md — Domain Currency Protocol
// "Domain Twin does not push change details to individual Personal Twins."
// "The Domain Twin never needs to know who is subscribed."
CREATE (:TGTInvariant {
  name: 'DomainTwinDoesNotTrackSubscribers',
  rule: 'Domain Twins emit dwell.domain.{twinId}.updated as a thin broadcast through channel connectors. They do not maintain subscriber lists or push change details to individual inboxes.',
  scope: 'architecture'
})
