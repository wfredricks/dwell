/**
 * @dwell/core — Guided Learning Experience capability for the twin constellation.
 *
 * Public API surface: mountDwell(deps) is the single integration point.
 * Add one import and one call to udt-foundation's boot-logic.ts to install Dwell.
 * Remove them to uninstall. Zero other changes to foundation required.
 *
 * namespace: dwell
 * catalog:   wfredricks/constellation/catalog/capabilities/dwell/manifest.yaml
 * version:   1.0.0  @adopt:dwell-version
 */

export { mountDwell } from './mount.js';
export type { DwellDeps, DwellHandle } from './types.js';
