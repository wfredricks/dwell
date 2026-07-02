// ============================================================
// D-16 LIBRARIAN — Module Pre-Game Blueprint
// ============================================================
//
// Curates and serves pedagogical artifacts — generic bridge card
// templates, effectiveness scores, and outcome analytics.
// Accumulates outcome signals and maintains its own analytics
// internally. Personal Twin never sees the analytics; it only
// sees ranked bridge candidates.
//
// Traceable to:
//   DWELL-FEATURES.md     — F-4 (Map the Knowledge Domain)
//   DWELL-REQUIREMENTS.md — OUT-01, OUT-02, OUT-03
//   d01-agents.cypher     — TGTModule {name: 'librarian'}
//   d05-invariants.cypher — PersonalTwinReportsDomainTwinLearns,
//                           OutcomeSignalCarriesNoPII
//
// ============================================================

MERGE (mod:TGTModule {name: 'librarian'})
SET mod.path        = 'src/domain/librarian',
    mod.capability  = 'pedagogy-curation',
    mod.tier        = 'Domain',
    mod.description = 'Curates and serves generic bridge card templates. Ranks candidates by source domain match and accumulated effectiveness score. Receives outcome signals and performs all analytics internally.'

// ──────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────

CREATE (tBridgeCardRecord:TGTType {
  name: 'BridgeCardRecord',
  kind: 'class',
  style: 'value-object',
  description: "The Domain Twin's canonical record for a bridge card template. Carries the generic text, accumulated effectiveness score, and interaction count. Personal Twin receives candidates ranked by this record; it does not see raw analytics.",
  invariants: 'effectivenessScore always 0-1; interactionCount always >= 0; lastUpdated always ISO8601'
})
CREATE (tBridgeCardRecord)-[:HAS_FIELD]->(:TGTField {name: 'bridgeId',          type: 'string',   description: 'Unique bridge card identifier'})
CREATE (tBridgeCardRecord)-[:HAS_FIELD]->(:TGTField {name: 'bridgeType',        type: 'string',   description: 'Category of bridge (analogy, example, contrast, etc.)'})
CREATE (tBridgeCardRecord)-[:HAS_FIELD]->(:TGTField {name: 'sourceAnchor',      type: 'string',   description: 'The prior-knowledge anchor concept this bridge builds from'})
CREATE (tBridgeCardRecord)-[:HAS_FIELD]->(:TGTField {name: 'targetConceptIds',  type: 'string[]', description: 'Target concept ids this bridge addresses'})
CREATE (tBridgeCardRecord)-[:HAS_FIELD]->(:TGTField {name: 'genericText',       type: 'string',   description: 'Generic bridge template text. Personal Twin personalises this for the learner.'})
CREATE (tBridgeCardRecord)-[:HAS_FIELD]->(:TGTField {name: 'effectivenessScore',type: 'number',   description: 'Accumulated effectiveness score 0-1, updated via EMA on each outcome signal'})
CREATE (tBridgeCardRecord)-[:HAS_FIELD]->(:TGTField {name: 'interactionCount',  type: 'number',   description: 'Total outcome signals received for this card'})
CREATE (tBridgeCardRecord)-[:HAS_FIELD]->(:TGTField {name: 'lastUpdated',       type: 'string',   description: 'ISO8601 timestamp of last effectiveness update'})

CREATE (tEffectivenessUpdate:TGTType {
  name: 'EffectivenessUpdate',
  kind: 'interface',
  style: 'value-object',
  description: 'Payload describing a single outcome for a bridge card. Carries no personal identifiers. Used by recordOutcome to update the EMA effectiveness score.'
})
CREATE (tEffectivenessUpdate)-[:HAS_FIELD]->(:TGTField {name: 'bridgeId',                   type: 'string',                                          description: 'Bridge card this outcome applies to'})
CREATE (tEffectivenessUpdate)-[:HAS_FIELD]->(:TGTField {name: 'outcome',                    type: "'engaged'|'thanked'|'later'|'dismissed'",          description: 'Learner response to the bridge card'})
CREATE (tEffectivenessUpdate)-[:HAS_FIELD]->(:TGTField {name: 'sourceDomains',              type: 'string[]',                                        description: 'Source domains active for this learner at interaction time'})
CREATE (tEffectivenessUpdate)-[:HAS_FIELD]->(:TGTField {name: 'bloomsAltitudeAtInteraction',type: 'number',                                          description: "Learner's Bloom's altitude at the time of interaction"})

// ──────────────────────────────────────────────────────────────
// FILES
// ──────────────────────────────────────────────────────────────

// === types.ts ===
CREATE (fTypes:TGTFile {
  name: 'types.ts',
  path: 'src/domain/librarian/types.ts',
  description: 'All Librarian types: BridgeCardRecord, EffectivenessUpdate.',
  exports: 'BridgeCardRecord, EffectivenessUpdate'
})
CREATE (fTypes)-[:CONTAINS]->(tBridgeCardRecord)
CREATE (fTypes)-[:CONTAINS]->(tEffectivenessUpdate)
CREATE (mod)-[:HAS_FILE]->(fTypes)

// === bridge-store.ts ===
CREATE (fBridgeStore:TGTFile {
  name: 'bridge-store.ts',
  path: 'src/domain/librarian/bridge-store.ts',
  description: 'Pure functions for retrieving and ranking bridge card candidates from the in-memory store. No side effects.',
  exports: 'getCandidates, rankBySourceDomainMatch'
})

CREATE (fnGetCandidates:TGTFunction {
  name: 'getCandidates',
  style: 'pure',
  async: false,
  signature: '(conceptIds: string[], sourceDomains: string[]) => BridgeCardRecord[]',
  description: 'Retrieves bridge cards from the in-memory store whose targetConceptIds intersect with conceptIds. Filters by sourceDomains. Returns sorted by effectivenessScore descending. Pure (reads from in-memory store passed as closure).'
})
CREATE (fnGetCandidates)-[:RETURNS]->(tBridgeCardRecord)

CREATE (fnRankByDomain:TGTFunction {
  name: 'rankBySourceDomainMatch',
  style: 'pure',
  async: false,
  signature: '(candidates: BridgeCardRecord[], sourceDomains: string[]) => BridgeCardRecord[]',
  description: 'Re-ranks candidates so those whose sourceAnchor aligns with the provided sourceDomains appear first, within the same effectiveness tier. Pure — does not mutate input array.'
})
CREATE (fnRankByDomain)-[:ACCEPTS]->(tBridgeCardRecord)
CREATE (fnRankByDomain)-[:RETURNS]->(tBridgeCardRecord)

CREATE (fBridgeStore)-[:CONTAINS]->(fnGetCandidates)
CREATE (fBridgeStore)-[:CONTAINS]->(fnRankByDomain)
CREATE (mod)-[:HAS_FILE]->(fBridgeStore)

// === effectiveness-tracker.ts ===
CREATE (fEffTracker:TGTFile {
  name: 'effectiveness-tracker.ts',
  path: 'src/domain/librarian/effectiveness-tracker.ts',
  description: 'Functions for updating bridge card effectiveness scores from outcome signals. recordOutcome mutates the store; updateScore is pure.',
  exports: 'recordOutcome, updateScore'
})

CREATE (fnRecordOutcome:TGTFunction {
  name: 'recordOutcome',
  style: 'effect',
  async: true,
  signature: '(update: EffectivenessUpdate) => void',
  description: 'Looks up the BridgeCardRecord for update.bridgeId, computes the new score via updateScore, increments interactionCount, and persists the mutation to the in-memory store. Effect — mutates store.'
})
CREATE (fnRecordOutcome)-[:ACCEPTS]->(tEffectivenessUpdate)

CREATE (fnUpdateScore:TGTFunction {
  name: 'updateScore',
  style: 'pure',
  async: false,
  signature: '(record: BridgeCardRecord, outcome: string) => number',
  description: 'EMA formula: newScore = 0.9 × oldScore + 0.1 × outcomeSignal. outcomeSignal mapping: engaged → 1.0, thanked → 0.8, later → 0.4, dismissed → 0.0. Returns new score only; caller applies. Pure.'
})
CREATE (fnUpdateScore)-[:ACCEPTS]->(tBridgeCardRecord)

CREATE (fEffTracker)-[:CONTAINS]->(fnRecordOutcome)
CREATE (fEffTracker)-[:CONTAINS]->(fnUpdateScore)
CREATE (mod)-[:HAS_FILE]->(fEffTracker)

// === librarian.ts ===
CREATE (fLibrarian:TGTFile {
  name: 'librarian.ts',
  path: 'src/domain/librarian/librarian.ts',
  description: 'Stateful Librarian class. Holds the BridgeCardRecord store. Serves ranked candidates on NATS query. Records outcome signals from the outcome signal stream.',
  exports: 'Librarian'
})

CREATE (fnOnBridgeQuery:TGTFunction {
  name: 'onBridgeQuery',
  style: 'effect',
  async: true,
  signature: "(payload: dwell.{twinId}.bridge.query, replySubject: string) => void",
  description: 'NATS subscription handler. Calls getCandidates, then rankBySourceDomainMatch, then publishes ranked BridgeCardRecord[] to replySubject. Effect — publishes to NATS transport.'
})
CREATE (fnOnBridgeQuery)-[:RETURNS]->(tBridgeCardRecord)

CREATE (fnOnOutcomeSignal:TGTFunction {
  name: 'onOutcomeSignal',
  style: 'effect',
  async: true,
  signature: '(signal: OutcomeSignal) => void',
  description: 'NATS subscription handler for dwell.{twinId}.outcome.signal. If signal references a bridgeId, constructs an EffectivenessUpdate and calls recordOutcome. Effect — mutates bridge store.'
})
CREATE (fnOnOutcomeSignal)-[:ACCEPTS]->(tEffectivenessUpdate)

CREATE (fLibrarian)-[:CONTAINS]->(fnOnBridgeQuery)
CREATE (fLibrarian)-[:CONTAINS]->(fnOnOutcomeSignal)
CREATE (mod)-[:HAS_FILE]->(fLibrarian)

// ──────────────────────────────────────────────────────────────
// INVARIANTS ENFORCED
// ──────────────────────────────────────────────────────────────

// Trace: d05-invariants.cypher — PersonalTwinReportsDomainTwinLearns
CREATE (mod)-[:ENFORCES]->(:TGTInvariantRef {
  name: 'PersonalTwinReportsDomainTwinLearns',
  note: 'The Librarian owns all analytics and clustering. It consumes lean outcome signals and performs EMA updates internally. The Personal Twin never computes effectiveness scores.'
})

// Trace: d05-invariants.cypher — OutcomeSignalCarriesNoPII
CREATE (mod)-[:ENFORCES]->(:TGTInvariantRef {
  name: 'OutcomeSignalCarriesNoPII',
  note: 'EffectivenessUpdate carries no twin id or personal identifier. sourceDomains and bloomsAltitudeAtInteraction are domain-level facts only.'
})
