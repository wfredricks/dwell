# Dwell Coding Standards

Standards for all Sprint 1+ agent implementations. Read this before writing a line.

---

## The Cardinal Rule: Namespace Everything

Every symbol you create must carry the `dwell` namespace:

| Kind | Prefix | Example |
|------|--------|---------|
| TypeScript class | `Dwell` | `DwellAntiquarian` |
| TypeScript interface | `Dwell` | `DwellAntiquarianConfig` |
| NATS subjects | `dwell.*` or `bb.dwell.*` | Use constants from `BB` and `DWELL` in `src/events/subjects.ts` |
| Environment variables | `DWELL_` | `DWELL_PLATEAU_THRESHOLD` |
| Data store names | `dwell-` | `dwell-bloom-state` |
| Config keys | `dwell.` | `dwell.calibrator.confidenceDecay` |

**Never** invent a new NATS subject string inline. Always use the constants in `src/events/subjects.ts`.
If a subject you need is missing, add it there first — then use the constant.

---

## Agent Structure

Every agent is a class with this shape:

```ts
/**
 * DwellAntiquarian — [one sentence purpose]
 *
 * Emits:   bb.learner.<domain>.baseline
 * Consumes: bb.intent.declared, bb.cert.<domain>.achieved
 *
 * @namespace dwell
 * @sig d07-antiquarian.cypher
 */
export class DwellAntiquarian {
  private readonly unsubscribers: Array<() => void> = [];

  constructor(private readonly deps: DwellDeps) {}

  /** Register all NATS subscriptions. Called by mountDwell(). */
  mount(): void { ... }

  /** Tear down all subscriptions. Called by DwellHandle.dispose(). */
  dispose(): void {
    for (const unsub of [...this.unsubscribers].reverse()) unsub();
  }
}
```

Rules:
- Constructor takes `DwellDeps` only. No other constructor arguments.
- `mount()` registers subscriptions. `dispose()` tears them down.
- Push every unsubscribe function to `this.unsubscribers`.
- Agents never call each other directly — they communicate through the BB.
- Agents never touch `dwell.*` subjects — that is the Zipper's exclusive domain.

---

## Event Payload Types

- **Always** use types from `src/events/types.ts`. Never inline a payload shape.
- If a payload interface is missing, add it to `types.ts` first.
- All payload types are prefixed `Dwell`. If you find one that isn't, rename it.

```ts
// ✅ Correct
import type { DwellIntentDeclared } from '../events/types.js';

// ❌ Wrong — never inline payload shapes
const payload = { intent: string, declaredAt: string };
```

---

## SIG Traceability

Every agent must cite its SIG pregame file in its JSDoc:

```ts
/**
 * @sig d08-calibrator.cypher
 */
```

Every method that maps to a SIG `[:HANDLES]` edge must cite the node id:

```ts
/**
 * Handle a mastery update trigger.
 * @sig-node DwellCalibrator.updateMastery
 */
private async updateMastery(event: DwellMasteryUpdated): Promise<void> { ... }
```

---

## Error Handling

Agents must never throw into the NATS subscription handler. Catch and log:

```ts
const unsub = deps.nats.subscribe(BB.INTENT_DECLARED, async (data) => {
  try {
    await this.handleIntentDeclared(data as DwellIntentDeclared);
  } catch (err) {
    // TODO: emit bb.dwell.agent.error when error event type is defined
    console.error('[DwellAntiquarian] handleIntentDeclared failed:', err);
  }
});
this.unsubscribers.push(unsub);
```

---

## @adopt: Markers

Mark every seam — any value a future adopter would need to change:

```ts
const PLATEAU_THRESHOLD = 3; // @adopt:dwell-plateau-threshold  [resolved: 3]
const CONFIDENCE_DECAY = 0.05; // @adopt:dwell-confidence-decay  [resolved: 0.05]
```

Thresholds, timeouts, store names, subject patterns — all seams. Mark them.

---

## Testing

- Framework: Vitest (`npm test`)
- Test files: `src/__tests__/<AgentName>.test.ts`
- Coverage threshold: 85% statements, branches, functions, lines
- Every agent needs at minimum: mount/dispose lifecycle test, one happy-path event handler test

```ts
describe('DwellAntiquarian', () => {
  it('mounts and disposes cleanly', () => { ... });
  it('emits bb.learner.<domain>.baseline on intent declared', async () => { ... });
});
```

---

## File Layout

```
src/
  agents/
    antiquarian/
      index.ts          ← DwellAntiquarian class
      __tests__/
        antiquarian.test.ts
    calibrator/
      index.ts
      __tests__/
        calibrator.test.ts
    ...
  events/
    subjects.ts         ← NATS subject constants (DO NOT duplicate)
    types.ts            ← payload interfaces (DO NOT duplicate)
    index.ts
  bbtools/
    contract.ts         ← DwellBBTool interface
    index.ts
  mount.ts              ← mountDwell() — wires everything together
  types.ts              ← DwellDeps, DwellHandle
  index.ts              ← public API barrel
```

---

## What Sprint 0 Provides (Do Not Rebuild)

Sprint 0 has already delivered:
- `src/events/subjects.ts` — all NATS subject constants (`BB`, `DWELL`)
- `src/events/types.ts` — all payload interfaces (`DwellIntentDeclared`, etc.)
- `src/bbtools/contract.ts` — `DwellBBTool`, `DwellZipperRegistry` interfaces
- `src/mount.ts` — `mountDwell()` stub; add your agent to it
- `src/types.ts` — `DwellDeps`, `DwellHandle`

Import from these. Do not redefine what is already defined.
