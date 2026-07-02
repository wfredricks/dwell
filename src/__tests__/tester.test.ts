/**
 * Tests for DwellTester
 *
 * @namespace dwell
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DwellTester } from '../agents/domain-twin/tester/index.js';
import type { DwellTesterIdentity } from '../agents/domain-twin/tester/index.js';
import type { AssessmentItem } from '../agents/domain-twin/tester/types.js';
import { selectItems } from '../agents/domain-twin/tester/item-selector.js';
import { accumulate } from '../agents/domain-twin/tester/outcome-accumulator.js';
import type { OutcomeStore } from '../agents/domain-twin/tester/outcome-accumulator.js';
import type { DwellDeps } from '../types.js';
import { DWELL } from '../events/subjects.js';
import type {
  DwellAssessmentRequest,
  DwellOutcomeSignal,
  DwellAssessmentDelivered,
} from '../events/types.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function makeIdentity(): DwellTesterIdentity {
  return { twinId: 'aws-saa-dt' };
}

function makeItem(
  overrides: Partial<AssessmentItem> = {},
): AssessmentItem {
  return {
    itemId: 'item-001',
    question: 'Which IAM feature allows cross-account access?',
    bloomsLevel: 2,
    conceptIds: ['aws-saa/iam'],
    distractors: ['IAM Group', 'IAM Policy', 'Service Control Policy'],
    correctAnswer: 'IAM Role',
    difficultyScore: 0.5,
    discriminationIndex: 0.4,
    ...overrides,
  };
}

function makeAssessmentRequest(
  overrides: Partial<DwellAssessmentRequest> = {},
): DwellAssessmentRequest {
  return {
    conceptIds: ['aws-saa/iam'],
    bloomsLevel: 2,
    count: 1,
    masteryContext: [{ conceptId: 'aws-saa/iam', currentConfidence: 0.6 }],
    ...overrides,
  };
}

function makeOutcomeSignal(
  overrides: Partial<DwellOutcomeSignal> = {},
): DwellOutcomeSignal {
  return {
    conceptId: 'aws-saa/iam',
    interactionType: 'assessment-item',
    bridgeId: null,
    itemId: 'item-001',
    sourceDomains: [],
    outcome: 'correct',
    bloomsAltitudeAtInteraction: 2,
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

function getHandler(deps: DwellDeps, subject: string): (data: unknown) => void {
  const calls = (deps.nats.subscribe as ReturnType<typeof vi.fn>).mock.calls as [
    string,
    (data: unknown) => void,
  ][];
  const call = calls.find(([s]) => s === subject);
  if (!call) throw new Error(`No subscription found for subject: ${subject}`);
  return call[1];
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('DwellTester', () => {
  let deps: DwellDeps;
  let identity: DwellTesterIdentity;

  beforeEach(() => {
    deps = makeDeps();
    identity = makeIdentity();
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  it('mounts and subscribes to TWIN_ASSESSMENT_REQUEST and TWIN_OUTCOME_SIGNAL', () => {
    const agent = new DwellTester(deps, identity);
    agent.mount();

    expect(deps.nats.subscribe).toHaveBeenCalledWith(
      DWELL.TWIN_ASSESSMENT_REQUEST(identity.twinId),
      expect.any(Function),
    );
    expect(deps.nats.subscribe).toHaveBeenCalledWith(
      DWELL.TWIN_OUTCOME_SIGNAL(identity.twinId),
      expect.any(Function),
    );
    expect(deps.nats.subscribe).toHaveBeenCalledTimes(2);
  });

  it('disposes cleanly without throwing', () => {
    const agent = new DwellTester(deps, identity);
    agent.mount();
    expect(() => agent.dispose()).not.toThrow();
  });

  it('dispose can be called multiple times without throwing', () => {
    const agent = new DwellTester(deps, identity);
    agent.mount();
    agent.dispose();
    expect(() => agent.dispose()).not.toThrow();
  });

  it('does not subscribe before mount() is called', () => {
    // eslint-disable-next-line no-new
    new DwellTester(deps, identity);
    expect(deps.nats.subscribe).not.toHaveBeenCalled();
  });

  // ── Assessment item delivery ───────────────────────────────────────────────

  it('delivers assessment items on TWIN_ASSESSMENT_REQUEST', () => {
    const bank = [makeItem()];
    const agent = new DwellTester(deps, identity, bank);
    agent.mount();

    const request = makeAssessmentRequest();
    const handler = getHandler(deps, DWELL.TWIN_ASSESSMENT_REQUEST(identity.twinId));
    handler(request);

    expect(deps.nats.publish).toHaveBeenCalledWith(
      DWELL.USER_ASSESSMENT_DELIVERED(identity.twinId),
      expect.objectContaining({
        twinId: identity.twinId,
        items: expect.arrayContaining([
          expect.objectContaining({
            itemId: 'item-001',
            question: expect.any(String),
            bloomsLevel: 2,
            distractors: expect.any(Array),
            correctAnswer: expect.any(String),
          }),
        ]),
      }),
    );
  });

  it('delivers empty items array when bank has no matching items', () => {
    const bank = [makeItem({ bloomsLevel: 4 })]; // request asks for level 2
    const agent = new DwellTester(deps, identity, bank);
    agent.mount();

    const request = makeAssessmentRequest({ bloomsLevel: 2 });
    const handler = getHandler(deps, DWELL.TWIN_ASSESSMENT_REQUEST(identity.twinId));
    handler(request);

    const calls = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls;
    const [, payload] = calls[0] as [string, DwellAssessmentDelivered];
    expect(payload.items).toHaveLength(0);
  });

  // ── Outcome signal accumulation ────────────────────────────────────────────

  it('accumulates outcome signal without throwing', () => {
    const agent = new DwellTester(deps, identity);
    agent.mount();

    const handler = getHandler(deps, DWELL.TWIN_OUTCOME_SIGNAL(identity.twinId));
    const signal = makeOutcomeSignal();
    expect(() => handler(signal)).not.toThrow();
  });

  it('does not publish any NATS message on outcome signal (fire-and-forget)', () => {
    const agent = new DwellTester(deps, identity);
    agent.mount();

    const handler = getHandler(deps, DWELL.TWIN_OUTCOME_SIGNAL(identity.twinId));
    handler(makeOutcomeSignal());
    expect(deps.nats.publish).not.toHaveBeenCalled();
  });

  it('accumulates multiple outcome signals without throwing', () => {
    const agent = new DwellTester(deps, identity);
    agent.mount();

    const handler = getHandler(deps, DWELL.TWIN_OUTCOME_SIGNAL(identity.twinId));
    handler(makeOutcomeSignal({ outcome: 'correct' }));
    handler(makeOutcomeSignal({ outcome: 'incorrect' }));
    handler(makeOutcomeSignal({ itemId: null })); // no itemId — should be ignored

    expect(deps.nats.publish).not.toHaveBeenCalled();
  });
});

// ── Unit tests for pure / effect helpers ──────────────────────────────────────

describe('selectItems (pure)', () => {
  it('returns items matching requested bloomsLevel', () => {
    const bank: AssessmentItem[] = [
      makeItem({ itemId: 'a', bloomsLevel: 2, conceptIds: ['aws-saa/iam'] }),
      makeItem({ itemId: 'b', bloomsLevel: 3, conceptIds: ['aws-saa/iam'] }),
      makeItem({ itemId: 'c', bloomsLevel: 2, conceptIds: ['aws-saa/s3'] }),
    ];
    const request = makeAssessmentRequest({ bloomsLevel: 2, conceptIds: ['aws-saa/iam'], count: 5 });
    const result = selectItems(request, bank);
    // Only items with bloomsLevel 2 AND conceptId 'aws-saa/iam' qualify
    expect(result.every((i) => i.bloomsLevel === 2)).toBe(true);
    expect(result.every((i) => i.conceptIds.includes('aws-saa/iam'))).toBe(true);
    expect(result.find((i) => i.itemId === 'b')).toBeUndefined(); // level 3 filtered out
  });

  it('respects count limit', () => {
    const bank: AssessmentItem[] = [
      makeItem({ itemId: 'a', bloomsLevel: 2, conceptIds: ['aws-saa/iam'] }),
      makeItem({ itemId: 'b', bloomsLevel: 2, conceptIds: ['aws-saa/iam'], discriminationIndex: 0.5 }),
      makeItem({ itemId: 'c', bloomsLevel: 2, conceptIds: ['aws-saa/iam'], discriminationIndex: 0.35 }),
    ];
    const request = makeAssessmentRequest({ count: 2 });
    const result = selectItems(request, bank);
    expect(result).toHaveLength(2);
  });

  it('prioritises items with discriminationIndex > 0.3', () => {
    const lowItem = makeItem({ itemId: 'low', discriminationIndex: 0.1 });
    const highItem = makeItem({ itemId: 'high', discriminationIndex: 0.5 });
    const bank = [lowItem, highItem];
    const request = makeAssessmentRequest({ count: 1 });
    const result = selectItems(request, bank);
    expect(result[0].itemId).toBe('high');
  });

  it('returns empty array when no items match', () => {
    const bank = [makeItem({ bloomsLevel: 5 })];
    const request = makeAssessmentRequest({ bloomsLevel: 2 });
    const result = selectItems(request, bank);
    expect(result).toHaveLength(0);
  });
});

describe('accumulate (effect)', () => {
  it('accumulates a correct outcome signal', () => {
    const store: OutcomeStore = new Map();
    const signal = makeOutcomeSignal({ itemId: 'item-001', outcome: 'correct' });
    accumulate(signal, store);
    const record = store.get('item-001');
    expect(record).toBeDefined();
    expect(record!.correctCount).toBe(1);
    expect(record!.totalCount).toBe(1);
  });

  it('accumulates an incorrect outcome signal', () => {
    const store: OutcomeStore = new Map();
    const signal = makeOutcomeSignal({ itemId: 'item-002', outcome: 'incorrect' });
    accumulate(signal, store);
    const record = store.get('item-002');
    expect(record!.correctCount).toBe(0);
    expect(record!.totalCount).toBe(1);
  });

  it('ignores signals with null itemId (no PII accumulation fallback)', () => {
    const store: OutcomeStore = new Map();
    accumulate(makeOutcomeSignal({ itemId: null }), store);
    expect(store.size).toBe(0);
  });

  it('accumulates multiple signals for the same item', () => {
    const store: OutcomeStore = new Map();
    accumulate(makeOutcomeSignal({ outcome: 'correct' }), store);
    accumulate(makeOutcomeSignal({ outcome: 'incorrect' }), store);
    accumulate(makeOutcomeSignal({ outcome: 'correct' }), store);
    const record = store.get('item-001')!;
    expect(record.correctCount).toBe(2);
    expect(record.totalCount).toBe(3);
  });
});
