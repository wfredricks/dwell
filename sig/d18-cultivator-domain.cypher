// ============================================================
// D-18 DOMAIN TWIN CULTIVATOR — Module Pre-Game Blueprint
// ============================================================
//
// Keeps the Domain Twin's knowledge graph current. Watches
// external sources (cert body feeds, changelog monitors).
// Pre-curates change deltas. Notifies connected Personal Twins
// via thin broadcast. Delivers deltas on request.
//
// Distinct from the Personal Twin Cultivator (d13).
//
// Traceable to: DWELL-FEATURES.md F-4.3,
// DWELL-REQUIREMENTS.md REQ-DW-CUR-01 through CUR-04,
// Invariants DomainTwinDoesNotTrackSubscribers,
// ChannelConnectorIsSubscription
//
// ============================================================

MERGE (mod:TGTModule {name: 'domain-cultivator'})
SET mod.path = 'src/domain-twin/cultivator',
    mod.capability = 'DW-DT-04',
    mod.twin = 'domain',
    mod.tier = 'Dwell-DomainTwin',
    mod.description = 'Keeps the Domain Twin knowledge graph current. Watches external sources. Pre-curates deltas when changes are detected. Emits thin broadcast notifications through channel connectors — does not track subscribers. Delivers pre-curated delta on request.'

// ──────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────

CREATE (tDomainChangeEvent:TGTType {
  name: 'DomainChangeEvent',
  kind: 'interface',
  style: 'pure',
  description: 'A single detected change to the domain knowledge graph.'
})
CREATE (tDomainChangeEvent)-[:HAS_FIELD]->(:TGTField {name: 'changeType',  type: "'added' | 'deprecated' | 'modified' | 'reweighted'", required: true,  description: 'Nature of the change'})
CREATE (tDomainChangeEvent)-[:HAS_FIELD]->(:TGTField {name: 'conceptId',   type: 'string',                                              required: true,  description: 'Affected concept node'})
CREATE (tDomainChangeEvent)-[:HAS_FIELD]->(:TGTField {name: 'severity',    type: "'minor' | 'major'",                                   required: true,  description: 'Impact severity'})
CREATE (tDomainChangeEvent)-[:HAS_FIELD]->(:TGTField {name: 'changeNote',  type: 'string',                                              required: true,  description: 'Human-readable description of what changed'})
CREATE (tDomainChangeEvent)-[:HAS_FIELD]->(:TGTField {name: 'detectedAt',  type: 'ISO8601',                                             required: true,  description: 'When the change was detected'})

CREATE (tDomainDelta:TGTType {
  name: 'DomainDelta',
  kind: 'class',
  style: 'value-object',
  description: 'Pre-curated package of changes between two graph versions. Built proactively on change detection; delivered on request. Immutable.',
  invariants: 'fromVersion always less than toVersion; affectedConcepts never empty'
})
CREATE (tDomainDelta)-[:HAS_FIELD]->(:TGTField {name: 'fromVersion',       type: 'string',               required: true,  description: 'Graph version this delta applies from'})
CREATE (tDomainDelta)-[:HAS_FIELD]->(:TGTField {name: 'toVersion',         type: 'string',               required: true,  description: 'Graph version this delta brings the receiver to'})
CREATE (tDomainDelta)-[:HAS_FIELD]->(:TGTField {name: 'affectedConcepts',  type: 'DomainChangeEvent[]',  required: true,  description: 'All changes in this delta'})
CREATE (tDomainDelta)-[:HAS_FIELD]->(:TGTField {name: 'preparedAt',        type: 'ISO8601',              required: true,  description: 'When this delta was pre-curated'})

// ──────────────────────────────────────────────────────────────
// FILES
// ──────────────────────────────────────────────────────────────

CREATE (fTypes:TGTFile {
  name: 'types.ts',
  path: 'src/domain-twin/cultivator/types.ts',
  description: 'DomainChangeEvent, DomainDelta.',
  exports: 'DomainChangeEvent, DomainDelta'
})

CREATE (fChangeWatcher:TGTFile {
  name: 'change-watcher.ts',
  path: 'src/domain-twin/cultivator/change-watcher.ts',
  description: 'Watches external sources (cert body feeds, changelog monitors). Detects changes against current graph version. Produces DomainChangeEvent[].',
  exports: 'watchExternalSources, detectChanges'
})

CREATE (fDeltaBuilder:TGTFile {
  name: 'delta-builder.ts',
  path: 'src/domain-twin/cultivator/delta-builder.ts',
  description: 'Assembles pre-curated DomainDelta packages from detected changes.',
  exports: 'buildDelta'
})

CREATE (fUpdateNotifier:TGTFile {
  name: 'update-notifier.ts',
  path: 'src/domain-twin/cultivator/update-notifier.ts',
  description: 'Emits thin broadcast notifications and delivers pre-curated deltas on request. Does not maintain subscriber list.',
  exports: 'notifyConnectedTwins, deliverDelta'
})

CREATE (fDomainCultivator:TGTFile {
  name: 'domain-cultivator.ts',
  path: 'src/domain-twin/cultivator/domain-cultivator.ts',
  description: 'Stateful orchestrator. Holds current graph version and stored deltas. Reacts to change detection and update requests.',
  exports: 'DomainCultivator, createDomainCultivator'
})

CREATE (fIndex:TGTFile {
  name: 'index.ts',
  path: 'src/domain-twin/cultivator/index.ts',
  description: 'Barrel export.',
  exports: 'All types, DomainCultivator, createDomainCultivator'
})

CREATE (mod)-[:CONTAINS]->(fTypes)
CREATE (mod)-[:CONTAINS]->(fChangeWatcher)
CREATE (mod)-[:CONTAINS]->(fDeltaBuilder)
CREATE (mod)-[:CONTAINS]->(fUpdateNotifier)
CREATE (mod)-[:CONTAINS]->(fDomainCultivator)
CREATE (mod)-[:CONTAINS]->(fIndex)

CREATE (fTypes)-[:CONTAINS]->(tDomainChangeEvent)
CREATE (fTypes)-[:CONTAINS]->(tDomainDelta)

// ──────────────────────────────────────────────────────────────
// FUNCTIONS — change-watcher.ts
// ──────────────────────────────────────────────────────────────

CREATE (fnWatch:TGTFunction {
  name: 'watchExternalSources',
  signature: '(sources: ExternalSource[], onChange: (events: DomainChangeEvent[]) => void) => Subscription',
  style: 'effect',
  async: true,
  description: 'Subscribes to configured external sources (cert body feeds, changelog monitors). Calls onChange when changes are detected. Runs continuously. Effect.'
})
CREATE (fChangeWatcher)-[:CONTAINS]->(fnWatch)

CREATE (fnDetect:TGTFunction {
  name: 'detectChanges',
  signature: '(currentGraph: DomainKnowledgeGraph, newSourceData: unknown) => DomainChangeEvent[]',
  style: 'pure',
  async: false,
  description: 'Compares current graph to new source data. Identifies added, deprecated, modified, and reweighted concepts. Returns list of DomainChangeEvents. Pure — given same inputs, same output.'
})
CREATE (fChangeWatcher)-[:CONTAINS]->(fnDetect)

// ──────────────────────────────────────────────────────────────
// FUNCTIONS — delta-builder.ts (pure)
// ──────────────────────────────────────────────────────────────

CREATE (fnBuildDelta:TGTFunction {
  name: 'buildDelta',
  signature: '(fromVersion: string, toVersion: string, changes: DomainChangeEvent[]) => DomainDelta',
  style: 'pure',
  async: false,
  description: 'Assembles a DomainDelta from a list of changes and version strings. Pure — builds the package, does not store or deliver it.'
})
CREATE (fDeltaBuilder)-[:CONTAINS]->(fnBuildDelta)

// ──────────────────────────────────────────────────────────────
// FUNCTIONS — update-notifier.ts (effect)
// ──────────────────────────────────────────────────────────────

CREATE (fnNotify:TGTFunction {
  name: 'notifyConnectedTwins',
  signature: '(twinId: string, domain: string) => void',
  style: 'effect',
  async: false,
  description: 'Emits dwell.domain.{twinId}.updated through channel connectors. Thin broadcast — payload contains only twinId, domain, and notifiedAt timestamp. No change detail. No subscriber list maintained. DomainTwinDoesNotTrackSubscribers invariant enforced here.'
})
CREATE (fUpdateNotifier)-[:CONTAINS]->(fnNotify)

CREATE (fnDeliver:TGTFunction {
  name: 'deliverDelta',
  signature: '(delta: DomainDelta, replySubject: string) => void',
  style: 'effect',
  async: true,
  description: 'Delivers a pre-curated DomainDelta to the requesting Personal Twin at replySubject (dwell.{userId}.update.delivered). The delta was prepared proactively on change detection — this function only delivers what is already packaged.'
})
CREATE (fUpdateNotifier)-[:CONTAINS]->(fnDeliver)

// ──────────────────────────────────────────────────────────────
// FUNCTIONS — domain-cultivator.ts (stateful)
// ──────────────────────────────────────────────────────────────

CREATE (tDomainCultivatorClass:TGTType {
  name: 'DomainCultivator',
  kind: 'class',
  style: 'stateful-class',
  description: 'Orchestrates change detection, delta preparation, and update notification. Holds the current graph version and a store of prepared deltas indexed by fromVersion.',
  constructorDeps: 'graph: DomainKnowledgeGraph, sources: ExternalSource[]'
})
CREATE (fDomainCultivator)-[:CONTAINS]->(tDomainCultivatorClass)

CREATE (fnOnChangeDetected:TGTFunction {
  name: 'onChangeDetected',
  signature: '(changes: DomainChangeEvent[]) => void',
  style: 'effect',
  async: false,
  description: 'Called when watchExternalSources detects changes. Increments graph version. Builds DomainDelta via buildDelta. Stores delta. Calls notifyConnectedTwins. Effect.'
})
CREATE (fDomainCultivator)-[:CONTAINS]->(fnOnChangeDetected)

CREATE (fnOnUpdateRequest:TGTFunction {
  name: 'onUpdateRequest',
  signature: '(payload: { sinceVersion: string }, replySubject: string) => void',
  style: 'effect',
  async: true,
  description: 'Receives dwell.{twinId}.update.request. Retrieves the stored DomainDelta for sinceVersion. Calls deliverDelta. Effect.'
})
CREATE (fDomainCultivator)-[:CONTAINS]->(fnOnUpdateRequest)

// ──────────────────────────────────────────────────────────────
// INVARIANTS ENFORCED
// ──────────────────────────────────────────────────────────────

CREATE (invNoSubscribers:TGTInvariant {
  name: 'DomainTwinDoesNotTrackSubscribersEnforced',
  rule: 'notifyConnectedTwins must not iterate a subscriber list. It emits once on the channel connector infrastructure. NATS fan-out handles delivery to all connected Personal Twins.',
  scope: 'domain-cultivator',
  enforcedIn: 'update-notifier.ts:notifyConnectedTwins'
})

CREATE (invThinBroadcast:TGTInvariant {
  name: 'ThinBroadcastNotDetailPush',
  rule: 'The dwell.domain.{twinId}.updated payload must contain only: twinId, domain, notifiedAt. No change detail, no affected concept list, no delta. Detail is delivered only on explicit request.',
  scope: 'domain-cultivator',
  enforcedIn: 'update-notifier.ts:notifyConnectedTwins'
})

// ──────────────────────────────────────────────────────────────
// DEPENDENCIES
// ──────────────────────────────────────────────────────────────

CREATE (mod)-[:DEPENDS_ON]->(:TGTModuleRef {name: 'cartographer', capability: 'DW-DT-01', reason: 'Reads current DomainKnowledgeGraph for change comparison'})

;
