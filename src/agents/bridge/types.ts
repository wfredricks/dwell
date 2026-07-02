/**
 * Bridge type definitions.
 *
 * BridgeCardGeneric — the generic bridge card as delivered from the Domain Twin Librarian.
 * BridgeCardPersonalized — the learner-specific variant produced by DwellBridge.
 * DwellMentalModel — a mental model anchor derived from the learner's AntiquarianSnapshot.
 *
 * @namespace dwell
 * @sig d11-bridge.cypher
 */

// ── BridgeCardGeneric ─────────────────────────────────────────────────────

/**
 * A generic bridge card delivered from the Domain Twin Librarian.
 * Describes how to connect a source anchor concept to target concepts.
 * Immutable after creation.
 *
 * Invariants: bridgeId always UUID; genericText never empty; effectivenessScore in [0.0, 1.0]
 *
 * @sig-node BridgeCardGeneric
 */
export interface DwellBridgeCardGeneric {
  /** Unique bridge card identifier (UUID) */
  bridgeId: string;
  /** Bridge pattern type (analogy, contrast, structural-similarity, etc.) */
  bridgeType: string;
  /** The conceptual anchor domain this bridge builds from */
  sourceAnchor: string;
  /** Concept node IDs this bridge is connecting the learner toward */
  targetConceptIds: string[];
  /** The unlocalized bridge explanation text from the Domain Twin */
  genericText: string;
  /** Domain Twin Librarian effectiveness score 0.0–1.0 */
  effectivenessScore: number;
}

// ── BridgeCardPersonalized ────────────────────────────────────────────────

/**
 * A personalized bridge card. Extends BridgeCardGeneric with learner-specific text
 * anchored in the learner's own mental model. Produced by DwellBridge.personalize().
 * Immutable after creation.
 *
 * Invariants: personalizedText never empty; anchorReference identifies the specific learner
 *   experience used; inherits all BridgeCardGeneric invariants.
 *
 * @sig-node BridgeCardPersonalized
 */
export interface DwellBridgeCardPersonalized extends DwellBridgeCardGeneric {
  /** Learner-specific bridge explanation anchored in their mental model */
  personalizedText: string;
  /** Human-readable reference to the learner experience used as anchor (e.g. "Peach Bottom EOP hierarchy") */
  anchorReference: string;
  /** ID of the MentalModel from AntiquarianSnapshot that was selected as the anchor */
  mentalModelId: string;
}

// ── DwellMentalModel ──────────────────────────────────────────────────────

/** Type classification of a learner's mental model. Operational/embodied are preferred anchors. */
export type DwellMentalModelType = 'operational' | 'embodied' | 'academic' | 'experiential';

/**
 * A mental model derived from the learner's AntiquarianSnapshot evidence sources.
 * Represents a domain/context the learner has prior experience with — used as
 * an anchor for personalizing bridge cards.
 *
 * @namespace dwell
 */
export interface DwellMentalModel {
  /** Unique identifier — typically the evidence source string */
  id: string;
  /** Human-readable name (e.g. "Peach Bottom EOP hierarchy") */
  name: string;
  /** Domain this mental model comes from */
  domain: string;
  /** Classification — operational and embodied are preferred over academic */
  modelType: DwellMentalModelType;
  /** 0.0–1.0 strength score derived from node signal strengths */
  strength: number;
  /** Concept IDs where this source appears in the snapshot */
  conceptIds: string[];
}
