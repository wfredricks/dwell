import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DwellSurveyor } from '../agents/surveyor/index.js';
import type { DwellDeps, NatsClient, GraphReader } from '../types.js';
import type {
  DwellGapsInitial,
  DwellGapsUpdated,
  DwellMasteryInitialized,
  DwellMasteryUpdated,
} from '../events/types.js';
import { BB } from '../events/subjects.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeDeps(overrides?: Partial<DwellDeps>): DwellDeps {
  const nats: NatsClient = {
    publish: vi.fn(),
    subscribe: vi.fn().mockImplementation(() => vi.fn()), // returns a unique unsubscribe fn per call
  };
  const graph: GraphReader = {
    query: vi.fn().mockResolvedValue([]),
  };
  return {
    nats,
    graph,
    bb: {
      read: vi.fn(),
      write: vi.fn(),
      subscribe: vi.fn().mockReturnValue(vi.fn()),
    },
    zipper: {
      registerTool: vi.fn(),
      unregisterTool: vi.fn(),
    },
    ...overrides,
  };
}

/** Minimal mastery initialized payload for domain 'aws'. */
function masteryInitializedPayload(): DwellMasteryInitialized {
  return {
    domain: 'aws',
    totalNodes: 3,
    nodes: [
      { conceptId: 'c1', confidence: 0.5, bloomsAltitude: 1, source: 'prior-evidence' },
      { conceptId: 'c2', confidence: 0.3, bloomsAltitude: 2, source: 'partial-credit' },
      { conceptId: 'c3', confidence: 0.8, bloomsAltitude: 5, source: 'prior-evidence' },
    ],
    overallReadiness: 0.5,
    initializedAt: '2026-07-01T00:00:00.000Z',
  };
}

/** KG rows: c1 has gap 3 (high), c2 has gap 2 (medium), c3 has gap 0 (mastered). */
function kgRows() {
  return [
    { conceptId: 'c1', bloomsTargetAltitude: 4, examWeight: 0.4 }, // gap 3 → high
    { conceptId: 'c2', bloomsTargetAltitude: 4, examWeight: 0.3 }, // gap 2 → medium
    { conceptId: 'c3', bloomsTargetAltitude: 5, examWeight: 0.3 }, // gap 0 → mastered
  ];
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('DwellSurveyor', () => {
  describe('lifecycle', () => {
    it('mount() registers subscriptions and dispose() tears them down', () => {
      const deps = makeDeps();
      const surveyor = new DwellSurveyor(deps);

      surveyor.mount();

      // Should have subscribed to mastery.initialized and mastery.updated patterns
      expect(deps.nats.subscribe).toHaveBeenCalledWith(
        BB.MASTERY_INITIALIZED_PATTERN,
        expect.any(Function),
      );
      expect(deps.nats.subscribe).toHaveBeenCalledWith(
        BB.MASTERY_UPDATED_PATTERN,
        expect.any(Function),
      );
      expect(deps.nats.subscribe).toHaveBeenCalledTimes(2);

      // Each subscribe returned a mock unsub fn — get them
      const unsubFns = (deps.nats.subscribe as ReturnType<typeof vi.fn>).mock.results.map(
        (r) => r.value,
      );

      surveyor.dispose();

      // All unsub fns should have been called
      for (const unsub of unsubFns) {
        expect(unsub).toHaveBeenCalledTimes(1);
      }
    });

    it('dispose() before mount() does not throw', () => {
      const deps = makeDeps();
      const surveyor = new DwellSurveyor(deps);
      expect(() => surveyor.dispose()).not.toThrow();
    });
  });

  describe('handleMasteryInitialized (happy path)', () => {
    it('queries the graph and emits bb.gaps.<domain>.initial with correct clusters', async () => {
      const deps = makeDeps();
      (deps.graph.query as ReturnType<typeof vi.fn>).mockResolvedValue(kgRows());

      const surveyor = new DwellSurveyor(deps);
      surveyor.mount();

      // Extract the subscribe handler for mastery.initialized
      const [[, initHandler]] = (
        deps.nats.subscribe as ReturnType<typeof vi.fn>
      ).mock.calls.filter(([subj]: [string]) => subj === BB.MASTERY_INITIALIZED_PATTERN);

      // Call the handler directly with a mastery.initialized payload
      initHandler(masteryInitializedPayload());

      // Give the async handler a tick to resolve
      await vi.waitFor(() => {
        expect(deps.nats.publish).toHaveBeenCalled();
      });

      // Verify the publish call
      const publishCalls = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls;
      const [subject, event] = publishCalls[0] as [string, DwellGapsInitial];

      expect(subject).toBe(BB.GAPS_INITIAL('aws'));

      // c1: gap = 3 → high; c2: gap = 2 → medium; c3: gap = 0 → no cluster
      const clusterIds = event.clusters.map((c) => c.clusterId);
      expect(clusterIds).toContain('aws-knowledge-high');
      expect(clusterIds).toContain('aws-knowledge-medium');
      expect(clusterIds).not.toContain('aws-knowledge-low'); // c3 mastered
      expect(event.domain).toBe('aws');
      expect(event.assessedAt).toBeTruthy();
    });

    it('assigns correct conceptIds to each priority cluster', async () => {
      const deps = makeDeps();
      (deps.graph.query as ReturnType<typeof vi.fn>).mockResolvedValue(kgRows());

      const surveyor = new DwellSurveyor(deps);
      surveyor.mount();

      const [[, initHandler]] = (
        deps.nats.subscribe as ReturnType<typeof vi.fn>
      ).mock.calls.filter(([subj]: [string]) => subj === BB.MASTERY_INITIALIZED_PATTERN);
      initHandler(masteryInitializedPayload());

      await vi.waitFor(() => expect(deps.nats.publish).toHaveBeenCalled());

      const [, event] = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        DwellGapsInitial,
      ];

      const highCluster = event.clusters.find((c) => c.priority === 'high');
      const mediumCluster = event.clusters.find((c) => c.priority === 'medium');

      expect(highCluster?.conceptIds).toEqual(['c1']);
      expect(mediumCluster?.conceptIds).toEqual(['c2']);
    });

    it('emits no clusters when all nodes are mastered', async () => {
      const deps = makeDeps();
      // All targets equal current altitude → no gaps
      (deps.graph.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        { conceptId: 'c1', bloomsTargetAltitude: 1, examWeight: 0.5 },
        { conceptId: 'c2', bloomsTargetAltitude: 2, examWeight: 0.5 },
      ]);

      const surveyor = new DwellSurveyor(deps);
      surveyor.mount();

      const [[, initHandler]] = (
        deps.nats.subscribe as ReturnType<typeof vi.fn>
      ).mock.calls.filter(([subj]: [string]) => subj === BB.MASTERY_INITIALIZED_PATTERN);

      const payload: DwellMasteryInitialized = {
        domain: 'aws',
        totalNodes: 2,
        nodes: [
          { conceptId: 'c1', confidence: 1, bloomsAltitude: 1, source: 'prior-evidence' },
          { conceptId: 'c2', confidence: 1, bloomsAltitude: 2, source: 'prior-evidence' },
        ],
        overallReadiness: 1,
        initializedAt: '2026-07-01T00:00:00.000Z',
      };
      initHandler(payload);

      await vi.waitFor(() => expect(deps.nats.publish).toHaveBeenCalled());

      const [, event] = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        DwellGapsInitial,
      ];
      expect(event.clusters).toHaveLength(0);
    });
  });

  describe('handleMasteryUpdated (happy path)', () => {
    it('emits bb.gaps.<domain>.updated for updated nodes', async () => {
      const deps = makeDeps();
      (deps.graph.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        { conceptId: 'c1', bloomsTargetAltitude: 4, examWeight: 0.6 }, // gap after update: 4-2=2 → medium
      ]);

      const surveyor = new DwellSurveyor(deps);
      surveyor.mount();

      const [[, updateHandler]] = (
        deps.nats.subscribe as ReturnType<typeof vi.fn>
      ).mock.calls.filter(([subj]: [string]) => subj === BB.MASTERY_UPDATED_PATTERN);

      const payload: DwellMasteryUpdated = {
        domain: 'aws',
        updatedNodes: [
          {
            conceptId: 'c1',
            confidencePrevious: 0.4,
            confidenceNew: 0.6,
            bloomsAltitudePrevious: 1,
            bloomsAltitudeNew: 2,
            trigger: 'learning-interaction',
          },
        ],
        updatedAt: '2026-07-01T01:00:00.000Z',
      };
      updateHandler(payload);

      await vi.waitFor(() => expect(deps.nats.publish).toHaveBeenCalled());

      const [subject, event] = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        DwellGapsUpdated,
      ];
      expect(subject).toBe(BB.GAPS_UPDATED('aws'));
      expect(event.domain).toBe('aws');
      expect(event.clusters.some((c) => c.conceptIds.includes('c1'))).toBe(true);
    });
  });
});
