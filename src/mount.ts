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
import { DwellAntiquarian } from './agents/antiquarian/index.js';
import { DwellCalibrator } from './agents/calibrator/index.js';
import { DwellSurveyor } from './agents/surveyor/index.js';
import { DwellGatekeeper } from './agents/gatekeeper/index.js';
import { DwellCultivatorPersonal } from './agents/cultivator-personal/index.js';
import { DwellBridge } from './agents/bridge/index.js';
import { DwellAnswerAgent } from './agents/answer-agent/index.js';

export async function mountDwell(deps: DwellDeps): Promise<DwellHandle> {
  const { bb, zipper, nats, graph } = deps;

  // Subscriptions and registrations accumulate here for clean disposal
  const unsubscribers: Array<() => void> = [];

  // ── Mount agents ────────────────────────────────────────────────────────────

  // Sprint 1A
  const antiquarian = new DwellAntiquarian(deps);
  antiquarian.mount();
  unsubscribers.push(() => antiquarian.dispose());

  const calibrator = new DwellCalibrator(deps);
  calibrator.mount();
  unsubscribers.push(() => calibrator.dispose());

  // Sprint 1B
  const cultivatorPersonal = new DwellCultivatorPersonal(deps);
  cultivatorPersonal.mount();
  unsubscribers.push(() => cultivatorPersonal.dispose());

  // ── Register dwell.* NATS namespace ──────────────────────────────────────
  // Agents are mounted here as they are built (Sprint 1+).
  // Each agent registers its own subscriptions and pushes cleanup to unsubscribers.
  //
  // Sprint 1 agents:
  //   DwellAntiquarian         — snapshots current knowledge state from BB           ✅ Sprint 1A
  //   DwellCalibrator          — computes Bloom's altitude from evidence              ✅ Sprint 1A
  //   DwellCultivatorPersonal  — tracks subject-level growth signals                 ✅ Sprint 1A
  //   DwellSurveyor            — maps knowledge graph topology and gap distance      ✅ Sprint 1B
  //   DwellGatekeeper          — validates readiness before Domain Twin calls        ✅ Sprint 1B
  //
  // Sprint 2 agents:
  //   DwellBridge         — detects plateaus, initiates Domain Twin engagement  ✅ Sprint 2A
  //   DwellAnswerAgent    — evaluates Domain Twin contributions                  ✅ Sprint 2B
  //
  // @adopt:dwell-agent-list  [resolved: see above]

  // ── Sprint 1B: DwellSurveyor ─────────────────────────────────────────────
  const surveyor = new DwellSurveyor(deps);
  surveyor.mount();
  unsubscribers.push(() => surveyor.dispose());

  // ── Sprint 1B: DwellGatekeeper ───────────────────────────────────────────
  const gatekeeper = new DwellGatekeeper(deps);
  gatekeeper.mount();
  unsubscribers.push(() => gatekeeper.dispose());

  // ── Sprint 2A: DwellBridge ───────────────────────────────────────────────
  const bridge = new DwellBridge(deps);
  bridge.mount();
  unsubscribers.push(() => bridge.dispose());

  // ── Sprint 2B: DwellAnswerAgent ───────────────────────────────────────────
  const answerAgent = new DwellAnswerAgent(deps);
  answerAgent.mount();
  unsubscribers.push(() => answerAgent.dispose());

  // Domain Twin agents (DwellCultivatorDomain, DwellTester) are instantiated by
  // Domain Twin implementations — see src/agents/domain-twin/
  // They are NOT mounted here; the Personal Twin does not own Domain Twin agents.

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
      // unsubscribers already called above
    },
  };
}
