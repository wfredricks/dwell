import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import { DwellZipperIntertwin } from '../agents/zipper-intertwin/index.js';
import { DwellChannelRegistry } from '../agents/zipper-intertwin/channel-registry.js';
import type { DwellDeps, NatsClient } from '../types.js';
import type {
  DwellAssessmentNeed,
  DwellBridgeNeed,
  DwellDiscoveryNeed,
  DwellDomainUpdatedBroadcast,
  DwellKgNeed,
  DwellOutcomeSignalNeed,
} from '../events/types.js';
import type { DwellBBTool } from '../bbtools/contract.js';
import { BB, DWELL } from '../events/subjects.js';

// ── Test helpers ───────────────────────────────────────────────────────────

function makeDeps(overrides?: Partial<DwellDeps>): DwellDeps {
  const nats: NatsClient = {
    publish: vi.fn(),
    subscribe: vi.fn().mockImplementation(() => vi.fn()),
  };
  return {
    nats,
    graph: { query: vi.fn().mockResolvedValue([]) },
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

/** Get the handler registered for a specific subscribe subject (exact match). */
function getHandler(
  deps: DwellDeps,
  subject: string,
): (data: unknown) => void | Promise<void> {
  const calls = (deps.nats.subscribe as ReturnType<typeof vi.fn>).mock
    .calls as [string, (data: unknown) => void][];
  const match = calls.find(([s]) => s === subject);
  if (!match) throw new Error(`No subscribe call found for subject: ${subject}`);
  return match[1];
}

function makeBBTool(overrides: Partial<DwellBBTool['identity']> = {}): DwellBBTool {
  return {
    identity: {
      twinId: 'twin-aws-saa',
      domain: 'aws',
      name: 'AWS SAA Domain Twin',
      version: '1.0.0',
      certName: 'SAA',
      coverage: 0.9,
      qualityScore: 0.8,
      crossDomainSupport: [],
      ...overrides,
    },
    tools: {
      getKnowledgeGraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
      queryBridge: vi.fn().mockResolvedValue({ candidates: [] }),
      requestAssessment: vi.fn().mockResolvedValue({ items: [] }),
      requestUpdate: vi.fn().mockResolvedValue({ affectedConcepts: [] }),
      receiveOutcomeSignal: vi.fn().mockResolvedValue(undefined),
    },
  };
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

describe('DwellZipperIntertwin lifecycle', () => {
  let deps: DwellDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('mounts cleanly — registers expected NATS subscriptions', () => {
    const zipper = new DwellZipperIntertwin(deps);
    zipper.mount();

    const subjects = (deps.nats.subscribe as ReturnType<typeof vi.fn>).mock.calls.map(
      ([s]: [string]) => s,
    );
    expect(subjects).toContain(BB.NEED('discovery'));
    expect(subjects).toContain(BB.NEED('kg'));
    expect(subjects).toContain(BB.NEED('bridge'));
    expect(subjects).toContain(BB.NEED('assessment'));
    expect(subjects).toContain(BB.NEED('outcome-signal'));
    expect(subjects).toContain(DWELL.DOMAIN_UPDATED_PATTERN);
  });

  it('disposes cleanly — calls all unsubscribe functions', () => {
    const unsub1 = vi.fn();
    const unsub2 = vi.fn();
    let callCount = 0;
    (deps.nats.subscribe as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      return callCount === 1 ? unsub1 : unsub2;
    });

    const zipper = new DwellZipperIntertwin(deps);
    zipper.mount();
    zipper.dispose();

    expect(unsub1).toHaveBeenCalled();
    expect(unsub2).toHaveBeenCalled();
  });

  it('exposes a DwellChannelRegistry as .registry', () => {
    const zipper = new DwellZipperIntertwin(deps);
    expect(zipper.registry).toBeInstanceOf(DwellChannelRegistry);
  });
});

// ── bb.need.discovery routing ──────────────────────────────────────────────

describe('DwellZipperIntertwin — bb.need.discovery routing', () => {
  it(
    'broadcasts discovery and posts bb.contribution.discovery with collected responses',
    async () => {
      const deps = makeDeps();
      const mockResponse = {
        twinId: 'twin-aws',
        domain: 'aws',
        certName: 'SAA',
        coverage: 0.9,
        qualityScore: 0.8,
        crossDomainSupport: [],
        version: '1.0.0',
      };

      // When the Zipper subscribes to USER_DISCOVERY_RESPONSE, schedule an
      // immediate mock Domain Twin response via a microtask.
      (deps.nats.subscribe as ReturnType<typeof vi.fn>).mockImplementation(
        (subject: string, handler: (data: unknown) => void) => {
          if (subject === DWELL.USER_DISCOVERY_RESPONSE('user-123')) {
            // Fire the mock response on the next tick so the subscription is set up
            setTimeout(() => handler(mockResponse), 0);
          }
          return vi.fn();
        },
      );

      const zipper = new DwellZipperIntertwin(deps);
      zipper.mount();

      // Use a very short timeout so the test completes quickly with real timers.
      const need: DwellDiscoveryNeed = {
        userId: 'user-123',
        intent: 'Learn AWS SAA',
        sourceKnowledge: [],
        timeoutMs: 50, // @adopt:dwell-test-discovery-timeout  [resolved: 50]
      };

      const handler = getHandler(deps, BB.NEED('discovery'));
      await handler(need);

      // Should have published BROADCAST_DISCOVERY
      expect(deps.nats.publish).toHaveBeenCalledWith(
        DWELL.BROADCAST_DISCOVERY,
        expect.objectContaining({ intent: 'Learn AWS SAA' }),
      );

      // Should have posted bb.contribution.discovery with the collected response
      expect(deps.nats.publish).toHaveBeenCalledWith(
        BB.CONTRIBUTION('discovery'),
        expect.objectContaining({
          intent: 'Learn AWS SAA',
          responses: [mockResponse],
        }),
      );
    },
    500,
  );

  it(
    'fires bb.domain-gap when no Domain Twins respond',
    async () => {
      const deps = makeDeps();
      const zipper = new DwellZipperIntertwin(deps);
      zipper.mount();

      const need: DwellDiscoveryNeed = {
        userId: 'user-456',
        intent: 'Learn Quantum Computing',
        sourceKnowledge: [],
        timeoutMs: 50, // @adopt:dwell-test-discovery-timeout  [resolved: 50]
      };

      const handler = getHandler(deps, BB.NEED('discovery'));
      await handler(need);

      // Should fire domain gap (first-class finding, not an error)
      expect(deps.nats.publish).toHaveBeenCalledWith(
        DWELL.USER_DOMAIN_GAP('user-456'),
        expect.objectContaining({ intent: 'Learn Quantum Computing' }),
      );

      // Should still post bb.contribution.discovery with empty responses
      expect(deps.nats.publish).toHaveBeenCalledWith(
        BB.CONTRIBUTION('discovery'),
        expect.objectContaining({ responses: [] }),
      );
    },
    500,
  );
});

// ── bb.need.kg routing ─────────────────────────────────────────────────────

describe('DwellZipperIntertwin — bb.need.kg routing', () => {
  it('routes bb.need.kg to callDomainTwin with getKnowledgeGraph and posts contribution', async () => {
    vi.useFakeTimers();

    const deps = makeDeps();
    const kgResult = {
      twinId: 'twin-aws',
      domain: 'aws',
      graph: { nodes: [{ conceptId: 'c1' }], edges: [] },
      curatedBatches: [],
      misconceptionCatalog: [],
    };

    // When Zipper subscribes to USER_KG_DELIVERED, capture handler and simulate response
    let kgReplyHandler: ((data: unknown) => void) | null = null;
    (deps.nats.subscribe as ReturnType<typeof vi.fn>).mockImplementation(
      (subject: string, handler: (data: unknown) => void) => {
        if (subject === DWELL.USER_KG_DELIVERED('user-789')) {
          kgReplyHandler = handler;
        }
        return vi.fn();
      },
    );

    const zipper = new DwellZipperIntertwin(deps);
    zipper.mount();

    const need: DwellKgNeed = {
      userId: 'user-789',
      twinId: 'twin-aws',
      request: { learnerBaseline: [] },
    };

    const handler = getHandler(deps, BB.NEED('kg'));
    const handlerPromise = handler(need) as Promise<void>;

    // Simulate Domain Twin responding
    if (kgReplyHandler) {
      (kgReplyHandler as (data: unknown) => void)(kgResult);
    }

    vi.advanceTimersByTime(100);
    await handlerPromise;

    // Should have published to TWIN_KG_REQUEST
    expect(deps.nats.publish).toHaveBeenCalledWith(
      DWELL.TWIN_KG_REQUEST('twin-aws'),
      need.request,
    );

    // Should have posted bb.contribution.kg
    expect(deps.nats.publish).toHaveBeenCalledWith(BB.CONTRIBUTION('kg'), kgResult);

    vi.useRealTimers();
  });
});

// ── fireOutcomeSignal carries no PII ─────────────────────────────────────

describe('DwellZipperIntertwin — outcome signal has no PII', () => {
  it('fireOutcomeSignal payload carries no userId, email, or name', async () => {
    const deps = makeDeps();
    const zipper = new DwellZipperIntertwin(deps);
    zipper.mount();

    const need: DwellOutcomeSignalNeed = {
      twinId: 'twin-aws',
      signal: {
        conceptId: 'c-iam-001',
        interactionType: 'learning-node',
        bridgeId: null,
        itemId: null,
        sourceDomains: ['networking'],
        outcome: 'engaged',
        bloomsAltitudeAtInteraction: 2,
        occurredAt: new Date().toISOString(),
      },
    };

    const handler = getHandler(deps, BB.NEED('outcome-signal'));
    await handler(need);

    // Find the publish call to the outcome signal subject
    const publishCalls = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls as [
      string,
      unknown,
    ][];
    const outcomeCall = publishCalls.find(([subject]) =>
      subject === DWELL.TWIN_OUTCOME_SIGNAL('twin-aws'),
    );

    expect(outcomeCall).toBeDefined();
    const payload = outcomeCall![1] as Record<string, unknown>;

    // No PII fields
    expect(payload).not.toHaveProperty('userId');
    expect(payload).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('name');
    expect(payload).not.toHaveProperty('firstName');
    expect(payload).not.toHaveProperty('lastName');
  });
});

// ── dwell.domain.*.updated relay ──────────────────────────────────────────

describe('DwellZipperIntertwin — domain update relay', () => {
  it('relays dwell.domain.*.updated to bb.domain.{domain}.change-available', async () => {
    const deps = makeDeps();
    const zipper = new DwellZipperIntertwin(deps);
    zipper.mount();

    const broadcast: DwellDomainUpdatedBroadcast = {
      twinId: 'twin-aws',
      domain: 'aws',
      notifiedAt: new Date().toISOString(),
    };

    const handler = getHandler(deps, DWELL.DOMAIN_UPDATED_PATTERN);
    await handler(broadcast);

    expect(deps.nats.publish).toHaveBeenCalledWith(
      BB.DOMAIN_CHANGE_AVAILABLE('aws'),
      expect.objectContaining({ domain: 'aws' }),
    );
  });
});

// ── ZipperIsOnlyCrossBoundaryAgent invariant ──────────────────────────────

describe('ZipperIsOnlyCrossBoundaryAgent invariant', () => {
  it('no agent other than zipper-intertwin uses DWELL.* subjects', () => {
    // Grep all agent source files (excluding zipper-intertwin) for any dwell.* usage.
    const repoRoot = path.resolve(__dirname, '../..');
    const agentsDir = path.join(repoRoot, 'src/agents');

    let output = '';
    try {
      // Search for DWELL subject usages in Personal Twin agents.
      // Excludes:
      //   zipper-intertwin — the designated boundary-crosser
      //   domain-twin      — Domain Twin implementations legitimately use DWELL subjects;
      //                       they ARE the other side of the boundary
      output = execSync(
        `grep -rn "DWELL\\." ${agentsDir} --include="*.ts" ` +
          `--exclude-dir=zipper-intertwin --exclude-dir=domain-twin 2>/dev/null || true`,
        { encoding: 'utf8', cwd: repoRoot },
      );
    } catch {
      // grep returns non-zero when no matches — that's the desired outcome
      output = '';
    }

    if (output.trim()) {
      throw new Error(
        `ZipperIsOnlyCrossBoundaryAgent VIOLATED:\n` +
          `The following non-Zipper agent files reference DWELL.* subjects:\n${output}`,
      );
    }

    expect(output.trim()).toBe('');
  });
});

// ── DwellChannelRegistry ──────────────────────────────────────────────────

describe('DwellChannelRegistry', () => {
  it('registers and finds a BBTool by twinId', () => {
    const registry = new DwellChannelRegistry();
    const tool = makeBBTool();
    registry.register(tool);
    expect(registry.find('twin-aws-saa')).toBe(tool);
  });

  it('register returns a deregister function that removes the tool', () => {
    const registry = new DwellChannelRegistry();
    const tool = makeBBTool();
    const deregister = registry.register(tool);
    deregister();
    expect(registry.find('twin-aws-saa')).toBeUndefined();
  });

  it('re-registering the same twinId replaces the previous tool', () => {
    const registry = new DwellChannelRegistry();
    const tool1 = makeBBTool({ twinId: 'twin-aws-saa', version: '1.0.0' });
    const tool2 = makeBBTool({ twinId: 'twin-aws-saa', version: '2.0.0' });
    registry.register(tool1);
    registry.register(tool2);
    expect(registry.find('twin-aws-saa')).toBe(tool2);
  });

  it('deregister of stale tool does not remove the replacement', () => {
    const registry = new DwellChannelRegistry();
    const tool1 = makeBBTool({ twinId: 'twin-aws-saa', version: '1.0.0' });
    const tool2 = makeBBTool({ twinId: 'twin-aws-saa', version: '2.0.0' });
    const deregister1 = registry.register(tool1);
    registry.register(tool2);
    deregister1(); // stale deregister — should not remove tool2
    expect(registry.find('twin-aws-saa')).toBe(tool2);
  });

  it('findByDomain returns all twins covering that domain', () => {
    const registry = new DwellChannelRegistry();
    const tool1 = makeBBTool({ twinId: 'twin-aws-saa', domain: 'aws' });
    const tool2 = makeBBTool({ twinId: 'twin-aws-dva', domain: 'aws' });
    const tool3 = makeBBTool({ twinId: 'twin-gcp', domain: 'gcp' });
    registry.register(tool1);
    registry.register(tool2);
    registry.register(tool3);
    const awsTools = registry.findByDomain('aws');
    expect(awsTools).toHaveLength(2);
    expect(awsTools.map((t) => t.identity.twinId)).toContain('twin-aws-saa');
    expect(awsTools.map((t) => t.identity.twinId)).toContain('twin-aws-dva');
  });

  it('listRegistered returns identities of all registered twins', () => {
    const registry = new DwellChannelRegistry();
    const tool1 = makeBBTool({ twinId: 'twin-aws-saa' });
    const tool2 = makeBBTool({ twinId: 'twin-gcp', domain: 'gcp' });
    registry.register(tool1);
    registry.register(tool2);
    const identities = registry.listRegistered();
    expect(identities).toHaveLength(2);
    expect(identities.map((i) => i.twinId)).toContain('twin-aws-saa');
    expect(identities.map((i) => i.twinId)).toContain('twin-gcp');
  });
});
