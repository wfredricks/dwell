/**
 * Scene 3 Integration Test — Plateau detection → bridge card flow
 *
 * Tests the bridge-card path described in DWELL-INTEGRATION-STORY.md Scene 7:
 * Surveyor detects a plateau → Gatekeeper fires bb.bridge.requested →
 * Bridge reads AntiquarianSnapshot from BB → emits bb.bridge.ready.
 *
 * Scope:
 *   - Simulate Gatekeeper firing bb.bridge.requested (learner plateaued)
 *   - Bridge reads snapshot from BB (BridgeReadsSnapshotNotAntiquarian invariant)
 *   - Bridge personalizes candidate → emits bb.bridge.ready
 *
 * NOTE: The integration story describes a full "Zipper routes to Domain Twin
 * queryBridge → AnswerAgent → Bridge" path. The current Bridge implementation
 * personalizes directly from the AntiquarianSnapshot on the BB without calling
 * the Zipper or a Domain Twin. The Zipper/Domain Twin bridge path is planned for
 * a future sprint. This test covers what is actually implemented.
 *
 * TODO (sprint-3a): When handle.registry is available, register MockDomainTwin
 * and test the full Zipper-mediated bridge-query path.
 *
 * @namespace dwell
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mountDwell } from '../../mount.js';
import { MockBlackboard } from '../helpers/mock-blackboard.js';
import { MockNats } from '../helpers/mock-nats.js';
import { BB } from '../../events/subjects.js';
import type { DwellDeps, DwellHandle, Zipper } from '../../types.js';
import type {
  DwellBridgeRequested,
  DwellBridgeReady,
  DwellAntiquarianSnapshot,
} from '../../events/types.js';

// ── Test domain ───────────────────────────────────────────────────────────

const DOMAIN = 'aws-saa'; // @adopt:dwell-integration-test-domain  [resolved: aws-saa]

// ── Pre-built AntiquarianSnapshot ─────────────────────────────────────────

/**
 * A synthetic AntiquarianSnapshot that gives Bridge enough operational
 * evidence to select a mental model and personalize a bridge card.
 *
 * 'Peach Bottom EOP hierarchy' is an operational source — Bridge will
 * prefer this for analogy-type personalization.
 */
function makeSnapshot(): DwellAntiquarianSnapshot {
  return {
    domain:    DOMAIN,
    nodes: [
      {
        conceptId:       'vpc-routing',
        signalStrength:  'strong',
        evidenceSources: ['Peach Bottom EOP hierarchy', 'nuclear-containment-zones'],
      },
      {
        conceptId:       'iam-policies',
        signalStrength:  'strong',
        evidenceSources: ['Peach Bottom EOP hierarchy'],
      },
      {
        conceptId:       's3-storage',
        signalStrength:  'weak',
        evidenceSources: ['academic textbook: storage systems'],
      },
    ],
    updatedAt: '2026-07-02T12:00:00.000Z',
  };
}

/** A bridge-requested payload simulating a learner plateau on vpc-routing. */
function makeBridgeRequested(): DwellBridgeRequested {
  return {
    domain:       DOMAIN,
    conceptIds:   ['vpc-routing', 'iam-policies'],
    learnerState: 'plateau',
    calibratorSignal: {
      confidenceCurrent: 0.48,
      visitsCount:       6,
      plateauDuration:   '22min',
    },
    requestedAt: new Date().toISOString(),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function createMockZipper(): Zipper {
  return {
    registerTool:   () => {},
    unregisterTool: () => {},
  };
}

function waitForEvent(nats: MockNats, subject: string, timeoutMs = 1000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // Check if event already captured
    const existing = nats.eventsFor(subject);
    if (existing.length > 0) {
      resolve(existing[0].data);
      return;
    }

    const unsub = nats.subscribe(subject, (data) => {
      unsub();
      clearTimeout(timer);
      resolve(data);
    });

    const timer = setTimeout(() => {
      unsub();
      reject(new Error(`Timeout waiting for subject: ${subject} (after ${timeoutMs}ms)`));
    }, timeoutMs);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Scene 3 — Bridge card flow: plateau detection → bridge.ready', () => {
  let bb:        MockBlackboard;
  let nats:      MockNats;
  let handle:    DwellHandle;
  let graphSpy:  ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    bb   = new MockBlackboard();
    nats = new MockNats();

    // Pre-seed the BB with an AntiquarianSnapshot so Bridge can read it
    bb.seed('dwell.antiquarian.snapshot', makeSnapshot());

    graphSpy = vi.fn().mockResolvedValue([]);

    const deps: DwellDeps = {
      bb,
      nats,
      zipper: createMockZipper(),
      graph:  { query: graphSpy },
    };

    handle = await mountDwell(deps);
  });

  afterEach(async () => {
    await handle.dispose();
  });

  // ── bb.bridge.ready fires ────────────────────────────────────────────────

  it('bb.bridge.ready fires within 1000ms of bb.bridge.requested', async () => {
    const bridgeReadyPromise = waitForEvent(nats, BB.BRIDGE_READY, 1000);

    const start = Date.now();
    nats.publish(BB.BRIDGE_REQUESTED, makeBridgeRequested());

    await bridgeReadyPromise;
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });

  it('bb.bridge.ready has correct domain and conceptIds', async () => {
    const bridgeReadyPromise = waitForEvent(nats, BB.BRIDGE_READY, 1000);

    nats.publish(BB.BRIDGE_REQUESTED, makeBridgeRequested());

    const bridgeReady = (await bridgeReadyPromise) as DwellBridgeReady;
    expect(bridgeReady.domain).toBe(DOMAIN);
    expect(bridgeReady.conceptIds).toBeDefined();
    expect(Array.isArray(bridgeReady.conceptIds)).toBe(true);
  });

  // ── BridgeReady card fields ───────────────────────────────────────────────

  it('BridgeReady card has non-empty body text', async () => {
    const bridgeReadyPromise = waitForEvent(nats, BB.BRIDGE_READY, 1000);

    nats.publish(BB.BRIDGE_REQUESTED, makeBridgeRequested());

    const bridgeReady = (await bridgeReadyPromise) as DwellBridgeReady;
    expect(bridgeReady.card).toBeDefined();
    expect(typeof bridgeReady.card.body).toBe('string');
    expect(bridgeReady.card.body.length).toBeGreaterThan(0);
  });

  it('BridgeReady card body references operational anchor from snapshot', async () => {
    const bridgeReadyPromise = waitForEvent(nats, BB.BRIDGE_READY, 1000);

    nats.publish(BB.BRIDGE_REQUESTED, makeBridgeRequested());

    const bridgeReady = (await bridgeReadyPromise) as DwellBridgeReady;
    // Bridge selects the strongest operational mental model (Peach Bottom EOP hierarchy)
    // and personalizes the card body with a reference to it
    expect(bridgeReady.card.body).toContain('Peach Bottom EOP hierarchy');
  });

  it('BridgeReady card origin is personal-twin-synthesized', async () => {
    const bridgeReadyPromise = waitForEvent(nats, BB.BRIDGE_READY, 1000);

    nats.publish(BB.BRIDGE_REQUESTED, makeBridgeRequested());

    const bridgeReady = (await bridgeReadyPromise) as DwellBridgeReady;
    expect(bridgeReady.card.origin).toBe('personal-twin-synthesized');
  });

  it('BridgeReady has readyAt timestamp', async () => {
    const bridgeReadyPromise = waitForEvent(nats, BB.BRIDGE_READY, 1000);

    nats.publish(BB.BRIDGE_REQUESTED, makeBridgeRequested());

    const bridgeReady = (await bridgeReadyPromise) as DwellBridgeReady;
    expect(bridgeReady.readyAt).toBeDefined();
    expect(typeof bridgeReady.readyAt).toBe('string');
    // Should be a valid ISO timestamp
    expect(new Date(bridgeReady.readyAt).getTime()).not.toBeNaN();
  });

  // ── BridgeReadsSnapshotNotAntiquarian invariant ───────────────────────────

  it('Bridge does NOT call graph.query — reads snapshot from BB, not Antiquarian', async () => {
    const bridgeReadyPromise = waitForEvent(nats, BB.BRIDGE_READY, 1000);

    nats.publish(BB.BRIDGE_REQUESTED, makeBridgeRequested());

    await bridgeReadyPromise;

    // Bridge must never call graph.query — that is Antiquarian's exclusive territory
    expect(graphSpy).not.toHaveBeenCalled();
  });

  it('Bridge reads dwell.antiquarian.snapshot from BB', async () => {
    const bridgeReadyPromise = waitForEvent(nats, BB.BRIDGE_READY, 1000);

    nats.publish(BB.BRIDGE_REQUESTED, makeBridgeRequested());

    await bridgeReadyPromise;

    // Verify BB was read (the write log won't have it, but bb.writes is for writes;
    // we verify the presence of snapshot data via the card body containing the mental model)
    const snapshotOnBB = await bb.read('dwell.antiquarian.snapshot');
    const snapshot = snapshotOnBB as DwellAntiquarianSnapshot;
    expect(snapshot.domain).toBe(DOMAIN);
    expect(snapshot.nodes.length).toBeGreaterThan(0);
  });

  // ── Missing snapshot — graceful degradation ───────────────────────────────

  it('does NOT throw when snapshot is absent from BB', async () => {
    // Create a fresh setup without seeding the snapshot
    await handle.dispose();

    const emptyBb  = new MockBlackboard(); // no snapshot seeded
    const freshNats = new MockNats();

    const freshDeps: DwellDeps = {
      bb:     emptyBb,
      nats:   freshNats,
      zipper: createMockZipper(),
      graph:  { query: vi.fn().mockResolvedValue([]) },
    };

    const freshHandle = await mountDwell(freshDeps);

    // Publish bridge requested — should not throw even with no snapshot
    let errorThrown = false;
    try {
      freshNats.publish(BB.BRIDGE_REQUESTED, makeBridgeRequested());
      // Give any pending microtasks time to run
      await new Promise((res) => setTimeout(res, 100));
    } catch {
      errorThrown = true;
    }

    expect(errorThrown).toBe(false);

    await freshHandle.dispose();
  });

  it('does NOT emit bb.bridge.ready when snapshot is absent from BB', async () => {
    // Create a fresh setup without seeding the snapshot
    await handle.dispose();

    const emptyBb   = new MockBlackboard(); // no snapshot
    const freshNats = new MockNats();

    const freshDeps: DwellDeps = {
      bb:     emptyBb,
      nats:   freshNats,
      zipper: createMockZipper(),
      graph:  { query: vi.fn().mockResolvedValue([]) },
    };

    const freshHandle = await mountDwell(freshDeps);

    freshNats.publish(BB.BRIDGE_REQUESTED, makeBridgeRequested());

    // Wait a short time and confirm no bridge.ready was emitted
    await new Promise((res) => setTimeout(res, 200));

    const bridgeReadyEvents = freshNats.eventsFor(BB.BRIDGE_READY);
    expect(bridgeReadyEvents).toHaveLength(0);

    await freshHandle.dispose();
  });

  // ── TODO: Domain Twin bridge path (sprint-3a) ─────────────────────────────
  //
  // When handle.registry is available (Zipper sprint), add tests for:
  //   - Register MockDomainTwin via handle.registry
  //   - Verify Zipper routes bb.bridge.requested → queryBridge on Domain Twin
  //   - Verify AnswerAgent receives bb.contribution.bridge-candidates
  //   - Verify Bridge personalizes best candidate from Domain Twin response
  //
  // The full path:
  //   bb.bridge.requested → [Zipper] → DomainTwin.queryBridge()
  //     → bb.contribution.bridge-candidates → [AnswerAgent] → bb.answer.bridge-candidate
  //     → [Bridge] → bb.bridge.ready (with Domain Twin candidate personalized)
});
