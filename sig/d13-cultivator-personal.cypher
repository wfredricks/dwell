// ============================================================
// D-13 CULTIVATOR (Personal Twin) — Code-as-Graph (Pre-Game Blueprint)
// ============================================================
//
// The staleness watcher. When a learner achieves a certification,
// Cultivator activates a persistent watch on that domain. When
// the Domain Twin's knowledge graph changes, Cultivator receives
// the thin notification through the Zipper channel connector,
// pulls the pre-curated delta, and posts to the BB for Surveyor
// and Gatekeeper to act on.
//
// NOTE: This is the Personal Twin Cultivator. It is distinct
//       from the Domain Twin Cultivator (domain-cultivator,
//       to be specified in d18). They share a name but operate
//       on opposite sides of the twin boundary.
//
// Key relationships:
//   - Consumes bb.cert.<domain>.achieved (from Antiquarian/Calibrator)
//   - Subscribes to dwell.domain.{twinId}.updated via Zipper
//   - Calls Domain Twin update endpoint via Zipper to pull delta
//   - Posts bb.domain.<domain>.updated for Surveyor and Gatekeeper
//
// Traceability: F-4.3 (Keep Domain Knowledge Current),
//               F-8.2 (Keep Mastery Current as Domains Evolve),
//               REQ-DW-CUR-01..04, REQ-DW-LGM-03
//
// ============================================================

// ──────────────────────────────────────────────────────────────
// MODULE — MERGE (declared in d01-agents.cypher)
// ──────────────────────────────────────────────────────────────

MERGE (mod:TGTModule {name: 'cultivator'})

// ──────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────

CREATE (tStalenessWatch:TGTType {
  name: 'StalenessWatch',
  kind: 'class',
  style: 'value-object',
  description: 'An active staleness watch record for a certified domain. Created when a certification is achieved; persists until the learner\'s mastery is explicitly archived. Held in the Cultivator\'s stateful watch map.',
  invariants: 'twinId always present; achievedAt always ISO8601; firstReviewAt always >= achievedAt'
})
CREATE (tStalenessWatch)-[:HAS_FIELD]->(:TGTField {name: 'domain',        type: 'string', description: 'Domain identifier this watch covers (e.g. "aws-solutions-architect")'})
CREATE (tStalenessWatch)-[:HAS_FIELD]->(:TGTField {name: 'certName',      type: 'string', description: 'Human-readable certification name (e.g. "AWS SAA-C03")'})
CREATE (tStalenessWatch)-[:HAS_FIELD]->(:TGTField {name: 'achievedAt',    type: 'string', description: 'ISO8601 timestamp when certification was achieved'})
CREATE (tStalenessWatch)-[:HAS_FIELD]->(:TGTField {name: 'twinId',        type: 'string', description: 'ID of the Domain Twin whose updates are being watched'})
CREATE (tStalenessWatch)-[:HAS_FIELD]->(:TGTField {name: 'firstReviewAt', type: 'string', description: 'ISO8601 timestamp of first change notification received after activation'})

CREATE (tDomainUpdate:TGTType {
  name: 'DomainUpdate',
  kind: 'interface',
  style: 'pure',
  description: 'Pre-curated change delta pulled from the Domain Twin on receipt of a staleness notification. Describes which concept nodes changed, how, and how severely. Consumed by Surveyor and Gatekeeper via BB post.',
  invariants: 'affectedConcepts never empty; fromVersion and toVersion always present'
})
CREATE (tDomainUpdate)-[:HAS_FIELD]->(:TGTField {name: 'twinId',           type: 'string',    description: 'Domain Twin ID that produced this update'})
CREATE (tDomainUpdate)-[:HAS_FIELD]->(:TGTField {name: 'domain',           type: 'string',    description: 'Domain identifier'})
CREATE (tDomainUpdate)-[:HAS_FIELD]->(:TGTField {name: 'fromVersion',      type: 'string',    description: 'Knowledge graph version this delta transitions from'})
CREATE (tDomainUpdate)-[:HAS_FIELD]->(:TGTField {name: 'toVersion',        type: 'string',    description: 'Knowledge graph version this delta transitions to'})
CREATE (tDomainUpdate)-[:HAS_FIELD]->(:TGTField {name: 'affectedConcepts', type: 'AffectedConceptEntry[]', description: 'Concept nodes changed in this update with change type, severity, and change note'})

CREATE (tAffectedConceptEntry:TGTType {
  name: 'AffectedConceptEntry',
  kind: 'interface',
  style: 'pure',
  description: 'One entry in DomainUpdate.affectedConcepts. Describes a single concept node change in the domain knowledge graph update.'
})
CREATE (tAffectedConceptEntry)-[:HAS_FIELD]->(:TGTField {name: 'conceptId',   type: 'string', description: 'Concept node ID that changed'})
CREATE (tAffectedConceptEntry)-[:HAS_FIELD]->(:TGTField {name: 'changeType',  type: 'string', description: 'Type of change: added | removed | reweighted | deprecated | modified'})
CREATE (tAffectedConceptEntry)-[:HAS_FIELD]->(:TGTField {name: 'severity',    type: 'string', description: 'Change severity: major | minor — major triggers mastery review flag'})
CREATE (tAffectedConceptEntry)-[:HAS_FIELD]->(:TGTField {name: 'changeNote',  type: 'string', description: 'Human-readable description of what changed and why'})

// ──────────────────────────────────────────────────────────────
// FILES
// ──────────────────────────────────────────────────────────────

// === types.ts ===
CREATE (fCultivatorTypes:TGTFile {
  name: 'types.ts',
  path: 'src/dwell/cultivator/types.ts',
  description: 'Personal Twin Cultivator type definitions: StalenessWatch, DomainUpdate, AffectedConceptEntry.',
  exports: 'StalenessWatch, DomainUpdate, AffectedConceptEntry'
})
CREATE (fCultivatorTypes)-[:BELONGS_TO]->(mod)
CREATE (fCultivatorTypes)-[:CONTAINS]->(tStalenessWatch)
CREATE (fCultivatorTypes)-[:CONTAINS]->(tDomainUpdate)
CREATE (fCultivatorTypes)-[:CONTAINS]->(tAffectedConceptEntry)

// === staleness-watch.ts ===
CREATE (fStalenessWatch:TGTFile {
  name: 'staleness-watch.ts',
  path: 'src/dwell/cultivator/staleness-watch.ts',
  description: 'Effect functions for the staleness watch lifecycle: activating a watch on certification, receiving thin change-available notifications, and processing the pulled domain update delta. Satisfies REQ-DW-CUR-01..04.',
  exports: 'activateWatch, processChangeAvailable, processDomainUpdate'
})
CREATE (fStalenessWatch)-[:BELONGS_TO]->(mod)

CREATE (fnActivateWatch:TGTFunction {
  name: 'activateWatch',
  signature: '(cert: CertificationRecord, twinId: string): StalenessWatch',
  style: 'effect',
  async: false,
  description: 'Creates a StalenessWatch record for the certified domain and registers a subscription to the Domain Twin\'s change notification channel via the Zipper. Effect: registers subscription through Zipper channel connector. Returns the created watch.'
})
CREATE (fStalenessWatch)-[:CONTAINS]->(fnActivateWatch)

CREATE (fnProcessChangeAvailable:TGTFunction {
  name: 'processChangeAvailable',
  signature: '(domain: string, twinId: string): void',
  style: 'effect',
  async: false,
  description: 'Receives bb.domain.<domain>.change-available notification (thin signal — no change detail). Triggers a delta pull request to the Domain Twin via the Zipper (dwell.{twinId}.update.request). Effect: fires inter-twin NATS call via Zipper.'
})
CREATE (fStalenessWatch)-[:CONTAINS]->(fnProcessChangeAvailable)

CREATE (fnProcessDomainUpdate:TGTFunction {
  name: 'processDomainUpdate',
  signature: '(update: DomainUpdate): void',
  style: 'effect',
  async: false,
  description: 'Receives the pre-curated DomainUpdate delta from the Domain Twin (delivered via Zipper). Posts bb.domain.<domain>.updated to the BB for Surveyor and Gatekeeper to consume. Effect: posts to BB.'
})
CREATE (fStalenessWatch)-[:CONTAINS]->(fnProcessDomainUpdate)

// === cultivator.ts ===
CREATE (fCultivatorAgent:TGTFile {
  name: 'cultivator.ts',
  path: 'src/dwell/cultivator/cultivator.ts',
  description: 'Stateful Personal Twin Cultivator class. Holds active StalenessWatch map keyed by domain. Handles certification achievements, change-available notifications, and update deliveries. Delegates effect logic to staleness-watch.ts functions.',
  exports: 'Cultivator'
})
CREATE (fCultivatorAgent)-[:BELONGS_TO]->(mod)

CREATE (tCultivatorClass:TGTType {
  name: 'Cultivator',
  kind: 'class',
  style: 'stateful-class',
  description: 'Stateful Personal Twin Cultivator. Maintains a map of active StalenessWatch records (keyed by domain). Receives certification, change-available, and update-delivered events from the BB. Activates watches, coordinates delta pulls, and posts domain-updated events.',
  invariants: 'One StalenessWatch per domain; watch activation is idempotent (re-certifying same domain does not create duplicate watches)'
})
CREATE (fCultivatorAgent)-[:CONTAINS]->(tCultivatorClass)

CREATE (fnOnCertificationAchieved:TGTFunction {
  name: 'onCertificationAchieved',
  signature: '(cert: CertificationRecord, twinId: string): void',
  style: 'effect',
  async: false,
  description: 'Handles bb.cert.<domain>.achieved. Calls activateWatch() to create a StalenessWatch and register the subscription. Stores watch in the active watch map. Effect: registers Zipper subscription.'
})
CREATE (tCultivatorClass)-[:HAS_FUNCTION]->(fnOnCertificationAchieved)

CREATE (fnOnChangeAvailable:TGTFunction {
  name: 'onChangeAvailable',
  signature: '(domain: string, twinId: string): void',
  style: 'effect',
  async: false,
  description: 'Handles bb.domain.<domain>.change-available (thin notification from Domain Twin via Zipper). Delegates to processChangeAvailable() to fire the delta pull. Effect: fires Zipper inter-twin call.'
})
CREATE (tCultivatorClass)-[:HAS_FUNCTION]->(fnOnChangeAvailable)

CREATE (fnOnUpdateDelivered:TGTFunction {
  name: 'onUpdateDelivered',
  signature: '(update: DomainUpdate): void',
  style: 'effect',
  async: false,
  description: 'Handles the DomainUpdate delta delivered from the Domain Twin via Zipper. Updates the corresponding StalenessWatch record with firstReviewAt (if first update). Delegates to processDomainUpdate() to post bb.domain.<domain>.updated. Effect: posts to BB.'
})
CREATE (tCultivatorClass)-[:HAS_FUNCTION]->(fnOnUpdateDelivered)
