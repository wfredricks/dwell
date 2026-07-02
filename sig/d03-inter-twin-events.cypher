// ============================================================
// D-03 INTER-TWIN EVENTS — SIG Pre-Game Blueprint
// ============================================================
//
// TGTType nodes for every dwell.* call and event in the Dwell
// architecture.
// Traceable to: DWELL-EVENT-ARCHITECTURE.md Part 2 — Inter-Twin
// Communications (dwell.*)
//
// The Zipper is the only cross-boundary agent. It is producer for
// all outbound calls to Domain Twins and consumer for all inbound
// directed events returning to the Personal Twin's inbox.
//
// Agents referenced here are MERGE'd (created in d01-agents.cypher).
//
// Node Labels: TGTType (kind:'call' or kind:'event'), TGTField
// Relationship Types: HAS_FIELD, EMITS, CONSUMES, RESPONSE_IS
//
// Call pattern:
//   kind: 'call', routing: 'request-response' (or 'broadcast')
//   CREATE (call)-[:RESPONSE_IS]->(response)
//
// ============================================================

// ──────────────────────────────────────────────────────────────
// AGENT REFERENCES (MERGE — created in d01)
// ──────────────────────────────────────────────────────────────

MERGE (mZipper:TGTModule {name: 'zipper'})
MERGE (mBridge:TGTModule {name: 'bridge'})
MERGE (mCultivator:TGTModule {name: 'cultivator'})
MERGE (mCalibrator:TGTModule {name: 'calibrator'})
MERGE (mSurveyor:TGTModule {name: 'surveyor'})
MERGE (mGatekeeper:TGTModule {name: 'gatekeeper'})

MERGE (mCartographer:TGTModule {name: 'cartographer'})
MERGE (mLibrarian:TGTModule {name: 'librarian'})
MERGE (mTester:TGTModule {name: 'tester'})
MERGE (mDomainCultivator:TGTModule {name: 'domain-cultivator'})
MERGE (mDomainTwin:TGTModule {name: 'domain-twin'})

// ──────────────────────────────────────────────────────────────
// DISCOVERY PROTOCOL
// ──────────────────────────────────────────────────────────────

// Trace: Part 2 — Discovery Protocol, dwell.broadcast.discovery
// "Personal Twin broadcasts a discovery request. Any Domain Twin covering the requested domain may respond."
// Note: replyTo is the ONLY case where userId appears in an inter-twin payload.
CREATE (cDiscovery:TGTType {
  name: 'DwellBroadcastDiscovery',
  kind: 'call',
  topic: 'dwell.broadcast.discovery',
  namespace: 'dwell',
  routing: 'broadcast',
  description: 'Personal Twin (Zipper on behalf of Bridge) broadcasts a discovery request. Any Domain Twin covering the requested domain may self-respond. replyTo is the only case where a userId appears in an inter-twin payload — the broadcast subject has no owner, so Domain Twins need an explicit reply address.'
})
CREATE (cDiscovery)-[:HAS_FIELD]->(:TGTField {name: 'replyTo',        type: 'string',   required: true,  description: 'Reply inbox: "dwell.{userId}.discovery.response" — the only userId-in-payload exception across all inter-twin events'})
CREATE (cDiscovery)-[:HAS_FIELD]->(:TGTField {name: 'intent',         type: 'string',   required: true,  description: 'Learning intent e.g. "GCP Professional Cloud Architect"'})
CREATE (cDiscovery)-[:HAS_FIELD]->(:TGTField {name: 'sourceKnowledge',type: 'SourceKnowledge[]', required: true, description: 'Domains already mastered by the learner with mastery level and validation status'})
CREATE (cDiscovery)-[:HAS_FIELD]->(:TGTField {name: 'requestedAt',    type: 'ISO8601',  required: true,  description: 'Timestamp of discovery request'})
CREATE (cDiscovery)-[:HAS_FIELD]->(:TGTField {name: 'timeoutMs',      type: 'number',   required: true,  description: 'How long to wait for Domain Twin responses before emitting domain.gap'})
// SourceKnowledge fields: domain (string), masteryLevel (number 0.0-1.0), validated (boolean)

CREATE (mZipper)-[:EMITS]->(cDiscovery)
// All Domain Twins subscribe to dwell.broadcast.>
CREATE (mDomainTwin)-[:CONSUMES]->(cDiscovery)

// ──────────────────────────────────────────────────────────────

// Trace: Part 2 — Discovery Protocol, dwell.{userId}.discovery.response
// "Domain Twin announces its capabilities to the Personal Twin's inbox."
CREATE (eDiscoveryResponse:TGTType {
  name: 'DwellDiscoveryResponse',
  kind: 'event',
  topic: 'dwell.{userId}.discovery.response',
  namespace: 'dwell',
  routing: 'directed',
  description: 'Domain Twin self-announces its capabilities to the Personal Twin\'s inbox. Directed to the userId inbox specified in the discovery broadcast replyTo field. Multiple Domain Twins may respond; Answer Agent evaluates all responses.'
})
CREATE (eDiscoveryResponse)-[:HAS_FIELD]->(:TGTField {name: 'twinId',             type: 'string',   required: true,  description: 'Domain Twin identifier'})
CREATE (eDiscoveryResponse)-[:HAS_FIELD]->(:TGTField {name: 'domain',             type: 'string',   required: true,  description: 'Domain covered by this twin'})
CREATE (eDiscoveryResponse)-[:HAS_FIELD]->(:TGTField {name: 'certName',           type: 'string',   required: false, description: 'Specific cert this twin covers (null if general domain coverage)'})
CREATE (eDiscoveryResponse)-[:HAS_FIELD]->(:TGTField {name: 'coverage',           type: 'number',   required: true,  description: 'Coverage score 0.0–1.0 for the requested intent'})
CREATE (eDiscoveryResponse)-[:HAS_FIELD]->(:TGTField {name: 'qualityScore',       type: 'number',   required: true,  description: 'Self-reported quality score 0.0–1.0'})
CREATE (eDiscoveryResponse)-[:HAS_FIELD]->(:TGTField {name: 'crossDomainSupport', type: 'string[]', required: true,  description: 'Domains this twin has cross-domain equivalence data for'})
CREATE (eDiscoveryResponse)-[:HAS_FIELD]->(:TGTField {name: 'version',            type: 'string',   required: true,  description: 'Domain Twin knowledge graph version'})

CREATE (mDomainTwin)-[:EMITS]->(eDiscoveryResponse)
CREATE (mZipper)-[:CONSUMES]->(eDiscoveryResponse)

// Link call to its response
CREATE (cDiscovery)-[:RESPONSE_IS]->(eDiscoveryResponse)

// ──────────────────────────────────────────────────────────────

// Trace: Part 2 — Discovery Protocol, dwell.{userId}.domain.gap
// "Personal Twin self-publishes when no Domain Twin responded within the timeout."
CREATE (eDomainGap:TGTType {
  name: 'DwellDomainGap',
  kind: 'event',
  topic: 'dwell.{userId}.domain.gap',
  namespace: 'dwell',
  routing: 'fire-and-forget',
  description: 'Personal Twin emits when no Domain Twin responded to a discovery broadcast within the timeout. First-class finding — not an error. Informs the platform which Domain Twins need to be built.'
})
CREATE (eDomainGap)-[:HAS_FIELD]->(:TGTField {name: 'intent',       type: 'string',  required: true, description: 'The intent that had no Domain Twin coverage'})
CREATE (eDomainGap)-[:HAS_FIELD]->(:TGTField {name: 'timeoutMs',    type: 'number',  required: true, description: 'Timeout that elapsed before this event was emitted'})
CREATE (eDomainGap)-[:HAS_FIELD]->(:TGTField {name: 'requestedAt',  type: 'ISO8601', required: true, description: 'Timestamp of the original discovery request'})

CREATE (mZipper)-[:EMITS]->(eDomainGap)

// ──────────────────────────────────────────────────────────────
// KNOWLEDGE GRAPH PROTOCOL
// ──────────────────────────────────────────────────────────────

// Trace: Part 2 — Knowledge Graph Protocol, dwell.{twinId}.kg.request
// "Personal Twin calls the Domain Twin's inbox for the full knowledge graph."
CREATE (cKgRequest:TGTType {
  name: 'DwellKgRequest',
  kind: 'call',
  topic: 'dwell.{twinId}.kg.request',
  namespace: 'dwell',
  routing: 'request-response',
  description: 'Zipper calls the Domain Twin\'s inbox for its full knowledge graph. The learner baseline is included so the Domain Twin can curate content floor/ceiling per node. Response expected on dwell.{userId}.kg.delivered.'
})
CREATE (cKgRequest)-[:HAS_FIELD]->(:TGTField {name: 'learnerBaseline', type: 'LearnerBaselineEntry[]', required: true, description: 'Array of domain baselines the learner holds; Domain Twin uses this to set content floor/ceiling per node'})
// LearnerBaselineEntry fields:
//   domain (string), masteryNodes: [{ conceptId, confidence (number), bloomsAltitude (number) }]

CREATE (mZipper)-[:EMITS]->(cKgRequest)
CREATE (mCartographer)-[:CONSUMES]->(cKgRequest)

// ──────────────────────────────────────────────────────────────

// Trace: Part 2 — Knowledge Graph Protocol, dwell.{userId}.kg.delivered
CREATE (eKgDelivered:TGTType {
  name: 'DwellKgDelivered',
  kind: 'event',
  topic: 'dwell.{userId}.kg.delivered',
  namespace: 'dwell',
  routing: 'directed',
  description: 'Domain Twin (Cartographer) delivers the knowledge graph — concept nodes with bloomsTargetAltitude, prerequisite edges, curated batches, and misconception catalog — to the Personal Twin\'s inbox. Directed to the userId inbox.'
})
CREATE (eKgDelivered)-[:HAS_FIELD]->(:TGTField {name: 'twinId',            type: 'string',            required: true, description: 'Domain Twin that produced this graph'})
CREATE (eKgDelivered)-[:HAS_FIELD]->(:TGTField {name: 'domain',            type: 'string',            required: true, description: 'Domain covered'})
CREATE (eKgDelivered)-[:HAS_FIELD]->(:TGTField {name: 'graph',             type: 'DomainGraph',       required: true, description: 'Full domain knowledge graph: nodes and edges'})
CREATE (eKgDelivered)-[:HAS_FIELD]->(:TGTField {name: 'curatedBatches',    type: 'CuratedBatch[]',    required: true, description: 'Pedagogically-coupled concept clusters defined by Domain Twin'})
CREATE (eKgDelivered)-[:HAS_FIELD]->(:TGTField {name: 'misconceptionCatalog', type: 'Misconception[]', required: true, description: 'Known misconception patterns; source domain if cross-domain transfer risk'})
// DomainGraph.nodes fields: conceptId, label, bloomsTargetAltitude (number), examWeight (number),
//   crossDomainEquivalents: [{ domain, conceptId, similarityScore, deltaNote (string|null) }]
// DomainGraph.edges fields: from, to, relationshipType ("prerequisite"|"reinforces"|"contrasts")
// CuratedBatch fields: batchId, label, conceptIds (string[]), teachTogetherReason
// Misconception fields: misconceptionId, conceptIds (string[]), sourceDomain (string|null), description

CREATE (mCartographer)-[:EMITS]->(eKgDelivered)
CREATE (mZipper)-[:CONSUMES]->(eKgDelivered)
// Zipper relays to BB; Calibrator, Surveyor, Gatekeeper consume from BB

CREATE (cKgRequest)-[:RESPONSE_IS]->(eKgDelivered)

// ──────────────────────────────────────────────────────────────
// BRIDGE QUERY PROTOCOL
// ──────────────────────────────────────────────────────────────

// Trace: Part 2 — Bridge Query Protocol, dwell.{twinId}.bridge.query
CREATE (cBridgeQuery:TGTType {
  name: 'DwellBridgeQuery',
  kind: 'call',
  topic: 'dwell.{twinId}.bridge.query',
  namespace: 'dwell',
  routing: 'request-response',
  description: 'Zipper (on behalf of Bridge) calls the Domain Twin Librarian for generic bridge card templates. The Personal Twin Bridge synthesizes them with Bill\'s personal mental model anchor to produce a personalized connection card. Response expected on dwell.{userId}.bridge.response.'
})
CREATE (cBridgeQuery)-[:HAS_FIELD]->(:TGTField {name: 'targetConceptIds',      type: 'string[]',               required: true, description: 'Concepts the bridge should connect to'})
CREATE (cBridgeQuery)-[:HAS_FIELD]->(:TGTField {name: 'sourceDomains',         type: 'SourceDomainEntry[]',    required: true, description: 'Domains the learner comes from with mastery level'})
CREATE (cBridgeQuery)-[:HAS_FIELD]->(:TGTField {name: 'learnerProfileCluster', type: 'string',                 required: true, description: 'Profile cluster descriptor for bridge template matching'})
// SourceDomainEntry fields: domain (string), masteryLevel (number 0.0-1.0)

CREATE (mZipper)-[:EMITS]->(cBridgeQuery)
CREATE (mLibrarian)-[:CONSUMES]->(cBridgeQuery)

// ──────────────────────────────────────────────────────────────

// Trace: Part 2 — Bridge Query Protocol, dwell.{userId}.bridge.response
CREATE (eBridgeResponse:TGTType {
  name: 'DwellBridgeResponse',
  kind: 'event',
  topic: 'dwell.{userId}.bridge.response',
  namespace: 'dwell',
  routing: 'directed',
  description: 'Domain Twin (Librarian) returns ranked generic bridge card candidates to the Personal Twin\'s inbox. Bridge in the Personal Twin selects from candidates and synthesizes a personalized card.'
})
CREATE (eBridgeResponse)-[:HAS_FIELD]->(:TGTField {name: 'twinId',          type: 'string',            required: true, description: 'Domain Twin that produced the candidates'})
CREATE (eBridgeResponse)-[:HAS_FIELD]->(:TGTField {name: 'targetConceptIds',type: 'string[]',          required: true, description: 'Target concepts these bridges address'})
CREATE (eBridgeResponse)-[:HAS_FIELD]->(:TGTField {name: 'candidates',      type: 'BridgeCandidate[]', required: true, description: 'Ranked generic bridge card candidates'})
// BridgeCandidate fields: bridgeId, bridgeType, sourceAnchor, targetConcept, genericText,
//   effectivenessScore (number), profileClusterMatch (number)

CREATE (mLibrarian)-[:EMITS]->(eBridgeResponse)
CREATE (mZipper)-[:CONSUMES]->(eBridgeResponse)

CREATE (cBridgeQuery)-[:RESPONSE_IS]->(eBridgeResponse)

// ──────────────────────────────────────────────────────────────
// ASSESSMENT PROTOCOL
// ──────────────────────────────────────────────────────────────

// Trace: Part 2 — Assessment Protocol, dwell.{twinId}.assessment.request
CREATE (cAssessmentRequest:TGTType {
  name: 'DwellAssessmentRequest',
  kind: 'call',
  topic: 'dwell.{twinId}.assessment.request',
  namespace: 'dwell',
  routing: 'request-response',
  description: 'Zipper calls the Domain Twin Tester for calibrated diagnostic or formative assessment items at the requested Bloom\'s level and concept scope. Response expected on dwell.{userId}.assessment.delivered.'
})
CREATE (cAssessmentRequest)-[:HAS_FIELD]->(:TGTField {name: 'conceptIds',    type: 'string[]',            required: true, description: 'Concepts to assess'})
CREATE (cAssessmentRequest)-[:HAS_FIELD]->(:TGTField {name: 'bloomsLevel',   type: 'number',              required: true, description: 'Target Bloom\'s level (1–6)'})
CREATE (cAssessmentRequest)-[:HAS_FIELD]->(:TGTField {name: 'count',         type: 'number',              required: true, description: 'Number of items requested'})
CREATE (cAssessmentRequest)-[:HAS_FIELD]->(:TGTField {name: 'masteryContext',type: 'MasteryContextEntry[]',required: true, description: 'Current mastery state for each concept; used to calibrate difficulty'})
// MasteryContextEntry fields: conceptId (string), currentConfidence (number)

CREATE (mZipper)-[:EMITS]->(cAssessmentRequest)
CREATE (mTester)-[:CONSUMES]->(cAssessmentRequest)

// ──────────────────────────────────────────────────────────────

// Trace: Part 2 — Assessment Protocol, dwell.{userId}.assessment.delivered
CREATE (eAssessmentDelivered:TGTType {
  name: 'DwellAssessmentDelivered',
  kind: 'event',
  topic: 'dwell.{userId}.assessment.delivered',
  namespace: 'dwell',
  routing: 'directed',
  description: 'Domain Twin (Tester) delivers calibrated assessment items to the Personal Twin\'s inbox. Items include distractors and correct answers; relayed through the Zipper to the BB.'
})
CREATE (eAssessmentDelivered)-[:HAS_FIELD]->(:TGTField {name: 'twinId', type: 'string',         required: true, description: 'Domain Twin that generated the items'})
CREATE (eAssessmentDelivered)-[:HAS_FIELD]->(:TGTField {name: 'items',  type: 'AssessmentItem[]',required: true, description: 'Calibrated assessment items'})
// AssessmentItem fields: itemId, question, bloomsLevel (number), conceptIds (string[]),
//   distractors (string[]), correctAnswer (string)

CREATE (mTester)-[:EMITS]->(eAssessmentDelivered)
CREATE (mZipper)-[:CONSUMES]->(eAssessmentDelivered)

CREATE (cAssessmentRequest)-[:RESPONSE_IS]->(eAssessmentDelivered)

// ──────────────────────────────────────────────────────────────
// OUTCOME SIGNAL PROTOCOL
// ──────────────────────────────────────────────────────────────

// Trace: Part 2 — Outcome Signal Protocol, dwell.{twinId}.outcome.signal
// "Personal Twin reports what happened accurately. Domain Twin does all analytics."
// Design principle: lean enough to be privacy-safe; no personal identifiers, no cluster labels.
CREATE (eOutcomeSignal:TGTType {
  name: 'DwellOutcomeSignal',
  kind: 'event',
  topic: 'dwell.{twinId}.outcome.signal',
  namespace: 'dwell',
  routing: 'fire-and-forget',
  description: 'Zipper fires an anonymized outcome signal to the Domain Twin after every learning interaction. Personal Twin reports; Domain Twin learns. Domain Twin Librarian and Tester accumulate signals over time for internal analytics and clustering. No personal identifiers; no cluster labels; no twin-traceable PII.'
})
CREATE (eOutcomeSignal)-[:HAS_FIELD]->(:TGTField {name: 'conceptId',                  type: 'string',  required: true,  description: 'The concept this interaction was about'})
CREATE (eOutcomeSignal)-[:HAS_FIELD]->(:TGTField {name: 'interactionType',            type: '"learning-node"|"bridge-card"|"assessment-item"|"methodology"', required: true, description: 'Type of learning interaction'})
CREATE (eOutcomeSignal)-[:HAS_FIELD]->(:TGTField {name: 'bridgeId',                   type: 'string',  required: false, description: 'Which bridge card, if interaction was a bridge (null otherwise)'})
CREATE (eOutcomeSignal)-[:HAS_FIELD]->(:TGTField {name: 'itemId',                     type: 'string',  required: false, description: 'Which assessment item, if interaction was an assessment (null otherwise)'})
CREATE (eOutcomeSignal)-[:HAS_FIELD]->(:TGTField {name: 'sourceDomains',              type: 'string[]',required: true,  description: 'Prior domains the learner held at interaction time — domain-level only, not personal'})
CREATE (eOutcomeSignal)-[:HAS_FIELD]->(:TGTField {name: 'outcome',                    type: '"engaged"|"thanked"|"later"|"dismissed"|"correct"|"incorrect"', required: true, description: 'How the interaction resolved'})
CREATE (eOutcomeSignal)-[:HAS_FIELD]->(:TGTField {name: 'bloomsAltitudeAtInteraction',type: 'number',  required: true,  description: 'The Bloom\'s altitude level at which this interaction was pitched'})
CREATE (eOutcomeSignal)-[:HAS_FIELD]->(:TGTField {name: 'occurredAt',                 type: 'ISO8601', required: true,  description: 'Timestamp of the interaction'})

CREATE (mZipper)-[:EMITS]->(eOutcomeSignal)
CREATE (mLibrarian)-[:CONSUMES]->(eOutcomeSignal)
CREATE (mTester)-[:CONSUMES]->(eOutcomeSignal)

// ──────────────────────────────────────────────────────────────
// DOMAIN CURRENCY PROTOCOL
// ──────────────────────────────────────────────────────────────

// Trace: Part 2 — Domain Currency Protocol, dwell.domain.{twinId}.updated
// "Domain Twin notifies all connected Personal Twins that its knowledge graph has changed.
//  Thin signal — no change detail in payload. Broadcast through channel connector."
CREATE (eDomainUpdated:TGTType {
  name: 'DwellDomainUpdated',
  kind: 'event',
  topic: 'dwell.domain.{twinId}.updated',
  namespace: 'dwell',
  routing: 'broadcast',
  description: 'Domain Twin (Cultivator) emits a thin change notification through its channel connector when its knowledge graph changes. Zipper receives it and posts bb.domain.<domain>.change-available to the BB. Domain Twin does NOT push change details or maintain subscriber lists — the channel connector IS the subscription.'
})
CREATE (eDomainUpdated)-[:HAS_FIELD]->(:TGTField {name: 'twinId',      type: 'string',  required: true, description: 'Domain Twin that changed'})
CREATE (eDomainUpdated)-[:HAS_FIELD]->(:TGTField {name: 'domain',      type: 'string',  required: true, description: 'Domain identifier'})
CREATE (eDomainUpdated)-[:HAS_FIELD]->(:TGTField {name: 'notifiedAt',  type: 'ISO8601', required: true, description: 'Timestamp of notification'})

CREATE (mDomainCultivator)-[:EMITS]->(eDomainUpdated)
CREATE (mZipper)-[:CONSUMES]->(eDomainUpdated)

// ──────────────────────────────────────────────────────────────

// Trace: Part 2 — Domain Currency Protocol, dwell.{twinId}.update.request
// "Zipper (on behalf of Cultivator) calls the Domain Twin for the pre-curated change delta."
CREATE (cUpdateRequest:TGTType {
  name: 'DwellUpdateRequest',
  kind: 'call',
  topic: 'dwell.{twinId}.update.request',
  namespace: 'dwell',
  routing: 'request-response',
  description: 'Zipper calls the Domain Twin (Cultivator) for the pre-curated change delta after receiving a dwell.domain.{twinId}.updated notification. Response expected on dwell.{userId}.update.delivered.'
})
CREATE (cUpdateRequest)-[:HAS_FIELD]->(:TGTField {name: 'sinceVersion', type: 'string', required: true, description: 'Last known Domain Twin knowledge graph version; Domain Twin computes the delta from this version'})

CREATE (mZipper)-[:EMITS]->(cUpdateRequest)
CREATE (mDomainCultivator)-[:CONSUMES]->(cUpdateRequest)

// ──────────────────────────────────────────────────────────────

// Trace: Part 2 — Domain Currency Protocol, dwell.{userId}.update.delivered
CREATE (eUpdateDelivered:TGTType {
  name: 'DwellUpdateDelivered',
  kind: 'event',
  topic: 'dwell.{userId}.update.delivered',
  namespace: 'dwell',
  routing: 'directed',
  description: 'Domain Twin (Cultivator) delivers the pre-curated knowledge graph delta to the Personal Twin\'s inbox. Zipper receives it and emits bb.domain.<domain>.updated internally for Surveyor, Gatekeeper, and Cultivator to act on.'
})
CREATE (eUpdateDelivered)-[:HAS_FIELD]->(:TGTField {name: 'twinId',           type: 'string',          required: true, description: 'Domain Twin that produced the delta'})
CREATE (eUpdateDelivered)-[:HAS_FIELD]->(:TGTField {name: 'domain',           type: 'string',          required: true, description: 'Domain identifier'})
CREATE (eUpdateDelivered)-[:HAS_FIELD]->(:TGTField {name: 'fromVersion',       type: 'string',          required: true, description: 'Knowledge graph version at start of delta'})
CREATE (eUpdateDelivered)-[:HAS_FIELD]->(:TGTField {name: 'toVersion',         type: 'string',          required: true, description: 'Knowledge graph version at end of delta'})
CREATE (eUpdateDelivered)-[:HAS_FIELD]->(:TGTField {name: 'affectedConcepts',  type: 'ConceptChange[]', required: true, description: 'Concepts that changed in this version delta'})
CREATE (eUpdateDelivered)-[:HAS_FIELD]->(:TGTField {name: 'deliveredAt',       type: 'ISO8601',         required: true, description: 'Timestamp of delivery'})
// ConceptChange fields: conceptId, changeType ("deprecated"|"modified"|"reweighted"|"added"),
//   severity ("minor"|"major"), changeNote (string)

CREATE (mDomainCultivator)-[:EMITS]->(eUpdateDelivered)
CREATE (mZipper)-[:CONSUMES]->(eUpdateDelivered)

CREATE (cUpdateRequest)-[:RESPONSE_IS]->(eUpdateDelivered)
