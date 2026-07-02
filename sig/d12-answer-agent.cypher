// ============================================================
// D-12 ANSWER AGENT — Code-as-Graph (Pre-Game Blueprint)
// ============================================================
//
// The evaluation hub. When multiple Domain Twins respond to a
// discovery broadcast, or multiple bridge card candidates arrive,
// the Answer Agent uses full BB context to rank, select, and
// route. All scoring is Tier 0 — deterministic weighted formulas,
// no LLM calls.
//
// Key relationships:
//   - Consumes discovery responses from the BB (via Zipper)
//   - Ranks DiscoveryResponses using DiscoveryEvaluationPolicy
//   - Pre-filters BridgeCardGeneric candidates before Bridge personalizes
//   - Posts bb.answer.* for Engagement Agent routing
//
// Traceability: F-3.2 (Evaluate and Select), REQ-DW-DTD-03..05,
//               REQ-DW-BRG-03, REQ-DW-ARC-04
// Invariant: DiscoveryScoringIsAlgorithmic
//
// ============================================================

// ──────────────────────────────────────────────────────────────
// MODULE — MERGE (declared in d01-agents.cypher)
// ──────────────────────────────────────────────────────────────

MERGE (mod:TGTModule {name: 'answer-agent'})

// ──────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────

CREATE (tEvaluatedResponse:TGTType {
  name: 'EvaluatedResponse',
  kind: 'interface',
  style: 'pure',
  description: 'A DiscoveryResponse after scoring and ranking. Carries the original response plus its computed score and rank position. Produced by rankResponses().',
  invariants: 'score in [0.0, 1.0]; rank is 1-based; twinId never empty'
})
CREATE (tEvaluatedResponse)-[:HAS_FIELD]->(:TGTField {name: 'twinId',   type: 'string',            description: 'ID of the Domain Twin that produced this response'})
CREATE (tEvaluatedResponse)-[:HAS_FIELD]->(:TGTField {name: 'response', type: 'DiscoveryResponse',  description: 'The raw DiscoveryResponse from the Domain Twin'})
CREATE (tEvaluatedResponse)-[:HAS_FIELD]->(:TGTField {name: 'score',    type: 'number',             description: 'Weighted composite score 0.0–1.0 from scoreDiscoveryResponse()'})
CREATE (tEvaluatedResponse)-[:HAS_FIELD]->(:TGTField {name: 'rank',     type: 'number',             description: '1-based rank among all evaluated responses (1 = best fit)'})

CREATE (tBBContext:TGTType {
  name: 'BBContext',
  kind: 'interface',
  style: 'pure',
  description: 'Snapshot of the relevant BB state needed to evaluate discovery responses and bridge candidates. Assembled by the Answer Agent from BB reads before scoring. Immutable during a single evaluation pass.',
  invariants: 'sourceDomains never empty when called during active intent'
})
CREATE (tBBContext)-[:HAS_FIELD]->(:TGTField {name: 'masteryMap',    type: 'MasteryMap',       description: 'Current per-concept mastery state from Calibrator\'s last BB post'})
CREATE (tBBContext)-[:HAS_FIELD]->(:TGTField {name: 'gapClusters',   type: 'GapCluster[]',     description: 'Current gap clusters from Surveyor\'s last BB post'})
CREATE (tBBContext)-[:HAS_FIELD]->(:TGTField {name: 'sourceDomains', type: 'string[]',         description: 'Domain IDs from the learner\'s prior mastered domains (used for cross-domain match scoring)'})

// ──────────────────────────────────────────────────────────────
// FILES
// ──────────────────────────────────────────────────────────────

// === types.ts ===
CREATE (fAnswerTypes:TGTFile {
  name: 'types.ts',
  path: 'src/dwell/answer-agent/types.ts',
  description: 'Answer Agent type definitions: EvaluatedResponse and BBContext.',
  exports: 'EvaluatedResponse, BBContext'
})
CREATE (fAnswerTypes)-[:BELONGS_TO]->(mod)
CREATE (fAnswerTypes)-[:CONTAINS]->(tEvaluatedResponse)
CREATE (fAnswerTypes)-[:CONTAINS]->(tBBContext)

// === discovery-scorer.ts ===
CREATE (fDiscoveryScorer:TGTFile {
  name: 'discovery-scorer.ts',
  path: 'src/dwell/answer-agent/discovery-scorer.ts',
  description: 'Pure Tier 0 functions for scoring and ranking DiscoveryResponses. No LLM calls. All weights come from DiscoveryEvaluationPolicy config (REQ-DW-ARC-03, REQ-DW-ARC-04). Satisfies DiscoveryScoringIsAlgorithmic invariant.',
  exports: 'scoreDiscoveryResponse, computeCrossDomainMatch, computeSpecificity, rankResponses'
})
CREATE (fDiscoveryScorer)-[:BELONGS_TO]->(mod)

CREATE (fnScoreDiscovery:TGTFunction {
  name: 'scoreDiscoveryResponse',
  signature: '(response: DiscoveryResponse, sourceDomains: string[], policy: DiscoveryEvaluationPolicy): number',
  style: 'pure',
  async: false,
  description: 'Computes a weighted composite score: (coverage × w1) + (qualityScore × w2) + (crossDomainMatch × w3) + (specificity × w4). All weights come from DiscoveryEvaluationPolicy; none hardcoded. Returns score in [0.0, 1.0]. Pure — no side effects.'
})
CREATE (fDiscoveryScorer)-[:CONTAINS]->(fnScoreDiscovery)

CREATE (fnCrossDomainMatch:TGTFunction {
  name: 'computeCrossDomainMatch',
  signature: '(response: DiscoveryResponse, sourceDomains: string[]): number',
  style: 'pure',
  async: false,
  description: 'Returns 0–1: proportion of the learner\'s source domains that appear in response.crossDomainSupport. A Domain Twin that explicitly supports the learner\'s prior domains scores higher. Pure — no side effects.'
})
CREATE (fDiscoveryScorer)-[:CONTAINS]->(fnCrossDomainMatch)

CREATE (fnComputeSpecificity:TGTFunction {
  name: 'computeSpecificity',
  signature: '(response: DiscoveryResponse, intent: LearningIntent): number',
  style: 'pure',
  async: false,
  description: 'Returns 0–1: how specific the responding Domain Twin is to the declared intent. A cert-specific twin (e.g. AWS SAA) scores higher than a general cloud twin for a cert-specific intent. Pure — no side effects.'
})
CREATE (fDiscoveryScorer)-[:CONTAINS]->(fnComputeSpecificity)

CREATE (fnRankResponses:TGTFunction {
  name: 'rankResponses',
  signature: '(responses: DiscoveryResponse[], sourceDomains: string[], policy: DiscoveryEvaluationPolicy): EvaluatedResponse[]',
  style: 'pure',
  async: false,
  description: 'Scores all responses using scoreDiscoveryResponse, sorts descending, and returns as EvaluatedResponse[] with 1-based rank. Pure — no side effects.'
})
CREATE (fDiscoveryScorer)-[:CONTAINS]->(fnRankResponses)

// === bridge-candidate-filter.ts ===
CREATE (fBridgeCandidateFilter:TGTFile {
  name: 'bridge-candidate-filter.ts',
  path: 'src/dwell/answer-agent/bridge-candidate-filter.ts',
  description: 'Pure function for pre-filtering bridge card candidates before Bridge personalizes. Uses BB context to eliminate candidates that do not match the learner\'s mastery state or source domains. Satisfies REQ-DW-BRG-03.',
  exports: 'selectBestBridgeCandidate'
})
CREATE (fBridgeCandidateFilter)-[:BELONGS_TO]->(mod)

CREATE (fnSelectBestBridge:TGTFunction {
  name: 'selectBestBridgeCandidate',
  signature: '(candidates: BridgeCardGeneric[], context: BBContext): BridgeCardGeneric',
  style: 'pure',
  async: false,
  description: 'Pre-filters bridge card candidates using source domains and mastery context from BBContext. Returns the single best-fit generic card for Bridge to personalize. Considers effectivenessScore, source domain match, and targetConceptId overlap with active gap clusters. Pure — no side effects.'
})
CREATE (fBridgeCandidateFilter)-[:CONTAINS]->(fnSelectBestBridge)

// === answer-agent.ts ===
CREATE (fAnswerAgent:TGTFile {
  name: 'answer-agent.ts',
  path: 'src/dwell/answer-agent/answer-agent.ts',
  description: 'Stateful Answer Agent class. Evaluates and ranks DiscoveryResponses using full BB context, selects or routes them, and pre-filters bridge candidates for Bridge. Posts results to BB for Engagement Agent routing.',
  exports: 'AnswerAgent'
})
CREATE (fAnswerAgent)-[:BELONGS_TO]->(mod)

CREATE (tAnswerAgentClass:TGTType {
  name: 'AnswerAgent',
  kind: 'class',
  style: 'stateful-class',
  description: 'Stateful Answer Agent. Holds DiscoveryEvaluationPolicy (from config). Evaluates discovery contributions using Tier 0 scoring. Pre-filters bridge candidates using BBContext before Bridge personalizes.',
  invariants: 'All scoring is algorithmic — no LLM calls (DiscoveryScoringIsAlgorithmic); policy weights sourced from config, never hardcoded'
})
CREATE (fAnswerAgent)-[:CONTAINS]->(tAnswerAgentClass)

CREATE (fnOnDiscoveryContributions:TGTFunction {
  name: 'onDiscoveryContributions',
  signature: '(responses: DiscoveryResponse[], intent: LearningIntent, policy: DiscoveryEvaluationPolicy): void',
  style: 'effect',
  async: false,
  description: 'Receives all DiscoveryResponse contributions for a learning intent. Assembles BBContext from BB, calls rankResponses(), selects top-ranked response(s), posts bb.answer.discovery to BB for Engagement Agent routing. Effect: posts to BB.'
})
CREATE (tAnswerAgentClass)-[:HAS_FUNCTION]->(fnOnDiscoveryContributions)

CREATE (fnOnBridgeCandidates:TGTFunction {
  name: 'onBridgeCandidates',
  signature: '(candidates: BridgeCardGeneric[], context: BBContext): void',
  style: 'effect',
  async: false,
  description: 'Receives bridge card candidates from the BB (delivered from Domain Twin Librarian via Zipper). Calls selectBestBridgeCandidate() with current BBContext, then routes the best candidate to Bridge via BB. Effect: posts to BB.'
})
CREATE (tAnswerAgentClass)-[:HAS_FUNCTION]->(fnOnBridgeCandidates)

// ──────────────────────────────────────────────────────────────
// INVARIANT REFERENCES
// ──────────────────────────────────────────────────────────────

MATCH (inv:TGTInvariant {name: 'DiscoveryScoringIsAlgorithmic'})
CREATE (mod)-[:ENFORCES]->(inv)
