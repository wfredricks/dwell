/**
 * Scene 1 Integration Test — Full Dwell agent chain
 *
 * Tests the end-to-end acceptance scenario described in DWELL-INTEGRATION-STORY.md:
 * Bill declares "AWS Solutions Architect cert" and the personal-twin agent chain
 * runs from intent declaration through gap analysis.
 *
 * Chain under test:
 *   1. bb.intent.declared          (trigger — fired by test)
 *   2. bb.learner.aws-saa.baseline (Antiquarian: queries graph evidence → emits baseline)
 *   3. bb.mastery.aws-saa.initialized (Calibrator: reads baseline → emits mastery)
 *   4. bb.gaps.aws-saa.initial     (Surveyor: reads mastery + KG → emits gaps)
 *   5. bb.bridge.requested         (Gatekeeper: evaluates gaps → emits bridge request)
 *
 * NOTE: The integration story describes step 5 as bb.path.aws-saa.ready, but the
 * current Gatekeeper implementation emits bb.bridge.requested when a domain
 * transitions from not-ready to ready. bb.path.aws-saa.ready is not yet emitted
 * by any Sprint 1–3 agent. TODO: add path emission to Gatekeeper in a future sprint.
 *
 * @namespace dwell
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountDwell } from '../../mount.js';
import { MockBlackboard } from '../helpers/mock-blackboard.js';
import { MockNats } from '../helpers/mock-nats.js';
import { BB } from '../../events/subjects.js';
import type { DwellDeps, DwellHandle, Zipper } from '../../types.js';
import type {
  DwellEvidence,
  DwellMasteryInitialized,
  DwellGapsInitial,
  DwellBridgeRequested,
  DwellLearnerBaseline,
} from '../../events/types.js';

// ── Test domain ───────────────────────────────────────────────────────────

// @adopt:dwell-integration-test-domain  [resolved: aws-saa]
const DOMAIN = 'aws-saa';

// ── Mock graph factory ─────────────────────────────────────────────────────

/**
 * Smart mock graph that returns different data based on the Cypher query string:
 *   - Evidence query (from Antiquarian): returns DwellEvidence rows
 *   - KgNode query (from Surveyor):      returns { conceptId, bloomsTargetAltitude, examWeight } rows
 *
 * Evidence types: 'diagnosed' (altitude 4) → signalStrength 'strong' → Calibrator bloomsAltitude 4
 * KG target altitudes: 5 → gap=1 ('low' priority) → Gatekeeper ready → emits bridge.requested
 */
function createSmartMockGraph() {
  const evidence: DwellEvidence[] = [
    { evidenceId: 'ev-001', conceptId: 'iam-policies',   conceptDomain: DOMAIN, evidenceType: 'diagnosed', source: 'peach-bottom-nuclear-eop', occurredAt: '2023-01-15T00:00:00Z' },
    { evidenceId: 'ev-002', conceptId: 'iam-roles',      conceptDomain: DOMAIN, evidenceType: 'diagnosed', source: 'peach-bottom-nuclear-eop', occurredAt: '2023-01-15T00:00:00Z' },
    { evidenceId: 'ev-003', conceptId: 'vpc-routing',    conceptDomain: DOMAIN, evidenceType: 'applied',   source: 'networking-course',        occurredAt: '2023-06-01T00:00:00Z' },
    { evidenceId: 'ev-004', conceptId: 'ec2-compute',    conceptDomain: DOMAIN, evidenceType: 'applied',   source: 'aws-training',             occurredAt: '2024-01-01T00:00:00Z' },
    { evidenceId: 'ev-005', conceptId: 's3-storage',     conceptDomain: DOMAIN, evidenceType: 'explained', source: 'self-study',               occurredAt: '2024-02-01T00:00:00Z' },
  ];

  // KG nodes: target altitude 5, so with strong-signal (altitude 4) → gap=1 (low priority) → ready
  // With weak-signal (altitude 2) → gap=3 (high priority) → NOT ready, so we use 'low' for readiness
  // iam-policies / iam-roles: strong (alt 4) → target 5, gap=1 → low
  // vpc-routing: weak (alt 2) → target 3, gap=1 → low
  // ec2-compute: weak (alt 2) → target 3, gap=1 → low
  // s3-storage: weak (alt 2) → target 3, gap=1 → low
  const kgNodes = [
    { conceptId: 'iam-policies',  bloomsTargetAltitude: 5, examWeight: 0.12 },
    { conceptId: 'iam-roles',     bloomsTargetAltitude: 5, examWeight: 0.10 },
    { conceptId: 'vpc-routing',   bloomsTargetAltitude: 3, examWeight: 0.09 },
    { conceptId: 'ec2-compute',   bloomsTargetAltitude: 3, examWeight: 0.08 },
    { conceptId: 's3-storage',    bloomsTargetAltitude: 3, examWeight: 0.11 },
  ];

  return {
    query: async (cypher: string, _params?: Record<string, unknown>): Promise<unknown[]> => {
      if (cypher.includes('Evidence')) {
        // Antiquarian evidence query
        return evidence;
      }
      if (cypher.includes('KgNode')) {
        // Surveyor KG node query
        return kgNodes;
      }
      return [];
    },
  };
}

// ── Test helpers ───────────────────────────────────────────────────────────

function createMockZipper(): Zipper {
  return {
    registerTool:   () => {},
    unregisterTool: () => {},
  };
}

/**
 * Wait for a specific NATS event to be captured, polling until timeout.
 * Returns the event data when found, rejects on timeout.
 */
function waitForEvent(
  nats: MockNats,
  subject: string,
  timeoutMs: number = 2000, // @adopt:dwell-integration-chain-timeout  [resolved: 2000]
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    // Register a subscriber BEFORE checking existing events (race-free)
    const unsub = nats.subscribe(subject, (data) => {
      unsub();
      resolve(data);
    });

    // Check if event already captured before subscribe registered
    const existing = nats.eventsFor(subject);
    if (existing.length > 0) {
      unsub();
      resolve(existing[0].data);
      return;
    }

    // Safety timeout
    const timer = setTimeout(() => {
      unsub();
      reject(new Error(`Timeout waiting for event on subject: ${subject} (after ${timeoutMs}ms)`));
    }, Math.max(deadline - Date.now(), 0));

    // Silence unhandled rejection if someone else resolves first
    void timer;
  });
}

/**
 * Wait for N events matching subject, in order.
 */
function waitForNEvents(
  nats: MockNats,
  subjects: string[],
  timeoutMs: number = 2000,
): Promise<unknown[]> {
  return Promise.all(subjects.map((s) => waitForEvent(nats, s, timeoutMs)));
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Scene 1 — Full chain: intent declared → gap analysis', () => {
  let bb:     MockBlackboard;
  let nats:   MockNats;
  let handle: DwellHandle;

  beforeEach(async () => {
    bb   = new MockBlackboard();
    nats = new MockNats();

    const deps: DwellDeps = {
      bb,
      nats,
      zipper: createMockZipper(),
      graph:  createSmartMockGraph(),
    };

    handle = await mountDwell(deps);
  });

  afterEach(async () => {
    await handle.dispose();
  });

  // ── Full chain ───────────────────────────────────────────────────────────

  it('all 5 chain events fire within 2000ms', async () => {
    const chainSubjects = [
      BB.LEARNER_BASELINE(DOMAIN),
      BB.MASTERY_INITIALIZED(DOMAIN),
      BB.GAPS_INITIAL(DOMAIN),
      BB.BRIDGE_REQUESTED,
    ];

    // Start waiting for chain events BEFORE firing the trigger
    const chainPromise = waitForNEvents(nats, chainSubjects, 2000);

    // Fire the trigger
    nats.publish(BB.INTENT_DECLARED, {
      intent:      DOMAIN,
      declaredAt:  new Date().toISOString(),
    });

    // Wait for all chain events
    const results = await chainPromise;
    expect(results).toHaveLength(chainSubjects.length);
  });

  it('chain events fire in the correct order', async () => {
    // Wait for the final event so the chain has fully settled
    const finalEventPromise = waitForEvent(nats, BB.BRIDGE_REQUESTED, 2000);

    nats.publish(BB.INTENT_DECLARED, {
      intent:     DOMAIN,
      declaredAt: new Date().toISOString(),
    });

    await finalEventPromise;

    // Use nats.events (capture-time order) rather than subscriber-fire order.
    // Agent handlers are registered before test subscribers and run first inside
    // a single publish call, so subscriber-fire order is unreliable for ordering tests.
    const chainSubjects = [
      BB.LEARNER_BASELINE(DOMAIN),
      BB.MASTERY_INITIALIZED(DOMAIN),
      BB.GAPS_INITIAL(DOMAIN),
      BB.BRIDGE_REQUESTED,
    ];

    // Filter nats.events to only chain subjects (in publication order)
    const publishedOrder = nats.events
      .map((e) => e.subject)
      .filter((s) => chainSubjects.includes(s));

    expect(publishedOrder).toEqual(chainSubjects);
  });

  // ── Step 2: bb.learner.<domain>.baseline ────────────────────────────────

  it('bb.learner.aws-saa.baseline is emitted with correct domain', async () => {
    const baselinePromise = waitForEvent(nats, BB.LEARNER_BASELINE(DOMAIN), 2000);

    nats.publish(BB.INTENT_DECLARED, {
      intent:     DOMAIN,
      declaredAt: new Date().toISOString(),
    });

    const baseline = (await baselinePromise) as DwellLearnerBaseline;
    expect(baseline.domain).toBe(DOMAIN);
    expect(baseline.nodes).toBeDefined();
    expect(Array.isArray(baseline.nodes)).toBe(true);
  });

  it('bb.learner.aws-saa.baseline includes concept nodes from evidence', async () => {
    const baselinePromise = waitForEvent(nats, BB.LEARNER_BASELINE(DOMAIN), 2000);

    nats.publish(BB.INTENT_DECLARED, {
      intent:     DOMAIN,
      declaredAt: new Date().toISOString(),
    });

    const baseline = (await baselinePromise) as DwellLearnerBaseline;
    // Evidence contains 5 distinct conceptIds — baseline should have 5 nodes
    expect(baseline.nodes.length).toBeGreaterThan(0);
    const conceptIds = baseline.nodes.map((n) => n.conceptId);
    expect(conceptIds).toContain('iam-policies');
    expect(conceptIds).toContain('iam-roles');
  });

  // ── Step 3: bb.mastery.<domain>.initialized ──────────────────────────────

  it('bb.mastery.aws-saa.initialized has overallReadiness between 0 and 1', async () => {
    const masteryPromise = waitForEvent(nats, BB.MASTERY_INITIALIZED(DOMAIN), 2000);

    nats.publish(BB.INTENT_DECLARED, {
      intent:     DOMAIN,
      declaredAt: new Date().toISOString(),
    });

    const mastery = (await masteryPromise) as DwellMasteryInitialized;
    expect(mastery.overallReadiness).toBeGreaterThanOrEqual(0);
    expect(mastery.overallReadiness).toBeLessThanOrEqual(1);
  });

  it('bb.mastery.aws-saa.initialized has correct domain and non-empty nodes', async () => {
    const masteryPromise = waitForEvent(nats, BB.MASTERY_INITIALIZED(DOMAIN), 2000);

    nats.publish(BB.INTENT_DECLARED, {
      intent:     DOMAIN,
      declaredAt: new Date().toISOString(),
    });

    const mastery = (await masteryPromise) as DwellMasteryInitialized;
    expect(mastery.domain).toBe(DOMAIN);
    expect(mastery.nodes.length).toBeGreaterThan(0);

    // Each mastery node must have a valid bloomsAltitude [0–6]
    for (const node of mastery.nodes) {
      expect(node.bloomsAltitude).toBeGreaterThanOrEqual(0);
      expect(node.bloomsAltitude).toBeLessThanOrEqual(6);
      expect(node.confidence).toBeGreaterThanOrEqual(0);
      expect(node.confidence).toBeLessThanOrEqual(1);
    }
  });

  // ── Step 4: bb.gaps.<domain>.initial ────────────────────────────────────

  it('bb.gaps.aws-saa.initial has at least one cluster', async () => {
    const gapsPromise = waitForEvent(nats, BB.GAPS_INITIAL(DOMAIN), 2000);

    nats.publish(BB.INTENT_DECLARED, {
      intent:     DOMAIN,
      declaredAt: new Date().toISOString(),
    });

    const gaps = (await gapsPromise) as DwellGapsInitial;
    expect(gaps.domain).toBe(DOMAIN);
    expect(gaps.clusters.length).toBeGreaterThanOrEqual(1);
  });

  it('bb.gaps.aws-saa.initial clusters have valid priority values', async () => {
    const gapsPromise = waitForEvent(nats, BB.GAPS_INITIAL(DOMAIN), 2000);

    nats.publish(BB.INTENT_DECLARED, {
      intent:     DOMAIN,
      declaredAt: new Date().toISOString(),
    });

    const gaps = (await gapsPromise) as DwellGapsInitial;
    for (const cluster of gaps.clusters) {
      expect(['high', 'medium', 'low']).toContain(cluster.priority);
      expect(cluster.conceptIds.length).toBeGreaterThan(0);
    }
  });

  // ── Step 5: bb.bridge.requested ──────────────────────────────────────────
  //
  // NOTE: The integration story describes this as bb.path.<domain>.ready, but
  // the current Gatekeeper implementation emits bb.bridge.requested when a domain
  // has no high-priority gaps (i.e. it becomes "ready").
  // TODO: extend Gatekeeper to also emit bb.path.<domain>.ready in a future sprint.

  it('bb.bridge.requested fires when gaps are all low/medium priority', async () => {
    const bridgePromise = waitForEvent(nats, BB.BRIDGE_REQUESTED, 2000);

    nats.publish(BB.INTENT_DECLARED, {
      intent:     DOMAIN,
      declaredAt: new Date().toISOString(),
    });

    const bridgeReq = (await bridgePromise) as DwellBridgeRequested;
    expect(bridgeReq.domain).toBe(DOMAIN);
    expect(bridgeReq.conceptIds).toBeDefined();
    expect(Array.isArray(bridgeReq.conceptIds)).toBe(true);
  });

  // ── AntiquarianSnapshot written to BB ────────────────────────────────────

  it('AntiquarianSnapshot is written to BB after baseline emission', async () => {
    // Wait for the full chain so snapshot has been written
    const finalPromise = waitForEvent(nats, BB.BRIDGE_REQUESTED, 2000);

    nats.publish(BB.INTENT_DECLARED, {
      intent:     DOMAIN,
      declaredAt: new Date().toISOString(),
    });

    await finalPromise;

    const snapshot = await bb.read('dwell.antiquarian.snapshot');
    expect(snapshot).not.toBeNull();
    expect((snapshot as { domain: string }).domain).toBe(DOMAIN);
  });

  // ── Timing ───────────────────────────────────────────────────────────────

  it('entire chain completes within 2000ms', async () => {
    const start = Date.now();

    const finalPromise = waitForEvent(nats, BB.BRIDGE_REQUESTED, 2000);

    nats.publish(BB.INTENT_DECLARED, {
      intent:     DOMAIN,
      declaredAt: new Date().toISOString(),
    });

    await finalPromise;

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });
});
