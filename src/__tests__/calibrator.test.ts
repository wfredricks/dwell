import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DwellCalibrator } from '../agents/calibrator/index.js';
import type { DwellDeps } from '../types.js';
import type { DwellLearnerBaseline, DwellAssessmentOutcome } from '../events/types.js';
import { BB } from '../events/subjects.js';

// ── Mock factory ───────────────────────────────────────────────────────────

function makeDeps(): DwellDeps {
  return {
    bb: {
      read:      vi.fn().mockResolvedValue(null),
      write:     vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockReturnValue(() => {}),
    },
    zipper: {
      registerTool:   vi.fn(),
      unregisterTool: vi.fn(),
    },
    nats: {
      publish:   vi.fn(),
      subscribe: vi.fn().mockReturnValue(() => {}),
    },
    graph: {
      query: vi.fn().mockResolvedValue([]),
    },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function captureHandler(
  deps: DwellDeps,
  subject: string,
): ((data: unknown) => void) | undefined {
  const calls = (deps.nats.subscribe as ReturnType<typeof vi.fn>).mock.calls as [string, (data: unknown) => void][];
  const found = calls.find(([s]) => s === subject);
  return found?.[1];
}

function makeBaseline(domain: string): DwellLearnerBaseline {
  return {
    domain,
    nodes: [
      { conceptId: 'c-001', signalStrength: 'strong',      evidenceSources: ['project-a'] },
      { conceptId: 'c-002', signalStrength: 'weak',        evidenceSources: ['doc-b'] },
      { conceptId: 'c-003', signalStrength: 'none',        evidenceSources: [] },
      { conceptId: 'c-004', signalStrength: 'conflicting', evidenceSources: ['proj-a', 'doc-b'] },
    ],
    assessedAt: new Date().toISOString(),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('DwellCalibrator', () => {
  let deps: DwellDeps;
  let agent: DwellCalibrator;

  beforeEach(() => {
    deps  = makeDeps();
    agent = new DwellCalibrator(deps);
  });

  // ── Lifecycle ────────────────────────────────────────────────────────────

  it('mounts cleanly — registers two NATS subscriptions', () => {
    agent.mount();
    expect(deps.nats.subscribe).toHaveBeenCalledTimes(2);
    expect(deps.nats.subscribe).toHaveBeenCalledWith(
      BB.LEARNER_BASELINE_PATTERN,
      expect.any(Function),
    );
    expect(deps.nats.subscribe).toHaveBeenCalledWith(
      BB.ASSESSMENT_OUTCOME,
      expect.any(Function),
    );
  });

  it('dispose calls all unsubscribe functions', () => {
    const unsub1 = vi.fn();
    const unsub2 = vi.fn();
    (deps.nats.subscribe as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(unsub1)
      .mockReturnValueOnce(unsub2);

    agent.mount();
    agent.dispose();

    expect(unsub1).toHaveBeenCalledTimes(1);
    expect(unsub2).toHaveBeenCalledTimes(1);
  });

  it('dispose is safe to call twice without throwing', () => {
    agent.mount();
    agent.dispose();
    expect(() => agent.dispose()).not.toThrow();
  });

  // ── Happy path: bb.learner.<domain>.baseline ─────────────────────────────

  it('emits bb.mastery.<domain>.initialized on bb.learner.<domain>.baseline', async () => {
    agent.mount();
    const handler = captureHandler(deps, BB.LEARNER_BASELINE_PATTERN);
    expect(handler).toBeDefined();

    await handler!(makeBaseline('IAM'));

    expect(deps.nats.publish).toHaveBeenCalledWith(
      BB.MASTERY_INITIALIZED('IAM'),
      expect.objectContaining({
        domain:     'IAM',
        totalNodes: 4,
        nodes:      expect.any(Array),
      }),
    );
  });

  it('initializes a mastery node for each baseline node', async () => {
    agent.mount();
    const handler = captureHandler(deps, BB.LEARNER_BASELINE_PATTERN);
    await handler!(makeBaseline('EC2'));

    const publishCall = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls
      .find(([subj]: [string]) => subj === BB.MASTERY_INITIALIZED('EC2'));
    const payload = publishCall![1];
    expect(payload.nodes).toHaveLength(4);
    const conceptIds = payload.nodes.map((n: { conceptId: string }) => n.conceptId);
    expect(conceptIds).toContain('c-001');
    expect(conceptIds).toContain('c-002');
    expect(conceptIds).toContain('c-003');
    expect(conceptIds).toContain('c-004');
  });

  it('maps strong signal to altitude 4 and high confidence', async () => {
    agent.mount();
    const handler = captureHandler(deps, BB.LEARNER_BASELINE_PATTERN);
    await handler!(makeBaseline('S3'));

    const publishCall = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls
      .find(([subj]: [string]) => subj === BB.MASTERY_INITIALIZED('S3'));
    const strongNode = publishCall![1].nodes.find((n: { conceptId: string }) => n.conceptId === 'c-001');

    expect(strongNode.bloomsAltitude).toBe(4);
    expect(strongNode.confidence).toBe(0.8);
    expect(strongNode.source).toBe('prior-evidence');
  });

  it('maps none signal to altitude 0 and confidence 0', async () => {
    agent.mount();
    const handler = captureHandler(deps, BB.LEARNER_BASELINE_PATTERN);
    await handler!(makeBaseline('VPC'));

    const publishCall = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls
      .find(([subj]: [string]) => subj === BB.MASTERY_INITIALIZED('VPC'));
    const coldNode = publishCall![1].nodes.find((n: { conceptId: string }) => n.conceptId === 'c-003');

    expect(coldNode.bloomsAltitude).toBe(0);
    expect(coldNode.confidence).toBe(0);
    expect(coldNode.source).toBe('no-signal');
  });

  // ── Happy path: bb.assessment.outcome ────────────────────────────────────

  it('emits bb.mastery.<domain>.updated on a correct assessment outcome', async () => {
    agent.mount();
    const baselineHandler = captureHandler(deps, BB.LEARNER_BASELINE_PATTERN);
    await baselineHandler!(makeBaseline('IAM'));

    // Reset publish mock so we only see the update event
    (deps.nats.publish as ReturnType<typeof vi.fn>).mockClear();

    const outcomeHandler = captureHandler(deps, BB.ASSESSMENT_OUTCOME);
    const outcome: DwellAssessmentOutcome = {
      itemId:                'item-1',
      conceptIds:            ['c-001'],
      bloomsLevelDemonstrated: 5,
      correct:               true,
      responseTimeMs:        2000,
      confidence:            'certain',
    };
    await outcomeHandler!(outcome);

    expect(deps.nats.publish).toHaveBeenCalledWith(
      BB.MASTERY_UPDATED('IAM'),
      expect.objectContaining({
        domain:       'IAM',
        updatedNodes: expect.arrayContaining([
          expect.objectContaining({ conceptId: 'c-001', trigger: 'assessment' }),
        ]),
      }),
    );
  });

  it('increases confidence on correct assessment', async () => {
    agent.mount();
    const baselineHandler = captureHandler(deps, BB.LEARNER_BASELINE_PATTERN);
    await baselineHandler!(makeBaseline('IAM'));

    (deps.nats.publish as ReturnType<typeof vi.fn>).mockClear();
    const outcomeHandler = captureHandler(deps, BB.ASSESSMENT_OUTCOME);

    await outcomeHandler!({
      itemId:                'item-2',
      conceptIds:            ['c-002'],  // weak → confidence 0.3
      bloomsLevelDemonstrated: 3,
      correct:               true,
      responseTimeMs:        1500,
      confidence:            'hesitant',
    });

    const publishCall = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls
      .find(([subj]: [string]) => subj === BB.MASTERY_UPDATED('IAM'));
    const updatedNode = publishCall![1].updatedNodes.find(
      (n: { conceptId: string }) => n.conceptId === 'c-002',
    );
    expect(updatedNode.confidenceNew).toBeGreaterThan(updatedNode.confidencePrevious);
  });

  it('decreases confidence on incorrect assessment', async () => {
    agent.mount();
    const baselineHandler = captureHandler(deps, BB.LEARNER_BASELINE_PATTERN);
    await baselineHandler!(makeBaseline('EC2'));

    (deps.nats.publish as ReturnType<typeof vi.fn>).mockClear();
    const outcomeHandler = captureHandler(deps, BB.ASSESSMENT_OUTCOME);

    await outcomeHandler!({
      itemId:                'item-3',
      conceptIds:            ['c-001'],  // strong → confidence 0.8
      bloomsLevelDemonstrated: 2,
      correct:               false,
      responseTimeMs:        3000,
      confidence:            'guessed',
    });

    const publishCall = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls
      .find(([subj]: [string]) => subj === BB.MASTERY_UPDATED('EC2'));
    const updatedNode = publishCall![1].updatedNodes.find(
      (n: { conceptId: string }) => n.conceptId === 'c-001',
    );
    expect(updatedNode.confidenceNew).toBeLessThan(updatedNode.confidencePrevious);
  });

  it('does not emit updated when no known concepts are in the outcome', async () => {
    agent.mount();
    const baselineHandler = captureHandler(deps, BB.LEARNER_BASELINE_PATTERN);
    await baselineHandler!(makeBaseline('IAM'));

    (deps.nats.publish as ReturnType<typeof vi.fn>).mockClear();
    const outcomeHandler = captureHandler(deps, BB.ASSESSMENT_OUTCOME);

    await outcomeHandler!({
      itemId:                'item-x',
      conceptIds:            ['unknown-concept'],
      bloomsLevelDemonstrated: 2,
      correct:               true,
      responseTimeMs:        1000,
      confidence:            'certain',
    });

    expect(deps.nats.publish).not.toHaveBeenCalled();
  });

  // ── AltitudeNeverRegresses invariant ─────────────────────────────────────

  it('altitude never regresses on incorrect assessment (AltitudeNeverRegresses invariant)', async () => {
    agent.mount();
    const baselineHandler = captureHandler(deps, BB.LEARNER_BASELINE_PATTERN);
    await baselineHandler!(makeBaseline('VPC'));

    // First: push altitude up via correct answer
    const outcomeHandler = captureHandler(deps, BB.ASSESSMENT_OUTCOME);
    await outcomeHandler!({
      itemId:                'item-up',
      conceptIds:            ['c-001'],
      bloomsLevelDemonstrated: 6,
      correct:               true,
      responseTimeMs:        1000,
      confidence:            'certain',
    });

    // Get current altitude after the bump
    const firstUpdateCall = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls
      .find(([subj]: [string]) => subj === BB.MASTERY_UPDATED('VPC'));
    const altitudeAfterCorrect = firstUpdateCall![1].updatedNodes[0].bloomsAltitudeNew;

    // Now: wrong answer — altitude must not regress
    (deps.nats.publish as ReturnType<typeof vi.fn>).mockClear();
    await outcomeHandler!({
      itemId:                'item-down',
      conceptIds:            ['c-001'],
      bloomsLevelDemonstrated: 1,
      correct:               false,
      responseTimeMs:        2000,
      confidence:            'guessed',
    });

    const secondUpdateCall = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls
      .find(([subj]: [string]) => subj === BB.MASTERY_UPDATED('VPC'));
    const altitudeAfterIncorrect = secondUpdateCall![1].updatedNodes[0].bloomsAltitudeNew;

    // Altitude must be ≥ what it was after the correct answer
    expect(altitudeAfterIncorrect).toBeGreaterThanOrEqual(altitudeAfterCorrect);
  });

  it('correct answer with lower demonstrated altitude never reduces current altitude', async () => {
    agent.mount();
    const baselineHandler = captureHandler(deps, BB.LEARNER_BASELINE_PATTERN);
    // strong node starts at altitude 4
    await baselineHandler!(makeBaseline('S3'));

    const outcomeHandler = captureHandler(deps, BB.ASSESSMENT_OUTCOME);

    // Attempt: correct but demonstrated level is lower than current (4)
    (deps.nats.publish as ReturnType<typeof vi.fn>).mockClear();
    await outcomeHandler!({
      itemId:                'item-low',
      conceptIds:            ['c-001'],
      bloomsLevelDemonstrated: 2,  // below current altitude of 4
      correct:               true,
      responseTimeMs:        1000,
      confidence:            'certain',
    });

    // Should either not emit (no real change to altitude) OR emit with altitude still ≥ 4
    const updateCall = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls
      .find(([subj]: [string]) => subj === BB.MASTERY_UPDATED('S3'));

    if (updateCall) {
      const node = updateCall[1].updatedNodes.find(
        (n: { conceptId: string }) => n.conceptId === 'c-001',
      );
      if (node) {
        expect(node.bloomsAltitudeNew).toBeGreaterThanOrEqual(4);
      }
    }
    // If no update was emitted (nothing changed), that is also valid
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it('swallows handler errors without rethrowing into NATS subscription', async () => {
    agent.mount();
    const outcomeHandler = captureHandler(deps, BB.ASSESSMENT_OUTCOME);

    // Outcome arrives before any baseline — should not throw
    await expect(
      outcomeHandler!({
        itemId:                'item-err',
        conceptIds:            ['unknown'],
        bloomsLevelDemonstrated: 1,
        correct:               true,
        responseTimeMs:        100,
        confidence:            'certain',
      } as DwellAssessmentOutcome),
    ).resolves.not.toThrow();
  });
});
