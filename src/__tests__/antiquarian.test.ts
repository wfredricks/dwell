import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DwellAntiquarian } from '../agents/antiquarian/index.js';
import type { DwellDeps } from '../types.js';
import type { DwellEvidence } from '../events/types.js';
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

/** Grab the NATS subscription handler registered for a given subject. */
function captureHandler(
  deps: DwellDeps,
  subject: string,
): ((data: unknown) => void) | undefined {
  const calls = (deps.nats.subscribe as ReturnType<typeof vi.fn>).mock.calls as [string, (data: unknown) => void][];
  const found = calls.find(([s]) => s === subject);
  return found?.[1];
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('DwellAntiquarian', () => {
  let deps: DwellDeps;
  let agent: DwellAntiquarian;

  beforeEach(() => {
    deps  = makeDeps();
    agent = new DwellAntiquarian(deps);
  });

  // ── Lifecycle ────────────────────────────────────────────────────────────

  it('mounts cleanly — registers two NATS subscriptions', () => {
    agent.mount();
    expect(deps.nats.subscribe).toHaveBeenCalledTimes(2);
    expect(deps.nats.subscribe).toHaveBeenCalledWith(
      BB.INTENT_DECLARED,
      expect.any(Function),
    );
    expect(deps.nats.subscribe).toHaveBeenCalledWith(
      BB.CERT_ACHIEVED_PATTERN,
      expect.any(Function),
    );
  });

  it('dispose calls every unsubscribe function returned by subscribe', () => {
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

  // ── Happy path: bb.intent.declared ──────────────────────────────────────

  it('emits bb.learner.<domain>.baseline on bb.intent.declared', async () => {
    const evidence: DwellEvidence[] = [
      {
        evidenceId:    'e1',
        conceptId:     'c-iam-1',
        conceptDomain: 'IAM',
        evidenceType:  'applied',
        source:        'project-x',
        occurredAt:    '2024-01-01T00:00:00Z',
      },
    ];
    (deps.graph.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(evidence);

    agent.mount();

    const handler = captureHandler(deps, BB.INTENT_DECLARED);
    expect(handler).toBeDefined();

    await handler!({ intent: 'IAM', declaredAt: new Date().toISOString() });

    expect(deps.nats.publish).toHaveBeenCalledWith(
      BB.LEARNER_BASELINE('IAM'),
      expect.objectContaining({
        domain: 'IAM',
        nodes:  expect.arrayContaining([
          expect.objectContaining({ conceptId: 'c-iam-1' }),
        ]),
      }),
    );
  });

  it('writes AntiquarianSnapshot to BB after baseline emission', async () => {
    const evidence: DwellEvidence[] = [
      {
        evidenceId:    'e2',
        conceptId:     'c-s3-1',
        conceptDomain: 'S3',
        evidenceType:  'designed',
        source:        'cert-saa',
        occurredAt:    '2024-06-01T00:00:00Z',
      },
    ];
    (deps.graph.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(evidence);

    agent.mount();
    const handler = captureHandler(deps, BB.INTENT_DECLARED);
    await handler!({ intent: 'S3', declaredAt: new Date().toISOString() });

    expect(deps.bb.write).toHaveBeenCalledWith(
      'dwell.antiquarian.snapshot',
      expect.objectContaining({
        domain: 'S3',
        nodes:  expect.arrayContaining([
          expect.objectContaining({ conceptId: 'c-s3-1' }),
        ]),
      }),
    );
  });

  // ── Happy path: bb.cert.<domain>.achieved ────────────────────────────────

  it('re-emits baseline on bb.cert.<domain>.achieved', async () => {
    const evidence: DwellEvidence[] = [
      {
        evidenceId:    'e3',
        conceptId:     'c-ec2-1',
        conceptDomain: 'EC2',
        evidenceType:  'evaluated',
        source:        'lab-run',
        occurredAt:    '2024-03-15T00:00:00Z',
      },
    ];
    (deps.graph.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(evidence);

    agent.mount();
    const certHandler = captureHandler(deps, BB.CERT_ACHIEVED_PATTERN);
    expect(certHandler).toBeDefined();

    await certHandler!({
      domain:             'EC2',
      certName:           'SAA-C03',
      achievedAt:         new Date().toISOString(),
      validatedExternally: true,
    });

    expect(deps.nats.publish).toHaveBeenCalledWith(
      BB.LEARNER_BASELINE('EC2'),
      expect.objectContaining({ domain: 'EC2' }),
    );
  });

  // ── Signal strength aggregation ──────────────────────────────────────────

  it('maps strong evidence (altitude ≥ 4) to signalStrength=strong', async () => {
    const evidence: DwellEvidence[] = [
      { evidenceId: 'e4', conceptId: 'c1', conceptDomain: 'D', evidenceType: 'diagnosed', source: 's', occurredAt: '2024-01-01T00:00:00Z' },
    ];
    (deps.graph.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(evidence);

    agent.mount();
    const handler = captureHandler(deps, BB.INTENT_DECLARED);
    await handler!({ intent: 'D', declaredAt: new Date().toISOString() });

    const publishCall = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls
      .find(([subj]: [string]) => subj === BB.LEARNER_BASELINE('D'));
    expect(publishCall).toBeDefined();
    const payload = publishCall![1];
    expect(payload.nodes[0].signalStrength).toBe('strong');
  });

  it('marks conflicting evidence when altitude spread ≥ 3', async () => {
    const evidence: DwellEvidence[] = [
      { evidenceId: 'e5', conceptId: 'cx', conceptDomain: 'X', evidenceType: 'read-about', source: 'a', occurredAt: '2024-01-01T00:00:00Z' },  // alt 1
      { evidenceId: 'e6', conceptId: 'cx', conceptDomain: 'X', evidenceType: 'designed',   source: 'b', occurredAt: '2024-01-02T00:00:00Z' },  // alt 6 → spread 5 ≥ 3
    ];
    (deps.graph.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce(evidence);

    agent.mount();
    const handler = captureHandler(deps, BB.INTENT_DECLARED);
    await handler!({ intent: 'X', declaredAt: new Date().toISOString() });

    const publishCall = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls
      .find(([subj]: [string]) => subj === BB.LEARNER_BASELINE('X'));
    const payload = publishCall![1];
    expect(payload.nodes[0].signalStrength).toBe('conflicting');
  });

  it('returns empty nodes when graph returns no evidence', async () => {
    (deps.graph.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    agent.mount();
    const handler = captureHandler(deps, BB.INTENT_DECLARED);
    await handler!({ intent: 'NONE', declaredAt: new Date().toISOString() });

    const publishCall = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls
      .find(([subj]: [string]) => subj === BB.LEARNER_BASELINE('NONE'));
    const payload = publishCall![1];
    expect(payload.nodes).toHaveLength(0);
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it('swallows handler errors without rethrowing into NATS subscription', async () => {
    (deps.graph.query as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('graph down'));

    agent.mount();
    const handler = captureHandler(deps, BB.INTENT_DECLARED);

    // Should not throw
    await expect(
      handler!({ intent: 'FAIL', declaredAt: new Date().toISOString() }),
    ).resolves.not.toThrow();
  });
});
