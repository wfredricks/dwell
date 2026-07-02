import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DwellBridge } from '../agents/bridge/index.js';
import { scoreModelFit, selectMentalModel } from '../agents/bridge/mental-model-selector.js';
import { personalize } from '../agents/bridge/personalizer.js';
import type { DwellDeps, NatsClient, Blackboard } from '../types.js';
import type {
  DwellAntiquarianSnapshot,
  DwellBridgeRequested,
  DwellBridgeReady,
  DwellAttentionOutcome,
  DwellIntentDeclared,
} from '../events/types.js';
import type { DwellMentalModel, DwellBridgeCardGeneric } from '../agents/bridge/types.js';
import { BB } from '../events/subjects.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeDeps(overrides?: Partial<DwellDeps>): DwellDeps {
  const nats: NatsClient = {
    publish: vi.fn(),
    subscribe: vi.fn().mockImplementation(() => vi.fn()),
  };
  const bb: Blackboard = {
    read:      vi.fn(),
    write:     vi.fn(),
    subscribe: vi.fn().mockImplementation(() => vi.fn()),
  };
  return {
    nats,
    bb,
    graph: {
      query: vi.fn().mockResolvedValue([]),
    },
    zipper: {
      registerTool:   vi.fn(),
      unregisterTool: vi.fn(),
    },
    ...overrides,
  };
}

function makeSnapshot(overrides?: Partial<DwellAntiquarianSnapshot>): DwellAntiquarianSnapshot {
  return {
    domain:    'aws',
    nodes: [
      {
        conceptId:       'iam-policies',
        signalStrength:  'strong',
        evidenceSources: ['Peach Bottom EOP hierarchy', 'nuclear-safety-ops'],
      },
      {
        conceptId:       'iam-roles',
        signalStrength:  'strong',
        evidenceSources: ['Peach Bottom EOP hierarchy'],
      },
      {
        conceptId:       'vpc-routing',
        signalStrength:  'weak',
        evidenceSources: ['academic textbook: networking'],
      },
    ],
    updatedAt: '2026-07-02T12:00:00.000Z',
    ...overrides,
  };
}

function makeBridgeRequested(overrides?: Partial<DwellBridgeRequested>): DwellBridgeRequested {
  return {
    domain:      'aws',
    conceptIds:  ['iam-policies', 'iam-roles'],
    learnerState: 'plateau',
    calibratorSignal: {
      confidenceCurrent: 0.45,
      visitsCount:       5,
      plateauDuration:   '20min',
    },
    requestedAt: '2026-07-02T12:00:00.000Z',
    ...overrides,
  };
}

/** Get the subscribe handler registered for a given subject. */
function getHandler(deps: DwellDeps, subject: string): ((data: unknown) => void) {
  const calls = (deps.nats.subscribe as ReturnType<typeof vi.fn>).mock.calls as [
    string,
    (data: unknown) => void,
  ][];
  const match = calls.find(([subj]) => subj === subject);
  if (!match) throw new Error(`No subscribe call found for subject: ${subject}`);
  return match[1];
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

describe('DwellBridge', () => {
  describe('lifecycle', () => {
    it('mount() registers three subscriptions (bridge-requested, attention-outcome, intent-declared)', () => {
      const deps = makeDeps();
      const bridge = new DwellBridge(deps);
      bridge.mount();

      expect(deps.nats.subscribe).toHaveBeenCalledWith(BB.BRIDGE_REQUESTED, expect.any(Function));
      expect(deps.nats.subscribe).toHaveBeenCalledWith(BB.ATTENTION_OUTCOME, expect.any(Function));
      expect(deps.nats.subscribe).toHaveBeenCalledWith(BB.INTENT_DECLARED, expect.any(Function));
      expect(deps.nats.subscribe).toHaveBeenCalledTimes(3);
    });

    it('dispose() calls all unsubscribe functions', () => {
      const deps = makeDeps();
      const bridge = new DwellBridge(deps);
      bridge.mount();

      const unsubFns = (deps.nats.subscribe as ReturnType<typeof vi.fn>).mock.results.map(
        (r) => r.value,
      );

      bridge.dispose();

      for (const fn of unsubFns) {
        expect(fn).toHaveBeenCalledTimes(1);
      }
    });

    it('dispose() before mount() does not throw', () => {
      const deps = makeDeps();
      const bridge = new DwellBridge(deps);
      expect(() => bridge.dispose()).not.toThrow();
    });
  });

  // ── Bridge requested — happy path ─────────────────────────────────────────

  describe('handleBridgeRequested — happy path', () => {
    it('emits BB.BRIDGE_READY when bridge requested with valid snapshot', async () => {
      const snapshot = makeSnapshot();
      const deps = makeDeps({
        bb: {
          read:  vi.fn().mockResolvedValue(snapshot),
          write: vi.fn(),
          subscribe: vi.fn().mockImplementation(() => vi.fn()),
        },
      });
      const bridge = new DwellBridge(deps);
      bridge.mount();

      const handler = getHandler(deps, BB.BRIDGE_REQUESTED);
      await handler(makeBridgeRequested());

      expect(deps.nats.publish).toHaveBeenCalledWith(
        BB.BRIDGE_READY,
        expect.objectContaining({
          domain:      'aws',
          conceptIds:  ['iam-policies', 'iam-roles'],
          bridgeType:  expect.any(String),
          card:        expect.objectContaining({ body: expect.any(String) }),
          readyAt:     expect.any(String),
        }),
      );
    });

    it('uses personalizer output (personalizedText) in BB.BRIDGE_READY card body', async () => {
      const snapshot = makeSnapshot();
      const deps = makeDeps({
        bb: {
          read:  vi.fn().mockResolvedValue(snapshot),
          write: vi.fn(),
          subscribe: vi.fn().mockImplementation(() => vi.fn()),
        },
      });
      const bridge = new DwellBridge(deps);
      bridge.mount();

      const handler = getHandler(deps, BB.BRIDGE_REQUESTED);
      await handler(makeBridgeRequested());

      const publishCalls = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls as [
        string,
        DwellBridgeReady,
      ][];
      const [, bridgeReady] = publishCalls[0];

      // The personalized card body should reference the mental model name
      expect(bridgeReady.card.body).toContain('Peach Bottom EOP hierarchy');
    });

    it('emits origin "personal-twin-synthesized" when a mental model is found', async () => {
      const snapshot = makeSnapshot();
      const deps = makeDeps({
        bb: {
          read:  vi.fn().mockResolvedValue(snapshot),
          write: vi.fn(),
          subscribe: vi.fn().mockImplementation(() => vi.fn()),
        },
      });
      const bridge = new DwellBridge(deps);
      bridge.mount();

      const handler = getHandler(deps, BB.BRIDGE_REQUESTED);
      await handler(makeBridgeRequested());

      const publishCalls = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls as [
        string,
        DwellBridgeReady,
      ][];
      expect(publishCalls[0][1].card.origin).toBe('personal-twin-synthesized');
    });
  });

  // ── BridgeReadsSnapshotNotAntiquarian invariant ───────────────────────────

  describe('BridgeReadsSnapshotNotAntiquarian invariant', () => {
    it('does NOT call graph.query (Antiquarian territory) when handling bridge request', async () => {
      const snapshot = makeSnapshot();
      const graphQuery = vi.fn().mockResolvedValue([]);
      const deps = makeDeps({
        bb: {
          read:  vi.fn().mockResolvedValue(snapshot),
          write: vi.fn(),
          subscribe: vi.fn().mockImplementation(() => vi.fn()),
        },
        graph: { query: graphQuery },
      });
      const bridge = new DwellBridge(deps);
      bridge.mount();

      const handler = getHandler(deps, BB.BRIDGE_REQUESTED);
      await handler(makeBridgeRequested());

      // Bridge must never query the graph (Antiquarian's exclusive territory)
      expect(graphQuery).not.toHaveBeenCalled();
    });

    it('reads snapshot from BB (not from a direct Antiquarian call)', async () => {
      const snapshot = makeSnapshot();
      const bbRead = vi.fn().mockResolvedValue(snapshot);
      const deps = makeDeps({
        bb: {
          read:  bbRead,
          write: vi.fn(),
          subscribe: vi.fn().mockImplementation(() => vi.fn()),
        },
      });
      const bridge = new DwellBridge(deps);
      bridge.mount();

      const handler = getHandler(deps, BB.BRIDGE_REQUESTED);
      await handler(makeBridgeRequested());

      expect(bbRead).toHaveBeenCalledWith('dwell.antiquarian.snapshot');
    });
  });

  // ── Missing snapshot ──────────────────────────────────────────────────────

  describe('missing AntiquarianSnapshot', () => {
    it('does NOT throw when snapshot is absent (bb.read returns null)', async () => {
      const deps = makeDeps({
        bb: {
          read:  vi.fn().mockResolvedValue(null),
          write: vi.fn(),
          subscribe: vi.fn().mockImplementation(() => vi.fn()),
        },
      });
      const bridge = new DwellBridge(deps);
      bridge.mount();

      const handler = getHandler(deps, BB.BRIDGE_REQUESTED);
      await expect(handler(makeBridgeRequested())).resolves.not.toThrow();
    });

    it('does NOT emit BB.BRIDGE_READY when snapshot is absent', async () => {
      const deps = makeDeps({
        bb: {
          read:  vi.fn().mockResolvedValue(undefined),
          write: vi.fn(),
          subscribe: vi.fn().mockImplementation(() => vi.fn()),
        },
      });
      const bridge = new DwellBridge(deps);
      bridge.mount();

      const handler = getHandler(deps, BB.BRIDGE_REQUESTED);
      await handler(makeBridgeRequested());

      expect(deps.nats.publish).not.toHaveBeenCalledWith(BB.BRIDGE_READY, expect.anything());
    });
  });

  // ── Attention outcome — dismiss routing ───────────────────────────────────

  describe('handleAttentionOutcome', () => {
    it('handles dismissed bridge card without throwing', async () => {
      const snapshot = makeSnapshot();
      const deps = makeDeps({
        bb: {
          read:  vi.fn().mockResolvedValue(snapshot),
          write: vi.fn(),
          subscribe: vi.fn().mockImplementation(() => vi.fn()),
        },
      });
      const bridge = new DwellBridge(deps);
      bridge.mount();

      const handler = getHandler(deps, BB.ATTENTION_OUTCOME);
      const outcome: DwellAttentionOutcome = {
        itemId:      'bridge-001',
        itemType:    'bridge-card',
        response:    'dismissed',
        noteAdded:   null,
        respondedAt: '2026-07-02T12:00:00.000Z',
      };
      await expect(handler(outcome)).resolves.not.toThrow();
    });
  });

  // ── Intent declared — reset state ─────────────────────────────────────────

  describe('handleIntentDeclared', () => {
    it('handles intent declared without throwing', async () => {
      const deps = makeDeps();
      const bridge = new DwellBridge(deps);
      bridge.mount();

      const handler = getHandler(deps, BB.INTENT_DECLARED);
      const intent: DwellIntentDeclared = {
        intent:      'aws',
        declaredAt:  '2026-07-02T12:00:00.000Z',
      };
      await expect(handler(intent)).resolves.not.toThrow();
    });

    it('resets bridge state on intent declared (bridge after reset still works)', async () => {
      const snapshot = makeSnapshot();
      const bbRead = vi.fn().mockResolvedValue(snapshot);
      const deps = makeDeps({
        bb: {
          read:  bbRead,
          write: vi.fn(),
          subscribe: vi.fn().mockImplementation(() => vi.fn()),
        },
      });
      const bridge = new DwellBridge(deps);
      bridge.mount();

      // Fire intent declared
      const intentHandler = getHandler(deps, BB.INTENT_DECLARED);
      await intentHandler({ intent: 'aws', declaredAt: new Date().toISOString() } as DwellIntentDeclared);

      // Bridge still works after reset
      const bridgeHandler = getHandler(deps, BB.BRIDGE_REQUESTED);
      await bridgeHandler(makeBridgeRequested());

      expect(deps.nats.publish).toHaveBeenCalledWith(BB.BRIDGE_READY, expect.objectContaining({ domain: 'aws' }));
    });
  });
});

// ── scoreModelFit ──────────────────────────────────────────────────────────

describe('scoreModelFit', () => {
  it('operational model with strength > 0.80 scores higher than same-strength academic model', () => {
    const operational: DwellMentalModel = {
      id: 'op1', name: 'Plant EOP ops', domain: 'aws',
      modelType: 'operational', strength: 0.90, conceptIds: [],
    };
    const academic: DwellMentalModel = {
      id: 'ac1', name: 'academic textbook', domain: 'aws',
      modelType: 'academic', strength: 0.90, conceptIds: [],
    };

    expect(scoreModelFit(operational, 'analogy')).toBeGreaterThan(scoreModelFit(academic, 'analogy'));
  });

  it('returns value in [0, 1] range for operational model', () => {
    const model: DwellMentalModel = {
      id: 'op1', name: 'ops', domain: 'aws',
      modelType: 'operational', strength: 0.95, conceptIds: [],
    };
    const score = scoreModelFit(model, 'analogy');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('academic model with high strength still scores lower than operational', () => {
    const operational: DwellMentalModel = {
      id: 'op1', name: 'ops', domain: 'aws',
      modelType: 'operational', strength: 0.85, conceptIds: [],
    };
    const academic: DwellMentalModel = {
      id: 'ac1', name: 'textbook', domain: 'aws',
      modelType: 'academic', strength: 0.85, conceptIds: [],
    };
    expect(scoreModelFit(operational, 'analogy')).toBeGreaterThan(scoreModelFit(academic, 'analogy'));
  });

  it('embodied model scores as well as operational when strength > threshold', () => {
    const embodied: DwellMentalModel = {
      id: 'em1', name: 'simulation lab', domain: 'aws',
      modelType: 'embodied', strength: 0.90, conceptIds: [],
    };
    const operational: DwellMentalModel = {
      id: 'op1', name: 'plant ops', domain: 'aws',
      modelType: 'operational', strength: 0.90, conceptIds: [],
    };
    // Both get the boost — scores should be equal or very close
    expect(Math.abs(scoreModelFit(embodied, 'analogy') - scoreModelFit(operational, 'analogy'))).toBeLessThan(0.01);
  });
});

// ── selectMentalModel ──────────────────────────────────────────────────────

describe('selectMentalModel', () => {
  it('returns null when snapshot has no nodes', () => {
    const snapshot: DwellAntiquarianSnapshot = {
      domain: 'aws', nodes: [], updatedAt: '2026-07-02T00:00:00.000Z',
    };
    expect(selectMentalModel(snapshot, 'analogy', 'bridge')).toBeNull();
  });

  it('returns null when no node has evidenceSources', () => {
    const snapshot: DwellAntiquarianSnapshot = {
      domain: 'aws',
      nodes: [
        { conceptId: 'c1', signalStrength: 'strong', evidenceSources: [] },
      ],
      updatedAt: '2026-07-02T00:00:00.000Z',
    };
    expect(selectMentalModel(snapshot, 'analogy', 'bridge')).toBeNull();
  });

  it('returns the strongest operational model', () => {
    const snapshot = makeSnapshot(); // has 'Peach Bottom EOP hierarchy' (strong) and academic textbook (weak)
    const model = selectMentalModel(snapshot, 'analogy', 'bridge');
    expect(model).not.toBeNull();
    expect(model!.modelType).toBe('operational');
  });

  it('for convergent-misconception gap: excludes academic models', () => {
    const snapshot: DwellAntiquarianSnapshot = {
      domain: 'aws',
      nodes: [
        {
          conceptId: 'c1',
          signalStrength: 'strong',
          evidenceSources: ['academic textbook: networking'],
        },
        {
          conceptId: 'c2',
          signalStrength: 'strong',
          evidenceSources: ['Plant EOP hierarchy'],
        },
      ],
      updatedAt: '2026-07-02T00:00:00.000Z',
    };

    const model = selectMentalModel(snapshot, 'analogy', 'convergent-misconception');
    expect(model).not.toBeNull();
    expect(model!.modelType).not.toBe('academic');
    expect(model!.name).toBe('Plant EOP hierarchy');
  });

  it('for convergent-misconception gap: returns null when only academic models exist', () => {
    const snapshot: DwellAntiquarianSnapshot = {
      domain: 'aws',
      nodes: [
        {
          conceptId: 'c1',
          signalStrength: 'strong',
          evidenceSources: ['academic textbook: networking'],
        },
      ],
      updatedAt: '2026-07-02T00:00:00.000Z',
    };

    expect(selectMentalModel(snapshot, 'analogy', 'convergent-misconception')).toBeNull();
  });

  it('returns null when all models are below minimum viable strength', () => {
    const snapshot: DwellAntiquarianSnapshot = {
      domain: 'aws',
      nodes: [
        // none = 0.00, below MIN_VIABLE_STRENGTH (0.20)
        { conceptId: 'c1', signalStrength: 'none', evidenceSources: ['some source'] },
      ],
      updatedAt: '2026-07-02T00:00:00.000Z',
    };
    expect(selectMentalModel(snapshot, 'analogy', 'bridge')).toBeNull();
  });
});

// ── personalize ────────────────────────────────────────────────────────────

describe('personalize', () => {
  it('populates personalizedText with model name reference', () => {
    const generic: DwellBridgeCardGeneric = {
      bridgeId:          'bridge-001',
      bridgeType:        'analogy',
      sourceAnchor:      'aws',
      targetConceptIds:  ['iam-policies'],
      genericText:       'IAM policies control access through allow/deny rules.',
      effectivenessScore: 0.7,
    };
    const model: DwellMentalModel = {
      id: 'Peach Bottom EOP hierarchy', name: 'Peach Bottom EOP hierarchy',
      domain: 'aws', modelType: 'operational', strength: 0.90, conceptIds: ['iam-policies'],
    };
    const snapshot = makeSnapshot();

    const result = personalize(generic, model, snapshot);
    expect(result.personalizedText).toContain('Peach Bottom EOP hierarchy');
    expect(result.personalizedText).not.toBe('');
  });

  it('sets mentalModelId to model.id', () => {
    const generic: DwellBridgeCardGeneric = {
      bridgeId:          'bridge-001',
      bridgeType:        'analogy',
      sourceAnchor:      'aws',
      targetConceptIds:  ['iam-policies'],
      genericText:       'IAM policies control access through allow/deny rules.',
      effectivenessScore: 0.7,
    };
    const model: DwellMentalModel = {
      id: 'nuclear-ops-model', name: 'Nuclear ops',
      domain: 'aws', modelType: 'operational', strength: 0.90, conceptIds: [],
    };
    const snapshot = makeSnapshot();

    const result = personalize(generic, model, snapshot);
    expect(result.mentalModelId).toBe('nuclear-ops-model');
  });

  it('preserves all generic card fields in the output', () => {
    const generic: DwellBridgeCardGeneric = {
      bridgeId:          'bridge-999',
      bridgeType:        'contrast',
      sourceAnchor:      'nuclear-safety',
      targetConceptIds:  ['c1', 'c2'],
      genericText:       'Generic explanation.',
      effectivenessScore: 0.8,
    };
    const model: DwellMentalModel = {
      id: 'field-experience', name: 'Field experience',
      domain: 'nuclear', modelType: 'experiential', strength: 0.75, conceptIds: [],
    };
    const snapshot = makeSnapshot();

    const result = personalize(generic, model, snapshot);
    expect(result.bridgeId).toBe('bridge-999');
    expect(result.bridgeType).toBe('contrast');
    expect(result.sourceAnchor).toBe('nuclear-safety');
    expect(result.targetConceptIds).toEqual(['c1', 'c2']);
    expect(result.genericText).toBe('Generic explanation.');
    expect(result.effectivenessScore).toBe(0.8);
  });
});
