// ============================================================
// D-04 BLOOM'S ALTITUDE MODEL — SIG Pre-Game Blueprint
// ============================================================
//
// TGTType and TGTInvariant nodes encoding the Bloom's Taxonomy
// altitude framework used by Dwell for all mastery tracking.
// Traceable to: DWELL-EVENT-ARCHITECTURE.md — Bloom's Altitude Model
//
// Node Labels: TGTType (kind:'enum'|'class'|'interface'), TGTField, TGTInvariant
//
// ============================================================

// ──────────────────────────────────────────────────────────────
// 1. BLOOM'S ALTITUDE ENUM
// ──────────────────────────────────────────────────────────────

// Trace: Bloom's Altitude Model — "Six levels" table
CREATE (eBloomsAltitude:TGTType {
  name: 'BloomsAltitude',
  kind: 'enum',
  values: '1|2|3|4|5|6',
  description: 'The six Bloom\'s Taxonomy altitude levels used for mastery tracking in Dwell: 1=Remember, 2=Understand, 3=Apply, 4=Analyze, 5=Evaluate, 6=Create'
})

// ──────────────────────────────────────────────────────────────
// 2. SIX LEVEL NODES
// ──────────────────────────────────────────────────────────────

// Trace: Bloom's Altitude Model — levels table and evidence-to-altitude table
// certExample values drawn from the spec example (Bill / AWS SAA→SAP)

// Level 1 — Remember
CREATE (eLevel1:TGTType {
  name: 'BloomsLevel1',
  kind: 'class',
  level: 1,
  altitudeName: 'Remember',
  evidenceType: 'Read about, was exposed to',
  dwellMeaning: 'Learner can recall facts and definitions about the concept. Cold students always start here. Minimum valid altitude; gap=0 only if targetAltitude is also 1.',
  certExample: 'Recalling that S3 supports versioning (no practical use demonstrated)'
})
CREATE (eLevel1)-[:IS_ALTITUDE]->(eBloomsAltitude)

// Level 2 — Understand
CREATE (eLevel2:TGTType {
  name: 'BloomsLevel2',
  kind: 'class',
  level: 2,
  altitudeName: 'Understand',
  evidenceType: 'Explained in writing, described to others',
  dwellMeaning: 'Learner can explain the concept in their own words. Required altitude for lightweight prep (e.g. travel preparation). Unlocks after Remember is traversed.',
  certExample: 'Describing how S3 lifecycle policies work to a colleague'
})
CREATE (eLevel2)-[:IS_ALTITUDE]->(eBloomsAltitude)

// Level 3 — Apply
CREATE (eLevel3:TGTType {
  name: 'BloomsLevel3',
  kind: 'class',
  level: 3,
  altitudeName: 'Apply',
  evidenceType: 'Used in a project, applied in practice',
  dwellMeaning: 'Learner can use the knowledge in practice. Target altitude for Associate-level certifications. Content floor for warm students who already hold Apply. Unlocks after Understand is traversed.',
  certExample: 'Configured S3 lifecycle rules in a real project (AWS SAA target altitude)'
})
CREATE (eLevel3)-[:IS_ALTITUDE]->(eBloomsAltitude)

// Level 4 — Analyze
CREATE (eLevel4:TGTType {
  name: 'BloomsLevel4',
  kind: 'class',
  level: 4,
  altitudeName: 'Analyze',
  evidenceType: 'Diagnosed a problem using it',
  dwellMeaning: 'Learner can diagnose problems using the knowledge. First of the two professional-tier levels. Required step between Apply and Evaluate; cannot be skipped. Unlocks after Apply is traversed.',
  certExample: 'Diagnosed a cross-region replication misconfiguration in a production incident'
})
CREATE (eLevel4)-[:IS_ALTITUDE]->(eBloomsAltitude)

// Level 5 — Evaluate
CREATE (eLevel5:TGTType {
  name: 'BloomsLevel5',
  kind: 'class',
  level: 5,
  altitudeName: 'Evaluate',
  evidenceType: 'Evaluated options, made architectural decisions using it',
  dwellMeaning: 'Learner can assess options and make architectural judgments. Target altitude for Professional-level certifications. Unlocks after Analyze is traversed. Bill\'s target for AWS SAP on most nodes (gap≈2 from SAA).',
  certExample: 'Chose S3 Intelligent-Tiering over S3 Standard for a cost-sensitive multi-region architecture (AWS SAP target altitude)'
})
CREATE (eLevel5)-[:IS_ALTITUDE]->(eBloomsAltitude)

// Level 6 — Create
CREATE (eLevel6:TGTType {
  name: 'BloomsLevel6',
  kind: 'class',
  level: 6,
  altitudeName: 'Create',
  evidenceType: 'Designed a system built around it',
  dwellMeaning: 'Learner can design new systems or artifacts using the knowledge. Highest possible altitude; unlocks after Evaluate is traversed. Typically the target only for domain expert or research-level goals.',
  certExample: 'Designed a multi-tenant storage abstraction layer built on S3 with custom lifecycle orchestration'
})
CREATE (eLevel6)-[:IS_ALTITUDE]->(eBloomsAltitude)

// ──────────────────────────────────────────────────────────────
// 3. LEARNER ALTITUDE PROFILE INTERFACE
// ──────────────────────────────────────────────────────────────

// Trace: Bloom's Altitude Model — Two Distinct Altitude Values; Altitude Gap
// "altitudeGap = bloomsTargetAltitude − bloomsCurrentAltitude per node"
CREATE (iLearnerAltitudeProfile:TGTType {
  name: 'LearnerAltitudeProfile',
  kind: 'interface',
  description: 'Per-concept altitude profile for a learner. Represents the learner\'s current and target altitude on a single concept node, and the gap of work remaining. altitudeGap = bloomsTargetAltitude − bloomsCurrentAltitude; gap=0 means the node is complete at the required altitude.'
})
CREATE (iLearnerAltitudeProfile)-[:HAS_FIELD]->(:TGTField {name: 'conceptId',              type: 'string', required: true, description: 'Concept node this profile applies to'})
CREATE (iLearnerAltitudeProfile)-[:HAS_FIELD]->(:TGTField {name: 'bloomsCurrentAltitude',  type: 'number', required: true, description: 'Calibrator\'s current estimate of the learner\'s altitude on this node (0 if no evidence)'})
CREATE (iLearnerAltitudeProfile)-[:HAS_FIELD]->(:TGTField {name: 'bloomsTargetAltitude',   type: 'number', required: true, description: 'Target altitude set by the Domain Twin / course offering; learner never sets this directly'})
CREATE (iLearnerAltitudeProfile)-[:HAS_FIELD]->(:TGTField {name: 'altitudeGap',            type: 'number', required: true, description: 'Computed: bloomsTargetAltitude − bloomsCurrentAltitude. This is the unit of work for this node. Gap=0 means skip in path.'})

// ──────────────────────────────────────────────────────────────
// 4. WARM / COLD STUDENT CLASSES
// ──────────────────────────────────────────────────────────────

// Trace: Bloom's Altitude Model — Warm and Cold Students
CREATE (cWarmStudent:TGTType {
  name: 'WarmStudent',
  kind: 'class',
  description: 'A learner with prior evidence on a domain. bloomsCurrentAltitude > 0 on most nodes. Traversal starts at currentAltitude + 1 — levels already demonstrated are not re-served. Example: Bill holds AWS SAA (currentAltitude ≈ 3 across most nodes) pursuing AWS SAP (targetAltitude = 5); most nodes have a gap of 2; system skips levels 1–3 and serves content starting at Analyze.'
})

CREATE (cColdStudent:TGTType {
  name: 'ColdStudent',
  kind: 'class',
  description: 'A learner with no prior evidence on a domain. bloomsCurrentAltitude = 0 across nodes. Full traversal required from level 1 through targetAltitude — maximum effort. Content starts at Remember.'
})

// ──────────────────────────────────────────────────────────────
// 5. BLOOM'S ALTITUDE INVARIANT
// ──────────────────────────────────────────────────────────────

// Trace: Bloom's Altitude Model — "Altitude Is Cumulative — System Invariant"
CREATE (:TGTInvariant {
  name: 'BloomsAltitudeIsCumulative',
  rule: 'All levels 1 through N must be traversed in sequence to reach altitude N. No skipping.',
  scope: 'system-wide'
})
