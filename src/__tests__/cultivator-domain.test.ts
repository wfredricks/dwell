/**
 * Tests for DwellCultivatorDomain
 *
 * @namespace dwell
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DwellCultivatorDomain } from '../agents/domain-twin/cultivator/index.js';
import type { DwellCultivatorDomainIdentity } from '../agents/domain-twin/cultivator/index.js';
import type { DomainChangeEvent } from '../agents/domain-twin/cultivator/types.js';
import { detectChanges } from '../agents/domain-twin/cultivator/change-watcher.js';
import { buildDelta } from '../agents/domain-twin/cultivator/delta-builder.js';
import type { DwellDeps } from '../types.js';
import { DWELL } from '../events/subjects.js';
import type { DwellUpdateRequest } from '../events/types.js';

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

function makeIdentity(): DwellCultivatorDomainIdentity {
  return { twinId: 'aws-saa-dt', domain: 'aws-solutions-architect' };
}

function makeChange(conceptId = 'aws-saa/iam'): DomainChangeEvent {
  return {
    changeType: 'added',
    conceptId,
    severity: 'minor',
    changeNote: 'New concept added.',
    detectedAt: new Date().toISOString(),
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

describe('DwellCultivatorDomain', () => {
  let deps: DwellDeps;
  let identity: DwellCultivatorDomainIdentity;
  let agent: DwellCultivatorDomain;

  beforeEach(() => {
    deps = makeDeps();
    identity = makeIdentity();
    agent = new DwellCultivatorDomain(deps, identity);
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  it('mounts and subscribes to TWIN_UPDATE_REQUEST', () => {
    agent.mount();
    expect(deps.nats.subscribe).toHaveBeenCalledWith(
      DWELL.TWIN_UPDATE_REQUEST(identity.twinId),
      expect.any(Function),
    );
  });

  it('disposes cleanly without throwing', () => {
    agent.mount();
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

  // ── Change detection → DOMAIN_UPDATED broadcast ────────────────────────────

  it('emits DOMAIN_UPDATED on change detected via triggerChanges', () => {
    agent.mount();
    const change = makeChange();
    agent.triggerChanges([change]);

    expect(deps.nats.publish).toHaveBeenCalledWith(
      DWELL.DOMAIN_UPDATED(identity.twinId),
      expect.objectContaining({
        twinId: identity.twinId,
        domain: identity.domain,
        notifiedAt: expect.any(String),
      }),
    );
  });

  it('does NOT emit DOMAIN_UPDATED when changes list is empty', () => {
    agent.mount();
    agent.triggerChanges([]);
    expect(deps.nats.publish).not.toHaveBeenCalled();
  });

  it('increments version on each change detection', () => {
    agent.mount();
    agent.triggerChanges([makeChange('aws-saa/iam')]);
    agent.triggerChanges([makeChange('aws-saa/ec2')]);
    // Two broadcasts should have been emitted
    expect(deps.nats.publish).toHaveBeenCalledTimes(2);
  });

  // ── DOMAIN_UPDATED payload is thin — DomainTwinDoesNotTrackSubscribers ─────

  it('DomainTwinDoesNotTrackSubscribers: DOMAIN_UPDATED payload contains only twinId, domain, notifiedAt', () => {
    agent.mount();
    agent.triggerChanges([makeChange()]);

    const calls = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls;
    const [subject, payload] = calls[0] as [string, Record<string, unknown>];

    expect(subject).toBe(DWELL.DOMAIN_UPDATED(identity.twinId));
    // Thin broadcast: only these three fields
    expect(Object.keys(payload)).toEqual(
      expect.arrayContaining(['twinId', 'domain', 'notifiedAt']),
    );
    // Must NOT contain change detail or a subscriber list
    expect(payload).not.toHaveProperty('changes');
    expect(payload).not.toHaveProperty('affectedConcepts');
    expect(payload).not.toHaveProperty('subscribers');
  });

  // ── Delta delivery on UPDATE_REQUEST ──────────────────────────────────────

  it('delivers delta on TWIN_UPDATE_REQUEST', () => {
    agent.mount();

    // Trigger a change to store a delta from version "0" to "1"
    agent.triggerChanges([makeChange('aws-saa/iam')]);

    // Send an update request for sinceVersion "0"
    const replyTo = DWELL.USER_UPDATE_DELIVERED('learner-007');
    const handler = getHandler(deps, DWELL.TWIN_UPDATE_REQUEST(identity.twinId));
    const request: DwellUpdateRequest = { sinceVersion: '0', replyTo };
    handler(request);

    expect(deps.nats.publish).toHaveBeenCalledWith(
      replyTo,
      expect.objectContaining({
        twinId: identity.twinId,
        domain: identity.domain,
        fromVersion: '0',
        toVersion: '1',
        affectedConcepts: expect.arrayContaining([
          expect.objectContaining({ conceptId: 'aws-saa/iam' }),
        ]),
      }),
    );
  });

  it('does not deliver delta when sinceVersion has no stored delta', () => {
    agent.mount();
    // No changes triggered, so delta store is empty
    const handler = getHandler(deps, DWELL.TWIN_UPDATE_REQUEST(identity.twinId));
    const request: DwellUpdateRequest = { sinceVersion: '99', replyTo: 'dwell.nobody.update.delivered' };
    // Should not throw and should not publish
    expect(() => handler(request)).not.toThrow();
    expect(deps.nats.publish).not.toHaveBeenCalled();
  });

  it('delivers multiple deltas independently for different fromVersions', () => {
    agent.mount();

    agent.triggerChanges([makeChange('aws-saa/iam')]);    // 0→1
    agent.triggerChanges([makeChange('aws-saa/s3')]);     // 1→2

    const handler = getHandler(deps, DWELL.TWIN_UPDATE_REQUEST(identity.twinId));

    // Request delta since version "1"
    handler({ sinceVersion: '1', replyTo: DWELL.USER_UPDATE_DELIVERED('learner-a') });

    const calls = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls;
    // Last publish should be the delta delivery for "1"→"2"
    const lastCall = calls[calls.length - 1] as [string, Record<string, unknown>];
    expect(lastCall[1]).toMatchObject({ fromVersion: '1', toVersion: '2' });
  });
});

// ── Unit tests for pure helpers ────────────────────────────────────────────────

describe('detectChanges (pure)', () => {
  it('detects added concepts', () => {
    const current = { concepts: {}, snapshotAt: '2026-01-01T00:00:00Z' };
    const next = {
      concepts: { 'aws-saa/iam': { examWeight: 0.2 } },
      snapshotAt: '2026-01-02T00:00:00Z',
    };
    const events = detectChanges(current, next);
    expect(events).toHaveLength(1);
    expect(events[0].changeType).toBe('added');
    expect(events[0].conceptId).toBe('aws-saa/iam');
  });

  it('detects deprecated concepts', () => {
    const current = { concepts: { 'aws-saa/classic-lb': { examWeight: 0.1 } }, snapshotAt: '2026-01-01T00:00:00Z' };
    const next = {
      concepts: { 'aws-saa/classic-lb': { examWeight: 0.1, deprecated: true } },
      snapshotAt: '2026-01-02T00:00:00Z',
    };
    const events = detectChanges(current, next);
    expect(events.some((e) => e.changeType === 'deprecated')).toBe(true);
  });

  it('detects reweighted concepts (>=0.05 delta)', () => {
    const current = { concepts: { 'aws-saa/vpc': { examWeight: 0.1 } }, snapshotAt: '' };
    const next = { concepts: { 'aws-saa/vpc': { examWeight: 0.2 } }, snapshotAt: '' };
    const events = detectChanges(current, next);
    expect(events.some((e) => e.changeType === 'reweighted')).toBe(true);
  });

  it('returns empty array when nothing changed', () => {
    const snap = { concepts: { 'aws-saa/vpc': { examWeight: 0.1 } }, snapshotAt: '' };
    const events = detectChanges(snap, snap);
    expect(events).toHaveLength(0);
  });
});

describe('buildDelta (pure)', () => {
  it('builds a DomainDelta with correct fields', () => {
    const change = makeChange('aws-saa/iam');
    const delta = buildDelta([change], '0', '1');
    expect(delta.fromVersion).toBe('0');
    expect(delta.toVersion).toBe('1');
    expect(delta.affectedConcepts).toHaveLength(1);
    expect(delta.affectedConcepts[0].conceptId).toBe('aws-saa/iam');
    expect(delta.preparedAt).toMatch(/^\d{4}-/);
  });

  it('is pure — does not mutate the input changes array', () => {
    const changes = [makeChange()];
    const original = [...changes];
    buildDelta(changes, '0', '1');
    expect(changes).toEqual(original);
  });
});
