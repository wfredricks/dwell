// ============================================================
// D-17 TESTER — Module Pre-Game Blueprint
// ============================================================
//
// Generates calibrated diagnostic and assessment items at the
// requested Bloom's level and concept scope. Accumulates outcome
// signals for item calibration over time. Personal Twin never
// generates assessment items — all items come from the Tester's
// item bank.
//
// Traceable to:
//   DWELL-FEATURES.md     — F-7 (Validate Mastery)
//   DWELL-REQUIREMENTS.md — ASM-01, ASM-02, ASM-03, ASM-04
//   d01-agents.cypher     — TGTModule {name: 'tester'}
//   d05-invariants.cypher — PersonalTwinReportsDomainTwinLearns
//
// ============================================================

MERGE (mod:TGTModule {name: 'tester'})
SET mod.path        = 'src/domain/tester',
    mod.capability  = 'assessment',
    mod.tier        = 'Domain',
    mod.description = 'Generates calibrated assessment items at the requested Bloom level and concept scope. Accumulates outcome signals for item calibration. All assessment items originate here — the Personal Twin never generates them.'

// ──────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────

CREATE (tAssessmentItem:TGTType {
  name: 'AssessmentItem',
  kind: 'class',
  style: 'value-object',
  description: "A single assessment item in the Tester's item bank. Immutable after creation. Carries a discriminationIndex derived from calibration records.",
  invariants: 'bloomsLevel always 1-6; difficultyScore always 0-1; distractors always non-empty'
})
CREATE (tAssessmentItem)-[:HAS_FIELD]->(:TGTField {name: 'itemId',           type: 'string',   description: 'Unique item identifier'})
CREATE (tAssessmentItem)-[:HAS_FIELD]->(:TGTField {name: 'question',         type: 'string',   description: 'Question text'})
CREATE (tAssessmentItem)-[:HAS_FIELD]->(:TGTField {name: 'bloomsLevel',      type: 'number',   description: "Bloom's cognitive level 1-6 this item targets"})
CREATE (tAssessmentItem)-[:HAS_FIELD]->(:TGTField {name: 'conceptIds',       type: 'string[]', description: 'Concepts this item assesses'})
CREATE (tAssessmentItem)-[:HAS_FIELD]->(:TGTField {name: 'distractors',      type: 'string[]', description: 'Incorrect answer options'})
CREATE (tAssessmentItem)-[:HAS_FIELD]->(:TGTField {name: 'correctAnswer',    type: 'string',   description: 'The correct answer'})
CREATE (tAssessmentItem)-[:HAS_FIELD]->(:TGTField {name: 'difficultyScore',  type: 'number',   description: 'Difficulty score 0-1 based on calibration history'})

CREATE (tAssessmentRequest:TGTType {
  name: 'AssessmentRequest',
  kind: 'interface',
  style: 'value-object',
  description: "Request payload from the Personal Twin specifying which concepts to assess, at which Bloom's level, and how many items. Carries the learner's current mastery context for difficulty calibration."
})
CREATE (tAssessmentRequest)-[:HAS_FIELD]->(:TGTField {name: 'conceptIds',     type: 'string[]',                                     description: 'Concepts to assess'})
CREATE (tAssessmentRequest)-[:HAS_FIELD]->(:TGTField {name: 'bloomsLevel',    type: 'number',                                       description: "Target Bloom's level for items"})
CREATE (tAssessmentRequest)-[:HAS_FIELD]->(:TGTField {name: 'count',          type: 'number',                                       description: 'Number of items requested'})
CREATE (tAssessmentRequest)-[:HAS_FIELD]->(:TGTField {name: 'masteryContext', type: '{conceptId: string, currentConfidence: number}[]', description: "Learner's current confidence per concept, used to calibrate expected difficulty"})

CREATE (tItemCalibrationRecord:TGTType {
  name: 'ItemCalibrationRecord',
  kind: 'interface',
  style: 'value-object',
  description: 'Running calibration state for a single assessment item. Updated on every outcome signal that carries this itemId. Used to compute discriminationIndex.',
  invariants: 'correctCount always <= totalCount; discriminationIndex always -1 to 1'
})
CREATE (tItemCalibrationRecord)-[:HAS_FIELD]->(:TGTField {name: 'itemId',              type: 'string', description: 'Item this record belongs to'})
CREATE (tItemCalibrationRecord)-[:HAS_FIELD]->(:TGTField {name: 'correctCount',        type: 'number', description: 'Number of correct responses recorded'})
CREATE (tItemCalibrationRecord)-[:HAS_FIELD]->(:TGTField {name: 'totalCount',          type: 'number', description: 'Total outcome signals received for this item'})
CREATE (tItemCalibrationRecord)-[:HAS_FIELD]->(:TGTField {name: 'discriminationIndex', type: 'number', description: 'Proportion correct among high-mastery learners minus proportion correct among low-mastery learners'})

// ──────────────────────────────────────────────────────────────
// FILES
// ──────────────────────────────────────────────────────────────

// === types.ts ===
CREATE (fTypes:TGTFile {
  name: 'types.ts',
  path: 'src/domain/tester/types.ts',
  description: 'All Tester types: AssessmentItem, AssessmentRequest, ItemCalibrationRecord.',
  exports: 'AssessmentItem, AssessmentRequest, ItemCalibrationRecord'
})
CREATE (fTypes)-[:CONTAINS]->(tAssessmentItem)
CREATE (fTypes)-[:CONTAINS]->(tAssessmentRequest)
CREATE (fTypes)-[:CONTAINS]->(tItemCalibrationRecord)
CREATE (mod)-[:HAS_FILE]->(fTypes)

// === item-selector.ts ===
CREATE (fItemSelector:TGTFile {
  name: 'item-selector.ts',
  path: 'src/domain/tester/item-selector.ts',
  description: 'Pure functions for selecting assessment items from the item bank and calibrating expected difficulty against learner context. No side effects.',
  exports: 'selectItems, calibrateItemDifficulty'
})

CREATE (fnSelectItems:TGTFunction {
  name: 'selectItems',
  style: 'pure',
  async: false,
  signature: '(request: AssessmentRequest, bank: AssessmentItem[]) => AssessmentItem[]',
  description: 'Selects items from bank matching request.bloomsLevel and request.conceptIds. Prioritises items with discriminationIndex > 0.3. Returns exactly request.count items where possible. Pure.'
})
CREATE (fnSelectItems)-[:ACCEPTS]->(tAssessmentRequest)
CREATE (fnSelectItems)-[:RETURNS]->(tAssessmentItem)

CREATE (fnCalibrateItemDifficulty:TGTFunction {
  name: 'calibrateItemDifficulty',
  style: 'pure',
  async: false,
  signature: '(item: AssessmentItem, masteryContext: AssessmentRequest[\'masteryContext\']) => number',
  description: 'Adjusts the expected difficulty of an item based on the learner current confidence at each concept the item covers. Returns a calibrated difficulty score 0-1. Pure.'
})
CREATE (fnCalibrateItemDifficulty)-[:ACCEPTS]->(tAssessmentItem)

CREATE (fItemSelector)-[:CONTAINS]->(fnSelectItems)
CREATE (fItemSelector)-[:CONTAINS]->(fnCalibrateItemDifficulty)
CREATE (mod)-[:HAS_FILE]->(fItemSelector)

// === item-calibrator.ts ===
CREATE (fItemCalibrator:TGTFile {
  name: 'item-calibrator.ts',
  path: 'src/domain/tester/item-calibrator.ts',
  description: 'Functions for updating item calibration records from outcome signals. recordOutcome mutates the calibration store; computeDiscriminationIndex is pure.',
  exports: 'recordOutcome, computeDiscriminationIndex'
})

CREATE (fnRecordItemOutcome:TGTFunction {
  name: 'recordOutcome',
  style: 'effect',
  async: true,
  signature: '(signal: OutcomeSignal) => void',
  description: 'If signal carries an itemId, retrieves the corresponding ItemCalibrationRecord, increments correctCount if the answer was correct, increments totalCount, recomputes discriminationIndex, and persists. Effect — mutates calibration store.'
})
CREATE (fnRecordItemOutcome)-[:ACCEPTS]->(tItemCalibrationRecord)

CREATE (fnComputeDiscrimination:TGTFunction {
  name: 'computeDiscriminationIndex',
  style: 'pure',
  async: false,
  signature: '(record: ItemCalibrationRecord) => number',
  description: 'Proportion correct among high-mastery learners minus proportion correct among low-mastery learners. High-mastery = learner confidence > 0.7 at interaction time. Returns value in [-1, 1]. Pure.'
})
CREATE (fnComputeDiscrimination)-[:ACCEPTS]->(tItemCalibrationRecord)

CREATE (fItemCalibrator)-[:CONTAINS]->(fnRecordItemOutcome)
CREATE (fItemCalibrator)-[:CONTAINS]->(fnComputeDiscrimination)
CREATE (mod)-[:HAS_FILE]->(fItemCalibrator)

// === tester.ts ===
CREATE (fTester:TGTFile {
  name: 'tester.ts',
  path: 'src/domain/tester/tester.ts',
  description: 'Stateful Tester class. Holds the item bank and calibration record store. Serves assessment items on NATS request. Records item outcome signals.',
  exports: 'Tester'
})

CREATE (fnOnAssessmentRequest:TGTFunction {
  name: 'onAssessmentRequest',
  style: 'effect',
  async: true,
  signature: "(payload: dwell.{twinId}.assessment.request, replySubject: string) => void",
  description: 'NATS subscription handler. Calls selectItems with the item bank, applies calibrateItemDifficulty for each selected item, publishes AssessmentItem[] to replySubject. Effect — publishes to NATS transport.'
})
CREATE (fnOnAssessmentRequest)-[:ACCEPTS]->(tAssessmentRequest)
CREATE (fnOnAssessmentRequest)-[:RETURNS]->(tAssessmentItem)

CREATE (fnOnItemOutcomeSignal:TGTFunction {
  name: 'onOutcomeSignal',
  style: 'effect',
  async: true,
  signature: '(signal: OutcomeSignal) => void',
  description: 'NATS subscription handler for dwell.{twinId}.outcome.signal. If signal carries an itemId, delegates to item-calibrator recordOutcome. Effect — mutates calibration store.'
})
CREATE (fnOnItemOutcomeSignal)-[:ACCEPTS]->(tItemCalibrationRecord)

CREATE (fTester)-[:CONTAINS]->(fnOnAssessmentRequest)
CREATE (fTester)-[:CONTAINS]->(fnOnItemOutcomeSignal)
CREATE (mod)-[:HAS_FILE]->(fTester)

// ──────────────────────────────────────────────────────────────
// INVARIANTS ENFORCED
// ──────────────────────────────────────────────────────────────

// Trace: DWELL-REQUIREMENTS.md ASM-02 "Assessment Items from Domain Twin Bank"
CREATE (mod)-[:ENFORCES]->(:TGTInvariantRef {
  name: 'AssessmentItemsFromDomainTwin',
  note: 'Personal Twin never generates assessment items. All items originate from the Tester item bank. Tester delivers items; Personal Twin only routes them to the learner.'
})

// Trace: d05-invariants.cypher — PersonalTwinReportsDomainTwinLearns
CREATE (mod)-[:ENFORCES]->(:TGTInvariantRef {
  name: 'PersonalTwinReportsDomainTwinLearns',
  note: 'The Tester owns all item calibration analytics. It receives lean outcome signals and updates ItemCalibrationRecord internally. The Personal Twin never computes discrimination indices.'
})
