// ============================================================
// D-01 DWELL AGENTS — SIG Pre-Game Blueprint
// ============================================================
//
// TGTModule nodes for every agent in the Dwell event architecture.
// Traceable to: DWELL-EVENT-ARCHITECTURE.md Part 3 — Agent-to-Event Map
//
// Node Labels: TGTModule
// twin values: 'personal' | 'domain'
// existing: true if the agent already exists in artifacts/udt-rebuild/
//
// ============================================================

// ──────────────────────────────────────────────────────────────
// PERSONAL TWIN AGENTS
// ──────────────────────────────────────────────────────────────

// Trace: Part 3 — Personal Twin Agents table
// "The Zipper already exists in UDT as F-1"
CREATE (:TGTModule {
  name: 'zipper',
  twin: 'personal',
  description: 'Universal processing pipeline and declarative tool layer. The only agent that straddles bb.* and dwell.*. Maintains channel connectors (MCP connections) to all connected Domain Twins. Everything on the Zipper looks like a tool. Calls/fires all dwell.* subjects; emits bb.domain.<domain>.change-available and bb.contribution.*; consumes all bb.need.* events and all inbound dwell.{userId}.* responses.',
  capability: 'tool-layer',
  existing: true
})

// Trace: Part 3 — Antiquarian row
CREATE (:TGTModule {
  name: 'antiquarian',
  twin: 'personal',
  description: 'Reads Bill\'s prior knowledge and history. Produces the initial domain baseline from evidence sources (project notes, certs, etc.). Emits bb.learner.<domain>.baseline. Consumes bb.intent.declared and bb.cert.<domain>.achieved.',
  capability: 'prior-knowledge-extraction',
  existing: false
})

// Trace: Part 3 — Calibrator row
CREATE (:TGTModule {
  name: 'calibrator',
  twin: 'personal',
  description: 'Reconciles the domain knowledge graph against the learner baseline to produce mastery estimates. Tracks Bloom\'s altitude per concept node. Emits bb.mastery.<domain>.initialized and bb.mastery.<domain>.updated. Consumes bb.learner.<domain>.baseline, bb.assessment.outcome, bb.attention.outcome.',
  capability: 'mastery-tracking',
  existing: false
})

// Trace: Part 3 — Surveyor row
CREATE (:TGTModule {
  name: 'surveyor',
  twin: 'personal',
  description: 'Performs gap cluster analysis on the mastery state. Detects knowledge gaps, drift, bridge needs, and convergent-misconception risks. Files bridge requests when Calibrator signals a confidence plateau. Emits bb.gaps.<domain>.initial, bb.gaps.<domain>.updated, bb.gaps.<domain>.post-cert, bb.bridge.requested. Consumes bb.mastery.<domain>.initialized, bb.mastery.<domain>.updated, bb.domain.<domain>.updated.',
  capability: 'gap-detection',
  existing: false
})

// Trace: Part 3 — Gatekeeper row
CREATE (:TGTModule {
  name: 'gatekeeper',
  twin: 'personal',
  description: 'Generates the ordered learning path from mastery state, gap clusters, and learner preferences. Updates path when domain graph or preferences change. Emits bb.path.<domain>.ready and bb.path.<domain>.updated. Consumes bb.mastery.<domain>.initialized, bb.mastery.<domain>.updated, bb.gaps.<domain>.*, bb.learner.preferences.updated, bb.domain.<domain>.updated.',
  capability: 'path-planning',
  existing: false
})

// Trace: Part 3 — Bridge row
CREATE (:TGTModule {
  name: 'bridge',
  twin: 'personal',
  description: 'Synthesizes personalized connection cards that relate Bill\'s prior knowledge anchors to target concepts. Calls the Domain Twin Librarian for generic bridge templates and synthesizes them with Bill\'s mental model. Emits bb.bridge.ready. Consumes bb.bridge.requested, bb.attention.outcome, bb.answer.bridge.',
  capability: 'synthesis',
  existing: false
})

// Trace: Part 3 — Answer Agent row; Part 4 Open Question #5 resolution
CREATE (:TGTModule {
  name: 'answer-agent',
  twin: 'personal',
  description: 'Evaluates multiple contributions landing on the BB (e.g. multiple Domain Twin discovery responses) using full BB context — mastery state, gaps, learner profile. Selects or ranks them and posts as bb.answer.*. For discovery: evaluates by coverage, qualityScore, crossDomainSupport, and specificity; may connect to multiple Domain Twins simultaneously.',
  capability: 'synthesis',
  existing: false
})

// Trace: Part 3 — Engagement Agent row; Part 4 Open Question #5 resolution
// "Engagement Agent exists in foundation/attention/engagement-agent.ts"
CREATE (:TGTModule {
  name: 'engagement-agent',
  twin: 'personal',
  description: 'Routes Answer Agent selections to the correct downstream consumer (Donna, Calibrator, Gatekeeper, or Zipper). Existing twin agent. Emits routing decisions. Consumes bb.answer.*.',
  capability: 'routing',
  existing: true
})

// Trace: Part 3 — Cultivator row
CREATE (:TGTModule {
  name: 'cultivator',
  twin: 'personal',
  description: 'Registers and maintains staleness watches for mastered domains. Receives domain change notifications through the Zipper channel connector and relays them to the BB. Emits bb.staleness.watch.<domain>.active, bb.domain.<domain>.updated. Consumes bb.cert.<domain>.achieved and bb.domain.<domain>.change-available.',
  capability: 'domain-currency',
  existing: false
})

// Trace: Part 3 — Donna row
CREATE (:TGTModule {
  name: 'donna',
  twin: 'personal',
  description: 'Read-only consumer of the BB. Surfaces learning items, bridge cards, gaps, and briefs to Bill at the right moment based on his mode. Emits bb.attention.surfaced. Consumes bb.bridge.ready, bb.gaps.<domain>.*, bb.path.<domain>.ready, bb.synthesis.completed, bb.mastery.<domain>.updated, bb.attention.outcome.',
  capability: 'attention-management',
  existing: true
})

// ──────────────────────────────────────────────────────────────
// DOMAIN TWIN AGENTS
// ──────────────────────────────────────────────────────────────

// Trace: Part 3 — Domain Twin Agents table

CREATE (:TGTModule {
  name: 'cartographer',
  twin: 'domain',
  description: 'Owns and serves the Domain Twin\'s knowledge graph — concept nodes, prerequisite edges, curated batches, misconception catalog, bloomsTargetAltitude per node. Responds to kg.request calls with the full graph curated for the requesting learner\'s baseline. Emits dwell.{userId}.kg.delivered. Consumes dwell.{twinId}.kg.request.',
  capability: 'knowledge-graph',
  existing: false
})

CREATE (:TGTModule {
  name: 'librarian',
  twin: 'domain',
  description: 'Curates and serves pedagogical artifacts — generic bridge card templates, effectiveness scores, learner profile cluster data. Accumulates outcome signals over time and performs internal analytics/clustering. Emits dwell.{userId}.bridge.response. Consumes dwell.{twinId}.bridge.query and dwell.{twinId}.outcome.signal.',
  capability: 'pedagogy-curation',
  existing: false
})

CREATE (:TGTModule {
  name: 'tester',
  twin: 'domain',
  description: 'Generates calibrated diagnostic and assessment items at the requested Bloom\'s level and concept scope. Accumulates outcome signals for item calibration. Emits dwell.{userId}.assessment.delivered. Consumes dwell.{twinId}.assessment.request and dwell.{twinId}.outcome.signal.',
  capability: 'assessment',
  existing: false
})

// Trace: Part 3 — Domain Twin Cultivator row
CREATE (:TGTModule {
  name: 'domain-cultivator',
  twin: 'domain',
  description: 'Monitors external cert body feeds and changelog sources. Emits thin change notifications when the domain knowledge graph updates. Serves pre-curated change deltas on request. Emits dwell.domain.{twinId}.updated, dwell.{userId}.update.delivered. Consumes external sources and dwell.{twinId}.update.request.',
  capability: 'domain-currency',
  existing: false
})

// Trace: Part 3 — self-announcement row
// The Domain Twin itself handles discovery; no separate named agent in the spec
// so we model it as the domain-twin-discovery capability on the Domain Twin module
CREATE (:TGTModule {
  name: 'domain-twin',
  twin: 'domain',
  description: 'The Domain Twin itself. Self-announces in response to discovery broadcasts. Emits dwell.{userId}.discovery.response. Consumes dwell.broadcast.discovery.',
  capability: 'discovery',
  existing: false
})
