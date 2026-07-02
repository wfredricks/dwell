# Dwell

Guided Learning Experience capability for the twin constellation.

Dwell turns a personal twin into a learning companion. It tracks where the subject is
in any topic they are working through, connects them with expert knowledge when ready,
and detects when they have hit a plateau — then helps them move past it.

## Integration

Dwell is a single-call integration into `udt-foundation`. Add two lines to `boot-logic.ts`:

```ts
import { mountDwell } from '@dwell/core'

// inside boot, after foundation is initialized:
const dwell = await mountDwell({ bb, zipper, nats, graph })
```

To remove Dwell: call `await dwell.dispose()` and delete those two lines. No other
changes to the foundation are required.

## Namespace

Everything Dwell owns is stamped with the `dwell` namespace:

| Kind | Prefix | Example |
|------|--------|---------|
| NATS subjects | `dwell.*` | `dwell.mounted`, `dwell.plateau.detected` |
| TypeScript types | `Dwell*` | `DwellAntiquarian`, `DwellBridge` |
| Environment variables | `DWELL_*` | `DWELL_PLATEAU_THRESHOLD` |
| Data stores | `dwell-*` | `dwell-bloom-state` |

## Capability Catalog

Dwell is published in the [Constellation Capability Catalog](https://github.com/wfredricks/constellation/tree/main/catalog/capabilities/dwell).
It is provisioned into a twin through a consent flow managed by Donna — not at build time.

## Agents

| Agent | Sprint | Purpose |
|-------|--------|---------|
| `DwellAntiquarian` | 1 | Snapshots current knowledge state from the Blackboard |
| `DwellCalibrator` | 1 | Computes Bloom's altitude from evidence |
| `DwellSurveyor` | 1 | Maps knowledge graph topology and gap distance |
| `DwellGatekeeper` | 1 | Validates readiness before Domain Twin calls |
| `DwellCultivatorPersonal` | 1 | Tracks subject-level growth signals |
| `DwellBridge` | 2 | Detects plateaus; initiates Domain Twin engagement |
| `DwellAnswerAgent` | 2 | Evaluates Domain Twin contributions |

## Development

```bash
npm install
npm run build
npm test
```

## SIG

The full Solution Intelligence Graph for Dwell lives in
[`wfredricks/constellation`](https://github.com/wfredricks/constellation) — see
the `dwell/` capability folder.
