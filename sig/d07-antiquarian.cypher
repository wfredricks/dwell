// ============================================================
// D-07 ANTIQUARIAN — SIG Pre-Game Blueprint
// ============================================================
//
// The prior-knowledge historian. Reads Bill's evidence record,
// extracts deep mental models, initializes the domain baseline
// that seeds Calibrator, and keeps the AntiquarianSnapshot
// ContextNode current on the Blackboard.
//
// Traces to:
//   DWELL-FEATURES.md  — F-2.1 (Knowledge History & Mental Models)
//   DWELL-REQUIREMENTS.md — REQ-DW-MST-01, REQ-DW-BRG-02, BRG-03
//   d01-agents.cypher  — TGTModule {name: 'antiquarian'}
//   d06-gap-resolutions.cypher — G8 (AntiquarianSnapshot pattern)
//
// ============================================================

MERGE (mod:TGTModule {name: 'antiquarian'})
SET mod.path = 'src/personal-twin/antiquarian',
    mod.capability = 'prior-knowledge-extraction',
    mod.tier = 'PersonalTwin'

// ──────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────

// Evidence — a single piece of Bill's history with a concept.
// evidenceType maps directly to a Bloom's altitude (1–6).
//   read-about  → 1 Remember
//   explained   → 2 Understand
//   applied     → 3 Apply
//   diagnosed   → 4 Analyze
//   evaluated   → 5 Evaluate
//   designed    → 6 Create
// Trace: F-2.1 leaf rule "Evidence type must map to a Bloom's altitude"
//        REQ-DW-MST-01 evidence-to-altitude table

CREATE (tEvidence:TGTType {
  name: 'Evidence',
  kind: 'interface',
  style: 'value-object',
  description: 'A single piece of evidence from Bill's history with a concept. evidenceType encodes the Bloom's altitude that can be inferred from it. Source is a string reference (project name, cert, doc, etc.). occurredAt establishes recency weighting.',
  satisfies: 'REQ-DW-MST-01, F-2.1'
})
CREATE (tEvidence)-[:HAS_FIELD]->(:TGTField {name: 'evidenceId',    type: 'string',                                                                           required: true,  description: 'Unique evidence identifier'})
CREATE (tEvidence)-[:HAS_FIELD]->(:TGTField {name: 'conceptDomain', type: 'string',                                                                           required: true,  description: 'The concept domain this evidence pertains to (e.g. "IAM", "EC2", "nuclear-safety")'})
CREATE (tEvidence)-[:HAS_FIELD]->(:TGTField {name: 'evidenceType',  type: "'read-about'|'explained'|'applied'|'diagnosed'|'evaluated'|'designed'",            required: true,  description: 'Type of cognitive engagement. Maps to Bloom altitude: read-about→1, explained→2, applied→3, diagnosed→4, evaluated→5, designed→6'})
CREATE (tEvidence)-[:HAS_FIELD]->(:TGTField {name: 'source',        type: 'string',                                                                           required: true,  description: 'Source reference: project name, cert ID, document title, conversation log, etc.'})
CREATE (tEvidence)-[:HAS_FIELD]->(:TGTField {name: 'occurredAt',    type: 'ISO8601',                                                                          required: true,  description: 'When this evidence occurred. Used for recency weighting.'})

// EvidenceNode — aggregate of all evidence for one concept in a domain baseline.
// Produced by aggregateEvidence() in evidence-mapper.ts.

CREATE (tEvidenceNode:TGTType {
  name: 'EvidenceNode',
  kind: 'class',
  style: 'value-object',
  description: 'Per-concept aggregate of evidence signals within an AntiquarianBaseline. signalStrength is the strongest single evidence signal for this concept. evidenceSources lists all source references that contributed.',
  satisfies: 'REQ-DW-MST-01'
})
CREATE (tEvidenceNode)-[:HAS_FIELD]->(:TGTField {name: 'conceptId',       type: 'string',                                       required: true,  description: 'Concept node identifier from the domain knowledge graph'})
CREATE (tEvidenceNode)-[:HAS_FIELD]->(:TGTField {name: 'signalStrength',   type: "'strong'|'weak'|'none'|'conflicting'",         required: true,  description: 'Aggregate signal: strong = consistent high-altitude evidence; conflicting = contradictory evidence types present'})
CREATE (tEvidenceNode)-[:HAS_FIELD]->(:TGTField {name: 'evidenceSources',  type: 'string[]',                                     required: true,  description: 'All source references that contributed to this node'})

// AntiquarianBaseline — the result of a full evidence walk for one domain.
// Input to Calibrator.initializeMastery().

CREATE (tAntiquarianBaseline:TGTType {
  name: 'AntiquarianBaseline',
  kind: 'class',
  style: 'value-object',
  description: 'The complete evidence-derived baseline for one domain. Produced by assessEvidence(). Consumed by Calibrator.initializeMastery() to seed the mastery map. nodes is the full list of EvidenceNodes for every concept in scope.',
  satisfies: 'REQ-DW-MST-01, REQ-DW-LGM-02'
})
CREATE (tAntiquarianBaseline)-[:HAS_FIELD]->(:TGTField {name: 'domain',      type: 'string',         required: true,  description: 'The domain this baseline covers'})
CREATE (tAntiquarianBaseline)-[:HAS_FIELD]->(:TGTField {name: 'nodes',       type: 'EvidenceNode[]', required: true,  description: 'Per-concept evidence aggregates for every concept in scope'})
CREATE (tAntiquarianBaseline)-[:HAS_FIELD]->(:TGTField {name: 'assessedAt',  type: 'ISO8601',        required: true,  description: 'When this baseline was produced'})

// AntiquarianSnapshot — BB ContextNode. Defined authoritatively in d06-gap-resolutions (G8).
// Antiquarian owns writing it; other agents read it from BB without calling Antiquarian directly.
// NOTE: TGTType node already created in d06. Referenced here by name only — do not re-create.

// ──────────────────────────────────────────────────────────────
// FILES
// ──────────────────────────────────────────────────────────────

// === types.ts ===

CREATE (fTypes:TGTFile {
  name: 'types.ts',
  path: 'src/personal-twin/antiquarian/types.ts',
  description: 'All Antiquarian types: Evidence, EvidenceNode, AntiquarianBaseline. Also re-exports AntiquarianSnapshot and MentalModel from d06 (no re-definition).',
  exports: 'Evidence, EvidenceNode, AntiquarianBaseline, AntiquarianSnapshot, MentalModel'
})
CREATE (fTypes)-[:CONTAINS]->(tEvidence)
CREATE (fTypes)-[:CONTAINS]->(tEvidenceNode)
CREATE (fTypes)-[:CONTAINS]->(tAntiquarianBaseline)

// === evidence-mapper.ts — Pure mapping functions ===

CREATE (fEvidenceMapper:TGTFile {
  name: 'evidence-mapper.ts',
  path: 'src/personal-twin/antiquarian/evidence-mapper.ts',
  description: 'Pure functions that map and aggregate raw Evidence records. No state, no I/O, no BB interaction. All Bloom altitude logic lives here.',
  exports: 'mapEvidenceToAltitude, aggregateEvidence'
})

CREATE (fnMapEvidenceToAltitude:TGTFunction {
  name: 'mapEvidenceToAltitude',
  style: 'pure',
  signature: '(evidence: Evidence): BloomsAltitude',
  description: 'Maps a single Evidence record to a Bloom altitude integer (1–6) using the evidenceType enum. read-about→1, explained→2, applied→3, diagnosed→4, evaluated→5, designed→6. Deterministic lookup — no inference. Trace: F-2.1 leaf rule, REQ-DW-MST-01.',
  async: false
})
CREATE (fnMapEvidenceToAltitude)-[:ACCEPTS]->(tEvidence)

CREATE (fnAggregateEvidence:TGTFunction {
  name: 'aggregateEvidence',
  style: 'pure',
  signature: '(evidences: Evidence[]): EvidenceNode[]',
  description: 'Groups a flat list of Evidence records by conceptId. For each concept picks the highest-altitude evidence type as the primary signal. If evidence types conflict (e.g. designed + none), signalStrength = conflicting. Returns one EvidenceNode per unique conceptId. Pure — no mutation.',
  async: false
})
CREATE (fnAggregateEvidence)-[:ACCEPTS]->(tEvidence)
CREATE (fnAggregateEvidence)-[:RETURNS]->(tEvidenceNode)

CREATE (fEvidenceMapper)-[:CONTAINS]->(fnMapEvidenceToAltitude)
CREATE (fEvidenceMapper)-[:CONTAINS]->(fnAggregateEvidence)

// === snapshot-builder.ts — Pure AntiquarianSnapshot assembly ===

CREATE (fSnapshotBuilder:TGTFile {
  name: 'snapshot-builder.ts',
  path: 'src/personal-twin/antiquarian/snapshot-builder.ts',
  description: 'Pure function that assembles the AntiquarianSnapshot ContextNode from current state. No side effects — does not post to BB. Posting is done by antiquarian.ts.',
  exports: 'buildSnapshot'
})

CREATE (fnBuildSnapshot:TGTFunction {
  name: 'buildSnapshot',
  style: 'pure',
  signature: '(mentalModels: MentalModel[], activeContexts: string[], sourceDomains: string[]): AntiquarianSnapshot',
  description: 'Assembles a fresh AntiquarianSnapshot from the provided mental models, active context domains, and source/certified domains. Sets updatedAt to now. Pure — no BB interaction, no state. Trace: G8 resolution — AntiquarianSnapshot as BB ContextNode.',
  async: false
})

CREATE (fSnapshotBuilder)-[:CONTAINS]->(fnBuildSnapshot)

// === antiquarian.ts — Stateful orchestrator ===

CREATE (fAntiquarian:TGTFile {
  name: 'antiquarian.ts',
  path: 'src/personal-twin/antiquarian/antiquarian.ts',
  description: 'Stateful Antiquarian class. Holds in-memory evidence state per domain. Reacts to bb.intent.declared and bb.cert.<domain>.achieved events. Posts AntiquarianSnapshot to BB. Entry point for the module.',
  exports: 'Antiquarian'
})

CREATE (tAntiquarianClass:TGTType {
  name: 'Antiquarian',
  kind: 'class',
  style: 'stateful-class',
  description: 'Stateful agent. Holds the evidence store in memory indexed by domain. Listens on BB events. On assessEvidence() produces an AntiquarianBaseline; on updateOnCertification() upgrades externally-validated nodes; on postSnapshot() writes the AntiquarianSnapshot ContextNode to BB.',
  invariants: 'ExternallyValidatedAltitudeIsImmutable — once a node is externally validated its bloomsCurrentAltitude cannot be reduced by any subsequent signal'
})

CREATE (fnAssessEvidence:TGTFunction {
  name: 'assessEvidence',
  style: 'stateful-class',
  signature: '(domain: string, evidence: Evidence[]): AntiquarianBaseline',
  description: 'Walks all evidence for the domain, calls aggregateEvidence() to build EvidenceNodes, packages them into an AntiquarianBaseline. Stores baseline in memory for later snapshot use. Triggers postSnapshot(). Trace: REQ-DW-MST-01, REQ-DW-LGM-02.',
  async: false
})
CREATE (fnAssessEvidence)-[:ACCEPTS]->(tEvidence)
CREATE (fnAssessEvidence)-[:RETURNS]->(tAntiquarianBaseline)

CREATE (fnUpdateOnCertification:TGTFunction {
  name: 'updateOnCertification',
  style: 'effect',
  signature: '(cert: CertificationRecord): void',
  description: 'Processes a bb.cert.<domain>.achieved event. Upgrades all concept nodes in the domain from estimated to externally-validated. Enforces ExternallyValidatedAltitudeIsImmutable — once upgraded, altitude cannot be downgraded by any later evidence ingestion. Triggers postSnapshot(). Trace: REQ-DW-LGM-03, F-1.3.',
  async: false
})

CREATE (fnPostSnapshot:TGTFunction {
  name: 'postSnapshot',
  style: 'effect',
  signature: '(): void',
  description: 'Builds a fresh AntiquarianSnapshot via buildSnapshot() and writes it to the BB as a ContextNode. Emits the bb event carrying the snapshot. Consumers (Bridge) read from BB — never call Antiquarian directly. Trace: G8 resolution.',
  async: false
})

CREATE (tAntiquarianClass)-[:HAS_FIELD]->(fnAssessEvidence)
CREATE (tAntiquarianClass)-[:HAS_FIELD]->(fnUpdateOnCertification)
CREATE (tAntiquarianClass)-[:HAS_FIELD]->(fnPostSnapshot)

CREATE (fAntiquarian)-[:CONTAINS]->(tAntiquarianClass)

// === Wire files to module ===

CREATE (mod)-[:CONTAINS]->(fTypes)
CREATE (mod)-[:CONTAINS]->(fEvidenceMapper)
CREATE (mod)-[:CONTAINS]->(fSnapshotBuilder)
CREATE (mod)-[:CONTAINS]->(fAntiquarian)

// ──────────────────────────────────────────────────────────────
// INVARIANTS
// ──────────────────────────────────────────────────────────────

CREATE (invExtValidated:TGTInvariant {
  name: 'ExternallyValidatedAltitudeIsImmutable',
  rule: 'Once a concept node is marked externally-validated (via updateOnCertification), its bloomsCurrentAltitude cannot be reduced by any subsequent evidence signal, engagement outcome, or re-assessment. External validation is the highest-authority signal. Only an explicit un-certification event (out of scope in Dwell v1) could override it.',
  scope: 'antiquarian',
  satisfies: 'REQ-DW-LGM-03, F-1.3'
})

CREATE (invEvidenceIsPure:TGTInvariant {
  name: 'EvidenceMapperIsPure',
  rule: 'mapEvidenceToAltitude and aggregateEvidence must have no side effects, no BB interaction, no state reads or writes. They are pure deterministic functions. Tests can call them in isolation with no mocking.',
  scope: 'antiquarian',
  satisfies: 'REQ-DW-ARC-04'
})

CREATE (invBridgeReadsSnapshot:TGTInvariant {
  name: 'AntiquarianSnapshotIsTheBridgeInterface',
  rule: 'No external agent may call any method on the Antiquarian class directly. Bridge and all other agents read mental model data exclusively from the AntiquarianSnapshot ContextNode on the BB. This is the G8 contract.',
  scope: 'antiquarian',
  satisfies: 'REQ-DW-BRG-02, REQ-DW-ARC-02'
})

CREATE (mod)-[:ENFORCES]->(invExtValidated)
CREATE (mod)-[:ENFORCES]->(invEvidenceIsPure)
CREATE (mod)-[:ENFORCES]->(invBridgeReadsSnapshot)

;
