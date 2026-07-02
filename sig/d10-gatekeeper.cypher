// ============================================================
// D-10 GATEKEEPER — Module Pre-Game Blueprint
// ============================================================
//
// The CSP-style path sequencer for the Personal Twin.
// Determines which concept node comes next given mastery state,
// gap priorities, curated batches, and convergent-misconception
// risks.
//
// Traceable to: DWELL-FEATURES.md F-1.2, DWELL-REQUIREMENTS.md
// REQ-DW-BLM-02, REQ-DW-KGM-02, REQ-DW-LGM-04, REQ-DW-MST-05
//
// ============================================================

MERGE (mod:TGTModule {name: 'gatekeeper'})
SET mod.path = 'src/personal-twin/gatekeeper',
    mod.capability = 'DW-PT-04',
    mod.twin = 'personal',
    mod.tier = 'Dwell-PersonalTwin',
    mod.description = 'CSP-style learning path sequencer. Builds and maintains the learning path for an active intent. Convergent-misconception clusters always head the sequence. Respects curated batches. Adjusts dynamically as mastery updates. The only component that decides what the learner sees next.'

// ──────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────

CREATE (tPathNode:TGTType {
  name: 'PathNode',
  kind: 'interface',
  style: 'pure',
  description: 'A single item in the ordered learning sequence.'
})
CREATE (tPathNode)-[:HAS_FIELD]->(:TGTField {name: 'conceptId',         type: 'string',        required: true,  description: 'Concept to learn'})
CREATE (tPathNode)-[:HAS_FIELD]->(:TGTField {name: 'batchId',           type: 'string | null', required: true,  description: 'Curated batch this node belongs to, or null'})
CREATE (tPathNode)-[:HAS_FIELD]->(:TGTField {name: 'altitudeToTeach',   type: 'number',        required: true,  description: 'Content altitude to serve: bloomsCurrentAltitude + 1'})
CREATE (tPathNode)-[:HAS_FIELD]->(:TGTField {name: 'estimatedSessions', type: 'number',        required: false, description: 'Estimated number of sessions to achieve target altitude'})
CREATE (tPathNode)-[:HAS_FIELD]->(:TGTField {name: 'priority',          type: 'string',        required: true,  description: 'convergent-misconception | high-gap | medium-gap | low-gap'})

CREATE (tLearningPath:TGTType {
  name: 'LearningPath',
  kind: 'class',
  style: 'value-object',
  description: 'The ordered sequence of concept nodes for an active learning intent. Immutable — each adjustment returns a new LearningPath.',
  invariants: 'convergent-misconception nodes always precede all others; batch members always appear together'
})
CREATE (tLearningPath)-[:HAS_FIELD]->(:TGTField {name: 'domain',       type: 'string',     required: true,  description: 'Domain this path covers'})
CREATE (tLearningPath)-[:HAS_FIELD]->(:TGTField {name: 'sequence',     type: 'PathNode[]', required: true,  description: 'Ordered sequence of nodes'})
CREATE (tLearningPath)-[:HAS_FIELD]->(:TGTField {name: 'generatedAt',  type: 'ISO8601',    required: true,  description: 'When this path was generated or last adjusted'})

// ──────────────────────────────────────────────────────────────
// FILES
// ──────────────────────────────────────────────────────────────

CREATE (fTypes:TGTFile {
  name: 'types.ts',
  path: 'src/personal-twin/gatekeeper/types.ts',
  description: 'LearningPath, PathNode.',
  exports: 'LearningPath, PathNode'
})

CREATE (fPathBuilder:TGTFile {
  name: 'path-builder.ts',
  path: 'src/personal-twin/gatekeeper/path-builder.ts',
  description: 'Pure path construction and adjustment functions. No state. Takes mastery + domain graph + gaps → returns LearningPath.',
  exports: 'buildPath, prioritizeConvergentMisconceptions, adjustPath, completedNodes'
})

CREATE (fGatekeeper:TGTFile {
  name: 'gatekeeper.ts',
  path: 'src/personal-twin/gatekeeper/gatekeeper.ts',
  description: 'Stateful Gatekeeper class. Holds active LearningPath in memory. Reacts to mastery updates and gap cluster changes. Posts bb.path.ready and bb.path.updated.',
  exports: 'Gatekeeper, createGatekeeper'
})

CREATE (fIndex:TGTFile {
  name: 'index.ts',
  path: 'src/personal-twin/gatekeeper/index.ts',
  description: 'Barrel export.',
  exports: 'All types, Gatekeeper, createGatekeeper'
})

CREATE (mod)-[:CONTAINS]->(fTypes)
CREATE (mod)-[:CONTAINS]->(fPathBuilder)
CREATE (mod)-[:CONTAINS]->(fGatekeeper)
CREATE (mod)-[:CONTAINS]->(fIndex)

CREATE (fTypes)-[:CONTAINS]->(tPathNode)
CREATE (fTypes)-[:CONTAINS]->(tLearningPath)

// ──────────────────────────────────────────────────────────────
// FUNCTIONS — path-builder.ts (pure)
// ──────────────────────────────────────────────────────────────

CREATE (fnBuildPath:TGTFunction {
  name: 'buildPath',
  signature: '(masteryMap: MasteryMap, graph: DomainKnowledgeGraph, gaps: GapCluster[], batches: CuratedBatch[]) => LearningPath',
  style: 'pure',
  async: false,
  description: 'CSP-style path construction. Ordering: (1) convergent-misconception gap clusters first, (2) cold nodes (altitudeGap = target) ordered by prerequisite depth, (3) warm nodes ordered by altitudeGap descending. Batch members are always grouped together — a batch is never split across sections. Returns immutable LearningPath.'
})
CREATE (fPathBuilder)-[:CONTAINS]->(fnBuildPath)

CREATE (fnPrioritize:TGTFunction {
  name: 'prioritizeConvergentMisconceptions',
  signature: '(path: LearningPath, gaps: GapCluster[]) => LearningPath',
  style: 'pure',
  async: false,
  description: 'Ensures all convergent-misconception cluster nodes appear at the head of the sequence, before any cold or warm nodes. Called as a post-processing step after buildPath. Returns new LearningPath.'
})
CREATE (fPathBuilder)-[:CONTAINS]->(fnPrioritize)

CREATE (fnAdjustPath:TGTFunction {
  name: 'adjustPath',
  signature: '(path: LearningPath, updatedNode: MasteryNode) => LearningPath',
  style: 'pure',
  async: false,
  description: 'Adjusts the learning path after a mastery update. Removes the node if altitudeGap = 0 (completed). Updates altitudeToTeach if bloomsCurrentAltitude advanced. Re-orders if priority changed. Returns new LearningPath (immutable).'
})
CREATE (fPathBuilder)-[:CONTAINS]->(fnAdjustPath)

CREATE (fnCompleted:TGTFunction {
  name: 'completedNodes',
  signature: '(masteryMap: MasteryMap) => string[]',
  style: 'pure',
  async: false,
  description: 'Returns conceptIds of all nodes where altitudeGap = 0. Used to filter path on initialization. Pure.'
})
CREATE (fPathBuilder)-[:CONTAINS]->(fnCompleted)

// ──────────────────────────────────────────────────────────────
// FUNCTIONS — gatekeeper.ts (stateful)
// ──────────────────────────────────────────────────────────────

CREATE (tGatekeeperClass:TGTType {
  name: 'Gatekeeper',
  kind: 'class',
  style: 'stateful-class',
  description: 'Holds the active LearningPath. Reacts to mastery and gap events. Emits bb.path.ready and bb.path.updated.',
  constructorDeps: 'bb: BlackboardClient'
})
CREATE (fGatekeeper)-[:CONTAINS]->(tGatekeeperClass)

CREATE (fnGeneratePath:TGTFunction {
  name: 'generatePath',
  signature: '(masteryMap: MasteryMap, graph: DomainKnowledgeGraph, gaps: GapCluster[]) => void',
  style: 'effect',
  async: false,
  description: 'Builds the initial path via buildPath + prioritizeConvergentMisconceptions. Stores in memory. Posts bb.path.{domain}.ready to BB.'
})
CREATE (fGatekeeper)-[:CONTAINS]->(fnGeneratePath)

CREATE (fnNextNode:TGTFunction {
  name: 'nextNode',
  signature: '() => PathNode | null',
  style: 'pure',
  async: false,
  description: 'Returns the next PathNode from the active sequence, or null if path is complete.'
})
CREATE (fGatekeeper)-[:CONTAINS]->(fnNextNode)

CREATE (fnOnMasteryUpdated:TGTFunction {
  name: 'onMasteryUpdated',
  signature: '(update: MasteryNode) => void',
  style: 'effect',
  async: false,
  description: 'Calls adjustPath with the updated node. If path changed, posts bb.path.{domain}.updated to BB.'
})
CREATE (fGatekeeper)-[:CONTAINS]->(fnOnMasteryUpdated)

CREATE (fnOnGapsUpdated:TGTFunction {
  name: 'onGapsUpdated',
  signature: '(gaps: GapCluster[], masteryMap: MasteryMap, graph: DomainKnowledgeGraph) => void',
  style: 'effect',
  async: false,
  description: 'Re-runs buildPath when gap clusters change significantly (e.g. new convergent-misconception detected). Posts bb.path.{domain}.updated.'
})
CREATE (fGatekeeper)-[:CONTAINS]->(fnOnGapsUpdated)

// ──────────────────────────────────────────────────────────────
// DEPENDENCIES
// ──────────────────────────────────────────────────────────────

CREATE (mod)-[:DEPENDS_ON]->(:TGTModuleRef {name: 'calibrator',  capability: 'DW-PT-02', reason: 'Reads MasteryMap to build and adjust path'})
CREATE (mod)-[:DEPENDS_ON]->(:TGTModuleRef {name: 'surveyor',    capability: 'DW-PT-03', reason: 'Reads GapCluster[] to determine priority ordering'})
CREATE (mod)-[:DEPENDS_ON]->(:TGTModuleRef {name: 'blackboard',  capability: 'F-2',       reason: 'Posts bb.path.ready and bb.path.updated'})

;
