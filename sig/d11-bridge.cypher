// ============================================================
// D-11 BRIDGE — Code-as-Graph (Pre-Game Blueprint)
// ============================================================
//
// The personalization engine. When a learner is stuck at a
// confidence plateau, Bridge transforms a generic bridge card
// from the Domain Twin Librarian into something anchored in
// the learner's own lived experience and mental models.
//
// Key relationships:
//   - Consumes bb.bridge.requested (from Surveyor via BB)
//   - Reads AntiquarianSnapshot from BB only (never direct call)
//   - Receives pre-filtered BridgeCard candidates from Answer Agent
//   - Emits bb.bridge.ready
//
// Traceability: F-6 (Bridge Knowledge Gaps), REQ-DW-BRG-01..05
// Invariant: BridgeReadsSnapshotNotAntiquarian
//
// ============================================================

// ──────────────────────────────────────────────────────────────
// MODULE — MERGE (declared in d01-agents.cypher)
// ──────────────────────────────────────────────────────────────

MERGE (mod:TGTModule {name: 'bridge'})

// ──────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────

// Generic BridgeCard as delivered from Domain Twin Librarian
CREATE (tBridgeCardGeneric:TGTType {
  name: 'BridgeCardGeneric',
  kind: 'class',
  style: 'value-object',
  description: 'A generic bridge card delivered from the Domain Twin Librarian. Describes how to connect a source anchor concept to target concepts. Immutable after creation. Personalized variant extends this.',
  invariants: 'bridgeId always UUID; genericText never empty; effectivenessScore in [0.0, 1.0]'
})
CREATE (tBridgeCardGeneric)-[:HAS_FIELD]->(:TGTField {name: 'bridgeId',            type: 'string',   description: 'Unique bridge card identifier (UUID)'})
CREATE (tBridgeCardGeneric)-[:HAS_FIELD]->(:TGTField {name: 'bridgeType',          type: 'string',   description: 'Bridge pattern type (analogy, contrast, structural-similarity, etc.)'})
CREATE (tBridgeCardGeneric)-[:HAS_FIELD]->(:TGTField {name: 'sourceAnchor',        type: 'string',   description: 'The conceptual anchor domain this bridge builds from'})
CREATE (tBridgeCardGeneric)-[:HAS_FIELD]->(:TGTField {name: 'targetConceptIds',    type: 'string[]', description: 'Concept node IDs this bridge is connecting the learner toward'})
CREATE (tBridgeCardGeneric)-[:HAS_FIELD]->(:TGTField {name: 'genericText',         type: 'string',   description: 'The unlocalized bridge explanation text from the Domain Twin'})
CREATE (tBridgeCardGeneric)-[:HAS_FIELD]->(:TGTField {name: 'effectivenessScore',  type: 'number',   description: 'Domain Twin Librarian effectiveness score 0.0–1.0 from accumulated outcome signals'})

// Personalized BridgeCard — extends the generic with learner-specific fields
CREATE (tBridgeCardPersonalized:TGTType {
  name: 'BridgeCardPersonalized',
  kind: 'class',
  style: 'value-object',
  description: 'A personalized bridge card. Extends BridgeCardGeneric with learner-specific text anchored in the learner\'s own mental model. Produced by Bridge.personalize(). Immutable after creation.',
  invariants: 'personalizedText never empty; anchorReference identifies the specific learner experience used; inherits all BridgeCardGeneric invariants'
})
CREATE (tBridgeCardPersonalized)-[:EXTENDS]->(tBridgeCardGeneric)
CREATE (tBridgeCardPersonalized)-[:HAS_FIELD]->(:TGTField {name: 'bridgeId',           type: 'string', description: 'Inherited: bridge card UUID (same as source generic card)'})
CREATE (tBridgeCardPersonalized)-[:HAS_FIELD]->(:TGTField {name: 'bridgeType',         type: 'string', description: 'Inherited: bridge pattern type'})
CREATE (tBridgeCardPersonalized)-[:HAS_FIELD]->(:TGTField {name: 'sourceAnchor',       type: 'string', description: 'Inherited: source anchor domain'})
CREATE (tBridgeCardPersonalized)-[:HAS_FIELD]->(:TGTField {name: 'targetConceptIds',   type: 'string[]', description: 'Inherited: target concept node IDs'})
CREATE (tBridgeCardPersonalized)-[:HAS_FIELD]->(:TGTField {name: 'genericText',        type: 'string', description: 'Inherited: original generic text (preserved for attribution)'})
CREATE (tBridgeCardPersonalized)-[:HAS_FIELD]->(:TGTField {name: 'effectivenessScore', type: 'number', description: 'Inherited: Domain Twin effectiveness score'})
CREATE (tBridgeCardPersonalized)-[:HAS_FIELD]->(:TGTField {name: 'personalizedText',   type: 'string', description: 'Learner-specific bridge explanation anchored in their mental model'})
CREATE (tBridgeCardPersonalized)-[:HAS_FIELD]->(:TGTField {name: 'anchorReference',    type: 'string', description: 'Human-readable reference to the learner experience used as anchor (e.g. "Peach Bottom EOP hierarchy")'})
CREATE (tBridgeCardPersonalized)-[:HAS_FIELD]->(:TGTField {name: 'mentalModelId',      type: 'string', description: 'ID of the MentalModel from AntiquarianSnapshot that was selected as the anchor'})

// ──────────────────────────────────────────────────────────────
// FILES
// ──────────────────────────────────────────────────────────────

// === types.ts ===
CREATE (fBridgeTypes:TGTFile {
  name: 'types.ts',
  path: 'src/dwell/bridge/types.ts',
  description: 'BridgeCard type definitions: BridgeCardGeneric (from Domain Twin Librarian) and BridgeCardPersonalized (Bridge output).',
  exports: 'BridgeCardGeneric, BridgeCardPersonalized'
})
CREATE (fBridgeTypes)-[:BELONGS_TO]->(mod)
CREATE (fBridgeTypes)-[:CONTAINS]->(tBridgeCardGeneric)
CREATE (fBridgeTypes)-[:CONTAINS]->(tBridgeCardPersonalized)

// === mental-model-selector.ts ===
CREATE (fMentalModelSelector:TGTFile {
  name: 'mental-model-selector.ts',
  path: 'src/dwell/bridge/mental-model-selector.ts',
  description: 'Pure functions for selecting the best mental model anchor for a given bridge request. No BB posts, no NATS calls. Deterministic selection logic per REQ-DW-BRG-02, REQ-DW-BRG-03, REQ-DW-BRG-05.',
  exports: 'selectMentalModel, scoreModelFit'
})
CREATE (fMentalModelSelector)-[:BELONGS_TO]->(mod)

CREATE (fnSelectMentalModel:TGTFunction {
  name: 'selectMentalModel',
  signature: '(mentalModels: MentalModel[], bridgeType: string, gapType: string): MentalModel | null',
  style: 'pure',
  async: false,
  description: 'Picks the best mental model anchor for a bridge type and gap type. For convergent-misconception gaps, must only select from domains orthogonal to the misleading prior domains (REQ-DW-BRG-05). Returns null if no suitable model found. Pure — no side effects.'
})
CREATE (fMentalModelSelector)-[:CONTAINS]->(fnSelectMentalModel)

CREATE (fnScoreModelFit:TGTFunction {
  name: 'scoreModelFit',
  signature: '(model: MentalModel, bridgeType: string): number',
  style: 'pure',
  async: false,
  description: 'Returns a 0–1 fit score for a mental model against a bridge type. Operational/embodied models (strength > 0.80) are preferred over academic models (REQ-DW-BRG-02). Pure — no side effects.'
})
CREATE (fMentalModelSelector)-[:CONTAINS]->(fnScoreModelFit)

// === personalizer.ts ===
CREATE (fPersonalizer:TGTFile {
  name: 'personalizer.ts',
  path: 'src/dwell/bridge/personalizer.ts',
  description: 'Pure function for transforming a generic BridgeCard into a personalized one using the learner\'s selected mental model and AntiquarianSnapshot. No BB posts, no state mutation. Satisfies REQ-DW-BRG-02, REQ-DW-BRG-04.',
  exports: 'personalize'
})
CREATE (fPersonalizer)-[:BELONGS_TO]->(mod)

CREATE (fnPersonalize:TGTFunction {
  name: 'personalize',
  signature: '(generic: BridgeCardGeneric, model: MentalModel, snapshot: AntiquarianSnapshot): BridgeCardPersonalized',
  style: 'pure',
  async: false,
  description: 'Transforms a generic bridge card into a learner-specific card using the selected mental model from AntiquarianSnapshot. Populates personalizedText, anchorReference, and mentalModelId. Returns a new BridgeCardPersonalized. Pure — no side effects, no BB access.'
})
CREATE (fPersonalizer)-[:CONTAINS]->(fnPersonalize)

// === bridge.ts ===
CREATE (fBridgeAgent:TGTFile {
  name: 'bridge.ts',
  path: 'src/dwell/bridge/bridge.ts',
  description: 'Stateful Bridge agent class. Consumes bb.bridge.requested events with pre-filtered BridgeCardGeneric candidates from Answer Agent. Selects mental model via mental-model-selector, personalizes via personalizer, posts bb.bridge.ready. Satisfies REQ-DW-BRG-01, REQ-DW-BRG-02, REQ-DW-BRG-03.',
  exports: 'Bridge'
})
CREATE (fBridgeAgent)-[:BELONGS_TO]->(mod)

CREATE (tBridgeClass:TGTType {
  name: 'Bridge',
  kind: 'class',
  style: 'stateful-class',
  description: 'Stateful Bridge agent. Holds no learner state — reads AntiquarianSnapshot from BB only (invariant BridgeReadsSnapshotNotAntiquarian). Receives bridge.requested events carrying pre-filtered generic card candidates. Selects best mental model, personalizes, posts bb.bridge.ready.',
  invariants: 'Never calls Antiquarian directly — AntiquarianSnapshot must already be present on BB; posts bb.bridge.ready after every successful personalization'
})
CREATE (fBridgeAgent)-[:CONTAINS]->(tBridgeClass)

CREATE (fnOnBridgeRequested:TGTFunction {
  name: 'onBridgeRequested',
  signature: '(request: BridgeBBEvent, snapshot: AntiquarianSnapshot, candidates: BridgeCardGeneric[]): void',
  style: 'effect',
  async: false,
  description: 'Handles a bridge request from the BB. Selects the best mental model anchor using mental-model-selector, calls personalizer.personalize() on the best-fit candidate, then posts bb.bridge.ready with the personalized card. Effect: posts to BB.'
})
CREATE (tBridgeClass)-[:HAS_FUNCTION]->(fnOnBridgeRequested)

// ──────────────────────────────────────────────────────────────
// INVARIANT REFERENCES
// ──────────────────────────────────────────────────────────────

MATCH (inv:TGTInvariant {name: 'BridgeReadsSnapshotNotAntiquarian'})
CREATE (mod)-[:ENFORCES]->(inv)
