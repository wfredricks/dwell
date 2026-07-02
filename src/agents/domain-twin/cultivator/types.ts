/**
 * DwellCultivatorDomain internal types.
 *
 * DomainChangeEvent — a single detected change to the domain knowledge graph.
 * DomainDelta       — pre-curated package of changes between two graph versions.
 *
 * @namespace dwell
 * @sig d18-cultivator-domain.cypher
 */

/** Nature of a change to the domain knowledge graph. */
export type DomainChangeType = 'added' | 'deprecated' | 'modified' | 'reweighted';

/** Impact severity of a detected change. */
export type DomainChangeSeverity = 'minor' | 'major';

/**
 * A single detected change to the domain knowledge graph.
 * Produced by detectChanges() in change-watcher.ts.
 */
export interface DomainChangeEvent {
  /** Nature of the change */
  changeType: DomainChangeType;
  /** Affected concept node */
  conceptId: string;
  /** Impact severity */
  severity: DomainChangeSeverity;
  /** Human-readable description of what changed */
  changeNote: string;
  /** ISO8601 — when the change was detected */
  detectedAt: string;
}

/**
 * Pre-curated package of changes between two graph versions.
 * Built proactively on change detection; delivered on request. Immutable.
 *
 * Invariant: fromVersion always less than toVersion; affectedConcepts never empty.
 */
export interface DomainDelta {
  /** Graph version this delta applies from */
  fromVersion: string;
  /** Graph version this delta brings the receiver to */
  toVersion: string;
  /** All changes in this delta */
  affectedConcepts: DomainChangeEvent[];
  /** ISO8601 — when this delta was pre-curated */
  preparedAt: string;
}
