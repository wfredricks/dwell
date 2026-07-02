import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DwellGatekeeper } from '../agents/gatekeeper/index.js';
import type { DwellDeps, NatsClient } from '../types.js';
import type {
  DwellBridgeRequested,
  DwellGapsInitial,
  DwellGapsUpdated,
  DwellLearnerPreferencesUpdated,
} from '../events/types.js';
import { BB } from '../events/subjects.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeDeps(overrides?: Partial<DwellDeps>): DwellDeps {
  const nats: NatsClient = {
    publish: vi.fn(),
    subscribe: vi.fn().mockImplementation(() => vi.fn()), // unique unsub fn per call
  };
  return {
    nats,
    graph: {
      query: vi.fn().mockResolvedValue([]),
    },
    bb: {
      read: vi.fn(),
      write: vi.fn(),
      subscribe: vi.fn().mockImplementation(() => vi.fn()),
    },
    zipper: {
      registerTool: vi.fn(),
      unregisterTool: vi.fn(),
    },
    ...overrides,
  };
}

/** GapsInitial payload where all gaps are 'high' priority (too large). */
function highPriorityGaps(): DwellGapsInitial {
  return {
    domain: 'aws',
    clusters: [
      {
        clusterId: 'aws-knowledge-high',
        label: 'aws high-priority knowledge gaps',
        gapType: 'knowledge',
        conceptIds: ['c1', 'c2'],
        priority: 'high',
        examWeight: 0.5,
      },
    ],
    assessedAt: '2026-07-01T00:00:00.000Z',
  };
}

/** GapsInitial payload where gaps are 'medium' priority (ready). */
function mediumPriorityGaps(overrideDomain = 'aws'): DwellGapsInitial {
  return {
    domain: overrideDomain,
    clusters: [
      {
        clusterId: `${overrideDomain}-knowledge-medium`,
        label: `${overrideDomain} medium-priority knowledge gaps`,
        gapType: 'knowledge',
        conceptIds: ['c1', 'c2'],
        priority: 'medium',
        examWeight: 0.5,
      },
    ],
    assessedAt: '2026-07-01T00:00:00.000Z',
  };
}

/** GapsInitial payload with convergent-misconception cluster (always high, blocks readiness). */
function convergentMisconceptionGaps(): DwellGapsInitial {
  return {
    domain: 'aws',
    clusters: [
      {
        clusterId: 'aws-cm-iam',
        label: 'IAM convergent misconceptions',
        gapType: 'convergent-misconception',
        conceptIds: ['c1', 'c2'],
        priority: 'high',
        examWeight: 0.8,
      },
    ],
    assessedAt: '2026-07-01T00:00:00.000Z',
  };
}

/** Get the subscribe handler registered for a given subject pattern. */
function getHandler(deps: DwellDeps, subject: string): ((data: unknown) => void) {
  const calls = (deps.nats.subscribe as ReturnType<typeof vi.fn>).mock.calls as [
    string,
    (data: unknown) => void,
  ][];
  const match = calls.find(([subj]) => subj === subject);
  if (!match) throw new Error(`No subscribe call found for subject: ${subject}`);
  return match[1];
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('DwellGatekeeper', () => {
  describe('lifecycle', () => {
    it('mount() registers three subscriptions', () => {
      const deps = makeDeps();
      const gatekeeper = new DwellGatekeeper(deps);
      gatekeeper.mount();

      expect(deps.nats.subscribe).toHaveBeenCalledWith(
        BB.GAPS_INITIAL_PATTERN,
        expect.any(Function),
      );
      expect(deps.nats.subscribe).toHaveBeenCalledWith(
        BB.GAPS_UPDATED_PATTERN,
        expect.any(Function),
      );
      expect(deps.nats.subscribe).toHaveBeenCalledWith(
        BB.LEARNER_PREFERENCES_UPDATED,
        expect.any(Function),
      );
      expect(deps.nats.subscribe).toHaveBeenCalledTimes(3);
    });

    it('dispose() calls all unsubscribe functions', () => {
      const deps = makeDeps();
      const gatekeeper = new DwellGatekeeper(deps);
      gatekeeper.mount();

      const unsubFns = (deps.nats.subscribe as ReturnType<typeof vi.fn>).mock.results.map(
        (r) => r.value,
      );

      gatekeeper.dispose();

      for (const unsub of unsubFns) {
        expect(unsub).toHaveBeenCalledTimes(1);
      }
    });

    it('dispose() before mount() does not throw', () => {
      const deps = makeDeps();
      const gatekeeper = new DwellGatekeeper(deps);
      expect(() => gatekeeper.dispose()).not.toThrow();
    });
  });

  describe('checkReadiness', () => {
    it('returns false when no gap data exists for domain', () => {
      const deps = makeDeps();
      const gatekeeper = new DwellGatekeeper(deps);
      gatekeeper.mount();

      // No gap events fired — no state for 'aws'
      expect(gatekeeper.checkReadiness('aws', ['c1', 'c2'])).toBe(false);
    });

    it('returns false when gaps are too large (high priority)', () => {
      const deps = makeDeps();
      const gatekeeper = new DwellGatekeeper(deps);
      gatekeeper.mount();

      const gapsHandler = getHandler(deps, BB.GAPS_INITIAL_PATTERN);
      gapsHandler(highPriorityGaps());

      expect(gatekeeper.checkReadiness('aws', ['c1', 'c2'])).toBe(false);
    });

    it('returns false when conceptIds are in convergent-misconception clusters', () => {
      const deps = makeDeps();
      const gatekeeper = new DwellGatekeeper(deps);
      gatekeeper.mount();

      const gapsHandler = getHandler(deps, BB.GAPS_INITIAL_PATTERN);
      gapsHandler(convergentMisconceptionGaps());

      // Convergent-misconception → always high priority → not ready
      expect(gatekeeper.checkReadiness('aws', ['c1'])).toBe(false);
    });

    it('returns true when gaps are medium priority (ready for bridge)', () => {
      const deps = makeDeps();
      const gatekeeper = new DwellGatekeeper(deps);
      gatekeeper.mount();

      const gapsHandler = getHandler(deps, BB.GAPS_INITIAL_PATTERN);
      gapsHandler(mediumPriorityGaps());

      expect(gatekeeper.checkReadiness('aws', ['c1', 'c2'])).toBe(true);
    });

    it('returns true when conceptIds have no gap entry (already mastered)', () => {
      const deps = makeDeps();
      const gatekeeper = new DwellGatekeeper(deps);
      gatekeeper.mount();

      // Domain has gap data (so state is known) but c3 is not in any cluster
      const gapsHandler = getHandler(deps, BB.GAPS_INITIAL_PATTERN);
      gapsHandler(mediumPriorityGaps()); // clusters only contain c1, c2

      // c3 is not in any cluster → mastered → ready
      expect(gatekeeper.checkReadiness('aws', ['c3'])).toBe(true);
    });

    it('returns false if ANY of the requested conceptIds is high priority', () => {
      const deps = makeDeps();
      const gatekeeper = new DwellGatekeeper(deps);
      gatekeeper.mount();

      const mixedGaps: DwellGapsInitial = {
        domain: 'aws',
        clusters: [
          {
            clusterId: 'aws-knowledge-high',
            label: 'high',
            gapType: 'knowledge',
            conceptIds: ['c1'],
            priority: 'high',
            examWeight: 0.5,
          },
          {
            clusterId: 'aws-knowledge-medium',
            label: 'medium',
            gapType: 'knowledge',
            conceptIds: ['c2'],
            priority: 'medium',
            examWeight: 0.5,
          },
        ],
        assessedAt: '2026-07-01T00:00:00.000Z',
      };
      const gapsHandler = getHandler(deps, BB.GAPS_INITIAL_PATTERN);
      gapsHandler(mixedGaps);

      // c1 is high, c2 is medium — asking for both → false because c1 blocks
      expect(gatekeeper.checkReadiness('aws', ['c1', 'c2'])).toBe(false);
      // Only c2 → true
      expect(gatekeeper.checkReadiness('aws', ['c2'])).toBe(true);
    });
  });

  describe('readiness transition → bb.bridge.requested', () => {
    it('emits bb.bridge.requested when domain transitions from not-ready to ready', () => {
      const deps = makeDeps();
      const gatekeeper = new DwellGatekeeper(deps);
      gatekeeper.mount();

      const gapsHandler = getHandler(deps, BB.GAPS_INITIAL_PATTERN);

      // First: high-priority gaps → not ready → no bridge event
      gapsHandler(highPriorityGaps());
      expect(deps.nats.publish).not.toHaveBeenCalled();

      // Then: gaps drop to medium → now ready → bridge requested
      const updatedGaps: DwellGapsUpdated = {
        ...mediumPriorityGaps(),
      };
      const updatedHandler = getHandler(deps, BB.GAPS_UPDATED_PATTERN);
      updatedHandler(updatedGaps);

      expect(deps.nats.publish).toHaveBeenCalledWith(
        BB.BRIDGE_REQUESTED,
        expect.objectContaining({
          domain: 'aws',
          conceptIds: expect.arrayContaining(['c1', 'c2']),
          learnerState: 'plateau',
          requestedAt: expect.any(String),
        }),
      );
    });

    it('does NOT re-emit bridge.requested if domain was already ready', () => {
      const deps = makeDeps();
      const gatekeeper = new DwellGatekeeper(deps);
      gatekeeper.mount();

      const gapsHandler = getHandler(deps, BB.GAPS_INITIAL_PATTERN);
      gapsHandler(mediumPriorityGaps()); // First ready → emits bridge

      const firstCallCount = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(firstCallCount).toBe(1);

      // Another medium-priority update — still ready → no second bridge.requested
      const updatedHandler = getHandler(deps, BB.GAPS_UPDATED_PATTERN);
      updatedHandler({ ...mediumPriorityGaps() } as DwellGapsUpdated);

      const secondCallCount = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(secondCallCount).toBe(1); // unchanged
    });

    it('emits bridge.requested on gaps.initial directly when gaps are medium', () => {
      const deps = makeDeps();
      const gatekeeper = new DwellGatekeeper(deps);
      gatekeeper.mount();

      const gapsHandler = getHandler(deps, BB.GAPS_INITIAL_PATTERN);
      gapsHandler(mediumPriorityGaps());

      const calls = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls as [
        string,
        DwellBridgeRequested,
      ][];
      expect(calls).toHaveLength(1);
      const [subject, event] = calls[0];
      expect(subject).toBe(BB.BRIDGE_REQUESTED);
      expect(event.domain).toBe('aws');
    });
  });

  describe('learner preferences', () => {
    it('stores learner preference updates without throwing', () => {
      const deps = makeDeps();
      const gatekeeper = new DwellGatekeeper(deps);
      gatekeeper.mount();

      const prefsHandler = getHandler(deps, BB.LEARNER_PREFERENCES_UPDATED);
      const pref: DwellLearnerPreferencesUpdated = {
        preferenceType: 'methodology',
        value: 'visual',
        context: 'user-stated',
      };

      expect(() => prefsHandler(pref)).not.toThrow();
    });
  });
});
