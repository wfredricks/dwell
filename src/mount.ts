/**
 * mountDwell — the single integration point between udt-foundation and Dwell.
 *
 * Called once from boot-logic.ts. Registers all Dwell agents, event schemas,
 * and NATS subscriptions. Returns a handle with dispose() for clean teardown.
 *
 * To add Dwell to the twin:
 *   import { mountDwell } from '@dwell/core'
 *   const dwell = await mountDwell({ bb, zipper, nats, graph })
 *
 * To remove Dwell from the twin:
 *   await dwell.dispose()
 *   // and delete the two lines above from boot-logic.ts
 *
 * @namespace dwell
 * @adopt:dwell-version  [resolved: 1.0.0]
 */

import type { DwellDeps, DwellHandle } from './types.js';

export async function mountDwell(deps: DwellDeps): Promise<DwellHandle> {
  const { bb, zipper, nats, graph } = deps;

  // Subscriptions and registrations accumulate here for clean disposal
  const unsubscribers: Array<() => void> = [];

  // ── Register dwell.* NATS namespace ──────────────────────────────────────
  // Agents are mounted here as they are built (Sprint 1+).
  // Each agent registers its own subscriptions and pushes cleanup to unsubscribers.
  //
  // Sprint 1 agents (stubs — to be implemented):
  //   DwellAntiquarian    — snapshots current knowledge state from BB
  //   DwellCalibrator     — computes Bloom's altitude from evidence
  //   DwellSurveyor       — maps knowledge graph topology and gap distance
  //   DwellGatekeeper     — validates readiness before Domain Twin calls
  //   DwellCultivatorPersonal — tracks subject-level growth signals
  //
  // Sprint 2 agents (stubs — to be implemented):
  //   DwellBridge         — detects plateaus, initiates Domain Twin engagement
  //   DwellAnswerAgent    — evaluates Domain Twin contributions
  //
  // @adopt:dwell-agent-list  [resolved: see above]

  // Placeholder: announce that Dwell is mounted
  nats.publish('dwell.mounted', {
    version: '1.0.0',   // @adopt:dwell-version  [resolved: 1.0.0]
    timestamp: new Date().toISOString(),
  });

  return {
    async dispose() {
      // Tear down all subscriptions in reverse order
      for (const unsub of [...unsubscribers].reverse()) {
        unsub();
      }
      nats.publish('dwell.unmounted', { timestamp: new Date().toISOString() });
    },
  };
}
