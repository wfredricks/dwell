/**
 * delta-builder.ts — Assembles pre-curated DomainDelta packages from detected changes.
 *
 * buildDelta — pure: given changes and version strings, returns a DomainDelta.
 *
 * @namespace dwell
 * @sig d18-cultivator-domain.cypher
 */

import type { DomainChangeEvent, DomainDelta } from './types.js';

/**
 * Assembles a DomainDelta from a list of changes and version strings.
 * Pure — builds the package; does not store or deliver it.
 *
 * Invariants:
 *   - fromVersion and toVersion must differ.
 *   - affectedConcepts must be non-empty (caller responsibility).
 *
 * @sig-node DwellCultivatorDomain.buildDelta
 */
export function buildDelta(
  changes: DomainChangeEvent[],
  fromVersion: string,
  toVersion: string,
): DomainDelta {
  return {
    fromVersion,
    toVersion,
    affectedConcepts: [...changes],
    preparedAt: new Date().toISOString(),
  };
}
