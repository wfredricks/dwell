// ============================================================
// D-15 CARTOGRAPHER — Module Pre-Game Blueprint
// ============================================================
//
// Owns and serves the Domain Twin's knowledge graph.
// Concept nodes, prerequisite edges, curated batches,
// misconception catalog, bloomsTargetAltitude per node.
// Sets the ceiling — learners never override it.
//
// Traceable to:
//   DWELL-FEATURES.md     — F-4 (Map the Knowledge Domain)
//   DWELL-REQUIREMENTS.md — KGM-01, KGM-02, KGM-03, KGM-04
//   d01-agents.cypher     — TGTModule {name: 'cartographer'}
//   d05-invariants.cypher — DomainTwinSetsCeiling, LearnerBaselineSetsFloor
//
// ============================================================

MERGE (mod:TGTModule {name: 'cartographer'})
SET mod.path        = 'src/domain/cartographer',
    mod.capability  = 'knowledge-graph',
    mod.tier        = 'Domain',
    mod.description = 'Owns and serves the Domain Twin knowledge graph. Responds to kg.request calls with the full graph curated for the requesting learner baseline. Sets bloomsTargetAltitude — the ceiling learners never override.'

// ──────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────

CREATE (tCrossEquiv:TGTType {
  name: 'CrossDomainEquivalence',
  kind: 'interface',
  style: 'value-object',
  description: 'Records an equivalent concept in another domain. Used by resolveEquivalencesForLearner to annotate the graph with learner-specific cross-domain context.'
})
CREATE (tCrossEquiv)-[:HAS_FIELD]->(:TGTField {name: 'domain',          type: 'string',         description: 'Source domain identifier'})
CREATE (tCrossEquiv)-[:HAS_FIELD]->(:TGTField {name: 'conceptId',       type: 'string',         description: 'Equivalent concept id in that domain'})
CREATE (tCrossEquiv)-[:HAS_FIELD]->(:TGTField {name: 'similarityScore', type: 'number',         description: 'Similarity score 0-1'})
CREATE (tCrossEquiv)-[:HAS_FIELD]->(:TGTField {name: 'deltaNote',       type: 'string | null',  description: 'Note describing differences between the two concepts'})

CREATE (tConceptNode:TGTType {
  name: 'ConceptNode',
  kind: 'interface',
  style: 'value-object',
  description: 'A concept in the domain knowledge graph. bloomsTargetAltitude is the ceiling set by the Domain Twin. crossDomainEquivalents allows learner baseline resolution across domains.',
  invariants: 'bloomsTargetAltitude always 1-6, examWeight always 0-1'
})
CREATE (tConceptNode)-[:HAS_FIELD]->(:TGTField {name: 'conceptId',              type: 'string',                   description: 'Unique concept identifier'})
CREATE (tConceptNode)-[:HAS_FIELD]->(:TGTField {name: 'label',                  type: 'string',                   description: 'Human-readable concept name'})
CREATE (tConceptNode)-[:HAS_FIELD]->(:TGTField {name: 'bloomsTargetAltitude',   type: 'number',                   description: "Target Bloom's level 1-6. Set by Domain Twin; never overridden by learner."})
CREATE (tConceptNode)-[:HAS_FIELD]->(:TGTField {name: 'examWeight',             type: 'number',                   description: 'Relative exam weight 0-1'})
CREATE (tConceptNode)-[:HAS_FIELD]->(:TGTField {name: 'crossDomainEquivalents', type: 'CrossDomainEquivalence[]', description: 'Equivalent concepts in other domains'})

CREATE (tKnowledgeEdge:TGTType {
  name: 'KnowledgeEdge',
  kind: 'interface',
  style: 'value-object',
  description: 'A directed relationship between two concept nodes. Drives learning path ordering and gap detection.'
})
CREATE (tKnowledgeEdge)-[:HAS_FIELD]->(:TGTField {name: 'from',             type: 'string',                                   description: 'Source conceptId'})
CREATE (tKnowledgeEdge)-[:HAS_FIELD]->(:TGTField {name: 'to',               type: 'string',                                   description: 'Target conceptId'})
CREATE (tKnowledgeEdge)-[:HAS_FIELD]->(:TGTField {name: 'relationshipType', type: "'prerequisite'|'reinforces'|'contrasts'",   description: 'Semantic type of the relationship'})

CREATE (tCuratedBatch:TGTType {
  name: 'CuratedBatch',
  kind: 'interface',
  style: 'value-object',
  description: 'A curator-selected grouping of concepts that teach well together. Delivered with the knowledge graph to drive sequencing decisions.'
})
CREATE (tCuratedBatch)-[:HAS_FIELD]->(:TGTField {name: 'batchId',             type: 'string',   description: 'Unique batch identifier'})
CREATE (tCuratedBatch)-[:HAS_FIELD]->(:TGTField {name: 'label',               type: 'string',   description: 'Human-readable batch name'})
CREATE (tCuratedBatch)-[:HAS_FIELD]->(:TGTField {name: 'conceptIds',          type: 'string[]', description: 'Concepts in this batch'})
CREATE (tCuratedBatch)-[:HAS_FIELD]->(:TGTField {name: 'teachTogetherReason', type: 'string',   description: 'Rationale for grouping these concepts'})

CREATE (tMisconceptionEntry:TGTType {
  name: 'MisconceptionEntry',
  kind: 'interface',
  style: 'value-object',
  description: 'A documented learner misconception tied to one or more concept nodes. Delivered with the knowledge graph to help the Personal Twin surface anti-patterns during instruction.'
})
CREATE (tMisconceptionEntry)-[:HAS_FIELD]->(:TGTField {name: 'misconceptionId', type: 'string',         description: 'Unique misconception identifier'})
CREATE (tMisconceptionEntry)-[:HAS_FIELD]->(:TGTField {name: 'conceptIds',      type: 'string[]',       description: 'Concepts this misconception involves'})
CREATE (tMisconceptionEntry)-[:HAS_FIELD]->(:TGTField {name: 'sourceDomain',    type: 'string | null',  description: 'Domain where this misconception typically originates, if known'})
CREATE (tMisconceptionEntry)-[:HAS_FIELD]->(:TGTField {name: 'description',     type: 'string',         description: 'Plain-language description of the misconception'})

CREATE (tDomainKnowledgeGraph:TGTType {
  name: 'DomainKnowledgeGraph',
  kind: 'class',
  style: 'value-object',
  description: 'The full domain knowledge graph as served by the Cartographer. Immutable after construction. Includes concept nodes, edges, curated batches, misconception catalog, and a version stamp.',
  invariants: 'version always present; nodes and edges never mutated after construction'
})
CREATE (tDomainKnowledgeGraph)-[:HAS_FIELD]->(:TGTField {name: 'domain',               type: 'string',               description: 'Domain identifier'})
CREATE (tDomainKnowledgeGraph)-[:HAS_FIELD]->(:TGTField {name: 'nodes',                type: 'ConceptNode[]',        description: 'All concept nodes in the domain'})
CREATE (tDomainKnowledgeGraph)-[:HAS_FIELD]->(:TGTField {name: 'edges',                type: 'KnowledgeEdge[]',      description: 'All knowledge edges'})
CREATE (tDomainKnowledgeGraph)-[:HAS_FIELD]->(:TGTField {name: 'curatedBatches',       type: 'CuratedBatch[]',       description: 'Curator-defined teaching groups'})
CREATE (tDomainKnowledgeGraph)-[:HAS_FIELD]->(:TGTField {name: 'misconceptionCatalog', type: 'MisconceptionEntry[]', description: 'Documented misconceptions for this domain'})
CREATE (tDomainKnowledgeGraph)-[:HAS_FIELD]->(:TGTField {name: 'version',              type: 'string',               description: 'Semantic version of this graph snapshot'})

// ──────────────────────────────────────────────────────────────
// FILES
// ──────────────────────────────────────────────────────────────

// === types.ts ===
CREATE (fTypes:TGTFile {
  name: 'types.ts',
  path: 'src/domain/cartographer/types.ts',
  description: 'All Cartographer types: DomainKnowledgeGraph, ConceptNode, KnowledgeEdge, CrossDomainEquivalence, CuratedBatch, MisconceptionEntry.',
  exports: 'DomainKnowledgeGraph, ConceptNode, KnowledgeEdge, CrossDomainEquivalence, CuratedBatch, MisconceptionEntry'
})
CREATE (fTypes)-[:CONTAINS]->(tDomainKnowledgeGraph)
CREATE (fTypes)-[:CONTAINS]->(tConceptNode)
CREATE (fTypes)-[:CONTAINS]->(tKnowledgeEdge)
CREATE (fTypes)-[:CONTAINS]->(tCrossEquiv)
CREATE (fTypes)-[:CONTAINS]->(tCuratedBatch)
CREATE (fTypes)-[:CONTAINS]->(tMisconceptionEntry)
CREATE (mod)-[:HAS_FILE]->(fTypes)

// === graph-builder.ts ===
CREATE (fGraphBuilder:TGTFile {
  name: 'graph-builder.ts',
  path: 'src/domain/cartographer/graph-builder.ts',
  description: 'Pure functions for assembling and resolving the domain knowledge graph. No side effects — safe to call in tests without mocking.',
  exports: 'buildGraph, resolveEquivalencesForLearner, computeContentFloor'
})

CREATE (fnBuildGraph:TGTFunction {
  name: 'buildGraph',
  style: 'pure',
  async: false,
  signature: '(domain: string, rawNodes: unknown[], rawEdges: unknown[]) => DomainKnowledgeGraph',
  description: 'Validates raw node and edge data and assembles a DomainKnowledgeGraph. Throws on validation failure. Same inputs always produce same output. Pure.'
})
CREATE (fnBuildGraph)-[:RETURNS]->(tDomainKnowledgeGraph)

CREATE (fnResolveEquivalences:TGTFunction {
  name: 'resolveEquivalencesForLearner',
  style: 'pure',
  async: false,
  signature: '(graph: DomainKnowledgeGraph, learnerBaseline: MasteryNode[]) => DomainKnowledgeGraph',
  description: 'Annotates CrossDomainEquivalence entries on each ConceptNode with learner-specific context derived from the learner mastery baseline. Returns a new graph; does not mutate input. Pure.'
})
CREATE (fnResolveEquivalences)-[:ACCEPTS]->(tDomainKnowledgeGraph)
CREATE (fnResolveEquivalences)-[:RETURNS]->(tDomainKnowledgeGraph)

CREATE (fnComputeFloor:TGTFunction {
  name: 'computeContentFloor',
  style: 'pure',
  async: false,
  signature: '(node: ConceptNode, learnerAltitude: number) => number',
  description: 'Returns max(learnerAltitude + 1, 1), capped at node.bloomsTargetAltitude. Enforces LearnerBaselineSetsFloor: content is never served at or below what the learner already knows. Pure.'
})
CREATE (fnComputeFloor)-[:ACCEPTS]->(tConceptNode)

CREATE (fGraphBuilder)-[:CONTAINS]->(fnBuildGraph)
CREATE (fGraphBuilder)-[:CONTAINS]->(fnResolveEquivalences)
CREATE (fGraphBuilder)-[:CONTAINS]->(fnComputeFloor)
CREATE (mod)-[:HAS_FILE]->(fGraphBuilder)

// === cartographer.ts ===
CREATE (fCartographer:TGTFile {
  name: 'cartographer.ts',
  path: 'src/domain/cartographer/cartographer.ts',
  description: 'Stateful Cartographer class. Holds the domain knowledge graph in memory. Serves graph on NATS request.',
  exports: 'Cartographer'
})

CREATE (fnGetGraph:TGTFunction {
  name: 'getGraph',
  style: 'stateful-class',
  async: false,
  signature: '(learnerBaseline?: MasteryNode[]) => DomainKnowledgeGraph',
  description: 'Returns the current domain knowledge graph. If learnerBaseline provided, delegates to resolveEquivalencesForLearner first. Read-only — does not mutate stored graph.'
})
CREATE (fnGetGraph)-[:RETURNS]->(tDomainKnowledgeGraph)

CREATE (fnOnKgRequest:TGTFunction {
  name: 'onKgRequest',
  style: 'effect',
  async: true,
  signature: "(requestPayload: dwell.{twinId}.kg.request, replySubject: string) => void",
  description: 'NATS subscription handler. Extracts learner baseline from payload, calls getGraph, publishes DomainKnowledgeGraph to replySubject. Effect — publishes to NATS transport.'
})
CREATE (fnOnKgRequest)-[:RETURNS]->(tDomainKnowledgeGraph)

CREATE (fCartographer)-[:CONTAINS]->(fnGetGraph)
CREATE (fCartographer)-[:CONTAINS]->(fnOnKgRequest)
CREATE (mod)-[:HAS_FILE]->(fCartographer)

// ──────────────────────────────────────────────────────────────
// INVARIANTS ENFORCED
// ──────────────────────────────────────────────────────────────

// Trace: d05-invariants.cypher — DomainTwinSetsCeiling
CREATE (mod)-[:ENFORCES]->(:TGTInvariantRef {
  name: 'DomainTwinSetsCeiling',
  note: 'bloomsTargetAltitude is set on ConceptNode by the Cartographer. It is never overridden by the learner or the Personal Twin.'
})

// Trace: d05-invariants.cypher — LearnerBaselineSetsFloor
CREATE (mod)-[:ENFORCES]->(:TGTInvariantRef {
  name: 'LearnerBaselineSetsFloor',
  note: 'computeContentFloor enforces floor = max(learnerAltitude + 1, 1) capped at bloomsTargetAltitude. Content is never served at or below what the learner already knows.'
})
