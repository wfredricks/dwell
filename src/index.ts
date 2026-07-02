/**
 * @dwell/core — Guided Learning Experience capability for the twin constellation.
 *
 * Public API surface:
 *   mountDwell(deps)  — single integration point into udt-foundation
 *   BB, DWELL         — NATS subject constants
 *   DwellBBTool       — Domain Twin registration contract
 *   All event types   — payload interfaces for bb.* and dwell.* events
 *
 * namespace: dwell
 * catalog:   wfredricks/constellation/catalog/capabilities/dwell/manifest.yaml
 * version:   1.0.0  @adopt:dwell-version
 */

export { mountDwell } from './mount.js';
export type { DwellDeps, DwellHandle } from './types.js';

export { BB, DWELL } from './events/index.js';
export type * from './events/index.js';

export type {
  DwellDomainTwinIdentity,
  DwellDomainTwinTools,
  DwellBBTool,
  DwellZipperRegistry,
} from './bbtools/index.js';

// ── Domain Twin Agents ──────────────────────────────────────────────────────
// Instantiated by Domain Twin implementations, NOT by mountDwell().
// See src/agents/domain-twin/ for details.

export { DwellCultivatorDomain } from './agents/domain-twin/cultivator/index.js';
export type {
  DwellCultivatorDomainIdentity,
  DomainChangeEvent,
  DomainDelta,
} from './agents/domain-twin/cultivator/index.js';

export { DwellTester } from './agents/domain-twin/tester/index.js';
export type {
  DwellTesterIdentity,
  AssessmentItem,
  AssessmentBank,
} from './agents/domain-twin/tester/index.js';
