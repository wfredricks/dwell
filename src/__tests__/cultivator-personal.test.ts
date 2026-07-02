/**
 * Tests for DwellCultivatorPersonal
 *
 * @namespace dwell
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DwellCultivatorPersonal } from '../agents/cultivator-personal/index.js';
import type { DwellDeps } from '../types.js';
import type {
  DwellAssessmentOutcome,
  DwellAttentionOutcome,
  DwellMasteryUpdated,
  DwellCertAchieved,
  DwellAttentionSurfaced,
} from '../events/types.js';
import { BB } from '../events/subjects.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeDeps(): DwellDeps {
  return {
    bb: {
      read: vi.fn().mockResolvedValue(null),
      write: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockReturnValue(() => {}),
    },
    zipper: {
      registerTool: vi.fn(),
      unregisterTool: vi.fn(),
    },
    nats: {
      publish: vi.fn(),
      subscribe: vi.fn().mockReturnValue(() => {}),
    },
    graph: {
      query: vi.fn().mockResolvedValue([]),
    },
  };
}

/**
 * Extract the handler registered for a given subject string.
 * The nats.subscribe mock records calls; this finds the matching one.
 */
function getHandler(
  deps: DwellDeps,
  subject: string,
): (data: unknown) => void {
  const calls = (deps.nats.subscribe as ReturnType<typeof vi.fn>).mock.calls as [
    string,
    (data: unknown) => void,
  ][];
  const call = calls.find(([s]) => s === subject);
  if (!call) throw new Error(`No subscription found for subject: ${subject}`);
  return call[1];
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('DwellCultivatorPersonal', () => {
  let deps: DwellDeps;
  let agent: DwellCultivatorPersonal;

  beforeEach(() => {
    deps = makeDeps();
    agent = new DwellCultivatorPersonal(deps);
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  it('mounts and disposes cleanly', () => {
    agent.mount();

    // Should have subscribed to 4 subjects
    expect(deps.nats.subscribe).toHaveBeenCalledTimes(4);
    expect(deps.nats.subscribe).toHaveBeenCalledWith(
      BB.ASSESSMENT_OUTCOME,
      expect.any(Function),
    );
    expect(deps.nats.subscribe).toHaveBeenCalledWith(
      BB.ATTENTION_OUTCOME,
      expect.any(Function),
    );
    expect(deps.nats.subscribe).toHaveBeenCalledWith(
      'bb.mastery.*.updated',
      expect.any(Function),
    );
    expect(deps.nats.subscribe).toHaveBeenCalledWith(
      'bb.cert.*.achieved',
      expect.any(Function),
    );

    // Unsubscribers are called on dispose
    const unsubFns = (deps.nats.subscribe as ReturnType<typeof vi.fn>).mock.results.map(
      (r: { value: unknown }) => r.value,
    ) as Array<() => void>;
    const unsubSpies = unsubFns.map((fn) => vi.fn(fn));

    // Replace unsubscribers to verify they're called
    // (we test that dispose does not throw — the mock returns () => {})
    expect(() => agent.dispose()).not.toThrow();
  });

  it('dispose can be called multiple times without throwing', () => {
    agent.mount();
    agent.dispose();
    expect(() => agent.dispose()).not.toThrow();
  });

  it('does not subscribe before mount() is called', () => {
    expect(deps.nats.subscribe).not.toHaveBeenCalled();
  });

  // ── Mastery threshold ──────────────────────────────────────────────────────

  it('emits bb.attention.surfaced when mastery confidence crosses threshold (0.85)', async () => {
    agent.mount();

    const event: DwellMasteryUpdated = {
      domain: 'aws-saa',
      updatedAt: new Date().toISOString(),
      updatedNodes: [
        {
          conceptId: 'aws-saa/iam',
          confidencePrevious: 0.70,
          confidenceNew: 0.90, // crosses 0.85
          bloomsAltitudePrevious: 2,
          bloomsAltitudeNew: 3,
          trigger: 'assessment',
        },
      ],
    };

    const handler = getHandler(deps, 'bb.mastery.*.updated');
    handler(event);

    // Allow any microtask (persistState) to settle
    await vi.waitFor(() => {
      expect(deps.nats.publish).toHaveBeenCalledWith(
        BB.ATTENTION_SURFACED,
        expect.objectContaining({ mode: 'growth-acknowledgment' }),
      );
    });
  });

  it('does NOT emit bb.attention.surfaced when confidence is below threshold', async () => {
    agent.mount();

    const event: DwellMasteryUpdated = {
      domain: 'aws-saa',
      updatedAt: new Date().toISOString(),
      updatedNodes: [
        {
          conceptId: 'aws-saa/ec2',
          confidencePrevious: 0.50,
          confidenceNew: 0.80, // below 0.85
          bloomsAltitudePrevious: 1,
          bloomsAltitudeNew: 2,
          trigger: 'learning-interaction',
        },
      ],
    };

    const handler = getHandler(deps, 'bb.mastery.*.updated');
    handler(event);

    // Give microtasks a chance to run
    await new Promise((r) => setTimeout(r, 0));

    expect(deps.nats.publish).not.toHaveBeenCalledWith(
      BB.ATTENTION_SURFACED,
      expect.anything(),
    );
  });

  it('does NOT emit bb.attention.surfaced when node was already above threshold', async () => {
    agent.mount();

    // Both previous and new are above 0.85 — no crossing
    const event: DwellMasteryUpdated = {
      domain: 'aws-saa',
      updatedAt: new Date().toISOString(),
      updatedNodes: [
        {
          conceptId: 'aws-saa/s3',
          confidencePrevious: 0.88,
          confidenceNew: 0.95,
          bloomsAltitudePrevious: 3,
          bloomsAltitudeNew: 4,
          trigger: 'learning-interaction',
        },
      ],
    };

    const handler = getHandler(deps, 'bb.mastery.*.updated');
    handler(event);

    await new Promise((r) => setTimeout(r, 0));

    expect(deps.nats.publish).not.toHaveBeenCalledWith(
      BB.ATTENTION_SURFACED,
      expect.anything(),
    );
  });

  // ── Cert milestone ─────────────────────────────────────────────────────────

  it('records cert achievement milestone and emits attention.surfaced', async () => {
    agent.mount();

    const event: DwellCertAchieved = {
      domain: 'aws-saa',
      certName: 'AWS SAA-C03',
      achievedAt: new Date().toISOString(),
      validatedExternally: true,
    };

    const handler = getHandler(deps, 'bb.cert.*.achieved');
    handler(event);

    await vi.waitFor(() => {
      // Should emit milestone celebration
      expect(deps.nats.publish).toHaveBeenCalledWith(
        BB.ATTENTION_SURFACED,
        expect.objectContaining({ mode: 'milestone-celebration' }),
      );

      // Should persist state with the new milestone
      expect(deps.bb.write).toHaveBeenCalledWith(
        'dwell.cultivator-personal.state',
        expect.objectContaining({
          milestones: expect.arrayContaining([
            expect.objectContaining({
              domain: 'aws-saa',
              certName: 'AWS SAA-C03',
            }),
          ]),
        }),
      );
    });
  });

  it('records multiple cert milestones independently', async () => {
    agent.mount();

    const events: DwellCertAchieved[] = [
      {
        domain: 'aws-saa',
        certName: 'AWS SAA-C03',
        achievedAt: new Date().toISOString(),
        validatedExternally: true,
      },
      {
        domain: 'aws-dev',
        certName: 'AWS DVA-C02',
        achievedAt: new Date().toISOString(),
        validatedExternally: false,
      },
    ];

    const handler = getHandler(deps, 'bb.cert.*.achieved');
    for (const e of events) handler(e);

    await vi.waitFor(() => {
      const writeCalls = (deps.bb.write as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = writeCalls[writeCalls.length - 1];
      expect(lastCall[1].milestones).toHaveLength(2);
    });
  });

  // ── Assessment trend accumulation ──────────────────────────────────────────

  it('accumulates correct assessment outcomes per domain', async () => {
    agent.mount();

    const correctEvent: DwellAssessmentOutcome = {
      itemId: 'item-1',
      conceptIds: ['aws-saa/iam', 'aws-saa/sts'],
      bloomsLevelDemonstrated: 2,
      correct: true,
      responseTimeMs: 3000,
      confidence: 'certain',
    };

    const incorrectEvent: DwellAssessmentOutcome = {
      itemId: 'item-2',
      conceptIds: ['aws-saa/ec2'],
      bloomsLevelDemonstrated: 1,
      correct: false,
      responseTimeMs: 5000,
      confidence: 'guessed',
    };

    const handler = getHandler(deps, BB.ASSESSMENT_OUTCOME);
    handler(correctEvent);
    handler(incorrectEvent);

    await vi.waitFor(() => {
      const writeCalls = (deps.bb.write as ReturnType<typeof vi.fn>).mock.calls;
      const lastState = writeCalls[writeCalls.length - 1][1];
      // Both assessments are in the aws-saa domain
      const trend = lastState.trends['aws-saa'];
      expect(trend.totalCount).toBe(2);
      expect(trend.correctCount).toBe(1);
    });
  });

  // ── Attention engagement tracking ─────────────────────────────────────────

  it('records attention outcome engagement', async () => {
    agent.mount();

    const event: DwellAttentionOutcome = {
      itemId: 'surfaced-item-1',
      itemType: 'bridge-card',
      response: 'engaged',
      noteAdded: null,
      respondedAt: new Date().toISOString(),
    };

    const handler = getHandler(deps, BB.ATTENTION_OUTCOME);
    handler(event);

    await vi.waitFor(() => {
      const writeCalls = (deps.bb.write as ReturnType<typeof vi.fn>).mock.calls;
      const lastState = writeCalls[writeCalls.length - 1][1];
      expect(lastState.engagement).toHaveLength(1);
      expect(lastState.engagement[0].itemId).toBe('surfaced-item-1');
    });
  });

  // ── State persistence ──────────────────────────────────────────────────────

  it('persists state to BB after each event', async () => {
    agent.mount();

    const event: DwellMasteryUpdated = {
      domain: 'aws-saa',
      updatedAt: new Date().toISOString(),
      updatedNodes: [
        {
          conceptId: 'aws-saa/vpc',
          confidencePrevious: 0.40,
          confidenceNew: 0.55,
          bloomsAltitudePrevious: 1,
          bloomsAltitudeNew: 2,
          trigger: 'assessment',
        },
      ],
    };

    const handler = getHandler(deps, 'bb.mastery.*.updated');
    handler(event);

    await vi.waitFor(() => {
      expect(deps.bb.write).toHaveBeenCalledWith(
        'dwell.cultivator-personal.state',
        expect.objectContaining({
          lastUpdated: expect.any(String),
        }),
      );
    });
  });

  // ── Error resilience ───────────────────────────────────────────────────────

  it('does not throw when bb.write rejects', async () => {
    (deps.bb.write as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('BB write failed'),
    );
    agent.mount();

    const event: DwellMasteryUpdated = {
      domain: 'aws-saa',
      updatedAt: new Date().toISOString(),
      updatedNodes: [
        {
          conceptId: 'aws-saa/vpc',
          confidencePrevious: 0.40,
          confidenceNew: 0.55,
          bloomsAltitudePrevious: 1,
          bloomsAltitudeNew: 2,
          trigger: 'assessment',
        },
      ],
    };

    const handler = getHandler(deps, 'bb.mastery.*.updated');
    // Should not propagate the error
    expect(() => handler(event)).not.toThrow();

    // Give the rejected promise a tick to settle
    await new Promise((r) => setTimeout(r, 10));
  });
});
