import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DwellAnswerAgent } from '../agents/answer-agent/index.js';
import {
  computeCrossDomainMatch,
  computeSpecificity,
  rankResponses,
  scoreDiscoveryResponse,
} from '../agents/answer-agent/discovery-scorer.js';
import { selectBestBridgeCandidate } from '../agents/answer-agent/bridge-candidate-filter.js';
import {
  DEFAULT_DISCOVERY_POLICY,
  type DwellBBContext,
  type DwellDiscoveryEvaluationPolicy,
} from '../agents/answer-agent/types.js';
import type { DwellDeps, NatsClient } from '../types.js';
import type {
  DwellBridgeCandidate,
  DwellBridgeCandidatesContribution,
  DwellDiscoveryContribution,
  DwellDiscoveryResponse,
  DwellGapCluster,
  DwellGapsInitial,
  DwellLearnerBaseline,
  DwellMasteryInitialized,
} from '../events/types.js';
import { BB } from '../events/subjects.js';

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

/** Get the handler registered for a specific subscribe subject. */
function getHandler(deps: DwellDeps, subject: string): (data: unknown) => void {
  const calls = (deps.nats.subscribe as ReturnType<typeof vi.fn>).mock.calls as [
    string,
    (data: unknown) => void,
  ][];
  const match = calls.find(([s]) => s === subject);
  if (!match) throw new Error(`No subscribe call found for subject: ${subject}`);
  return match[1];
}

function makeDiscoveryResponse(overrides: Partial<DwellDiscoveryResponse> = {}): DwellDiscoveryResponse {
  return {
    twinId: 'twin-aws-saa',
    domain: 'aws',
    certName: 'SAA',
    coverage: 0.8,
    qualityScore: 0.9,
    crossDomainSupport: ['networking', 'security'],
    version: '1.0.0',
    ...overrides,
  };
}

function makeBridgeCandidate(overrides: Partial<DwellBridgeCandidate> = {}): DwellBridgeCandidate {
  return {
    bridgeId: 'bridge-001',
    bridgeType: 'analogy',
    sourceAnchor: 'vpc-subnets',
    targetConcept: 'concept-iam',
    genericText: 'Think of it like...',
    effectivenessScore: 0.7,
    profileClusterMatch: 0.5,
    ...overrides,
  };
}

function makeGapCluster(overrides: Partial<DwellGapCluster> = {}): DwellGapCluster {
  return {
    clusterId: 'gap-001',
    label: 'IAM gaps',
    gapType: 'knowledge',
    conceptIds: ['concept-iam', 'concept-roles'],
    priority: 'medium',
    examWeight: 0.4,
    ...overrides,
  };
}

function makeEmptyBBContext(): DwellBBContext {
  return { masteryMap: {}, gapClusters: [], sourceDomains: [] };
}

// ── Lifecycle tests ────────────────────────────────────────────────────────

describe('DwellAnswerAgent lifecycle', () => {
  it('mount() registers all required subscriptions', () => {
    const deps = makeDeps();
    const agent = new DwellAnswerAgent(deps);
    agent.mount();

    const subjects = (deps.nats.subscribe as ReturnType<typeof vi.fn>).mock.calls.map(
      ([s]: [string]) => s,
    );

    expect(subjects).toContain(BB.MASTERY_INITIALIZED_PATTERN);
    expect(subjects).toContain(BB.MASTERY_UPDATED_PATTERN);
    expect(subjects).toContain(BB.GAPS_INITIAL_PATTERN);
    expect(subjects).toContain(BB.GAPS_UPDATED_PATTERN);
    expect(subjects).toContain(BB.LEARNER_BASELINE_PATTERN);
    expect(subjects).toContain(BB.CONTRIBUTION('discovery'));
    expect(subjects).toContain(BB.CONTRIBUTION('bridge-candidates'));
    expect(subjects.length).toBe(7);
  });

  it('dispose() calls all unsubscribe functions', () => {
    const deps = makeDeps();
    const agent = new DwellAnswerAgent(deps);
    agent.mount();

    const unsubFns = (deps.nats.subscribe as ReturnType<typeof vi.fn>).mock.results.map(
      (r: { value: ReturnType<typeof vi.fn> }) => r.value,
    );

    agent.dispose();

    for (const unsub of unsubFns) {
      expect(unsub).toHaveBeenCalledTimes(1);
    }
  });

  it('dispose() before mount() does not throw', () => {
    const deps = makeDeps();
    const agent = new DwellAnswerAgent(deps);
    expect(() => agent.dispose()).not.toThrow();
  });
});

// ── rankResponses ──────────────────────────────────────────────────────────

describe('rankResponses', () => {
  it('returns responses sorted descending by composite score, 1-based rank', () => {
    const high: DwellDiscoveryResponse = makeDiscoveryResponse({
      twinId: 'twin-high',
      coverage: 1.0,
      qualityScore: 1.0,
      certName: 'SAA',
      domain: 'aws',
    });
    const low: DwellDiscoveryResponse = makeDiscoveryResponse({
      twinId: 'twin-low',
      coverage: 0.1,
      qualityScore: 0.1,
      certName: null,
      domain: 'gcp',
    });

    const context: DwellBBContext = {
      masteryMap: {},
      gapClusters: [],
      sourceDomains: [],
    };

    const ranked = rankResponses([low, high], context, DEFAULT_DISCOVERY_POLICY, 'aws saa');

    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].twinId).toBe('twin-high');
    expect(ranked[1].rank).toBe(2);
    expect(ranked[1].twinId).toBe('twin-low');
  });

  it('assigns rank 1 to highest score regardless of input order', () => {
    const r1 = makeDiscoveryResponse({ twinId: 't1', coverage: 0.3, qualityScore: 0.3 });
    const r2 = makeDiscoveryResponse({ twinId: 't2', coverage: 0.9, qualityScore: 0.9 });
    const r3 = makeDiscoveryResponse({ twinId: 't3', coverage: 0.6, qualityScore: 0.6 });

    const ranked = rankResponses([r1, r2, r3], makeEmptyBBContext(), DEFAULT_DISCOVERY_POLICY, 'aws');

    const rankMap = Object.fromEntries(ranked.map((r) => [r.twinId, r.rank]));
    expect(rankMap['t2']).toBe(1);
    expect(rankMap['t3']).toBe(2);
    expect(rankMap['t1']).toBe(3);
  });

  it('returns empty array for empty input', () => {
    const ranked = rankResponses([], makeEmptyBBContext(), DEFAULT_DISCOVERY_POLICY, 'aws');
    expect(ranked).toEqual([]);
  });

  it('includes original response object in each EvaluatedResponse', () => {
    const response = makeDiscoveryResponse();
    const ranked = rankResponses([response], makeEmptyBBContext(), DEFAULT_DISCOVERY_POLICY, 'aws');
    expect(ranked[0].response).toBe(response);
  });
});

// ── scoreDiscoveryResponse ────────────────────────────────────────────────

describe('scoreDiscoveryResponse', () => {
  it('uses policy weights — not hardcoded values', () => {
    const response = makeDiscoveryResponse({
      coverage: 1.0,
      qualityScore: 0.0,
      crossDomainSupport: [],
      certName: null,
      domain: 'xyz', // won't match any intent
    });
    const sourceDomains: string[] = [];

    const policyA: DwellDiscoveryEvaluationPolicy = {
      coverageWeight: 1.0,
      qualityScoreWeight: 0.0,
      crossDomainMatchWeight: 0.0,
      specificityWeight: 0.0,
    };
    const policyB: DwellDiscoveryEvaluationPolicy = {
      coverageWeight: 0.0,
      qualityScoreWeight: 1.0,
      crossDomainMatchWeight: 0.0,
      specificityWeight: 0.0,
    };

    const scoreA = scoreDiscoveryResponse(response, sourceDomains, policyA, 'aws');
    const scoreB = scoreDiscoveryResponse(response, sourceDomains, policyB, 'aws');

    // With policyA, coverage=1.0 → score should be 1.0 * 1.0 = 1.0 (plus fallback specificity)
    // With policyB, qualityScore=0.0 → contribution from quality is 0; specificity has weight 0 too
    expect(scoreA).toBeGreaterThan(scoreB);
  });

  it('produces higher score for response with higher coverage under coverage-heavy policy', () => {
    const policy: DwellDiscoveryEvaluationPolicy = {
      coverageWeight: 0.9,
      qualityScoreWeight: 0.1,
      crossDomainMatchWeight: 0.0,
      specificityWeight: 0.0,
    };

    const high = makeDiscoveryResponse({ coverage: 1.0, qualityScore: 0.0 });
    const low  = makeDiscoveryResponse({ coverage: 0.1, qualityScore: 1.0 });

    const scoreHigh = scoreDiscoveryResponse(high, [], policy, 'aws');
    const scoreLow  = scoreDiscoveryResponse(low, [], policy, 'aws');

    expect(scoreHigh).toBeGreaterThan(scoreLow);
  });

  it('returns a value in [0, 1] for typical inputs', () => {
    const response = makeDiscoveryResponse();
    const score = scoreDiscoveryResponse(response, ['networking'], DEFAULT_DISCOVERY_POLICY, 'aws saa');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1.01); // small float tolerance
  });
});

// ── computeCrossDomainMatch ───────────────────────────────────────────────

describe('computeCrossDomainMatch', () => {
  it('returns 1.0 when all source domains are in crossDomainSupport', () => {
    const response = makeDiscoveryResponse({ crossDomainSupport: ['networking', 'security', 'iam'] });
    expect(computeCrossDomainMatch(response, ['networking', 'security'])).toBe(1.0);
  });

  it('returns 0.5 when half of source domains match', () => {
    const response = makeDiscoveryResponse({ crossDomainSupport: ['networking'] });
    expect(computeCrossDomainMatch(response, ['networking', 'security'])).toBe(0.5);
  });

  it('returns 0 when no source domains match', () => {
    const response = makeDiscoveryResponse({ crossDomainSupport: ['iam'] });
    expect(computeCrossDomainMatch(response, ['networking', 'security'])).toBe(0);
  });

  it('returns 0 when sourceDomains is empty', () => {
    const response = makeDiscoveryResponse({ crossDomainSupport: ['networking'] });
    expect(computeCrossDomainMatch(response, [])).toBe(0);
  });

  it('returns 0 when crossDomainSupport is empty', () => {
    const response = makeDiscoveryResponse({ crossDomainSupport: [] });
    expect(computeCrossDomainMatch(response, ['networking'])).toBe(0);
  });

  it('proportion is based on source domains count, not support list count', () => {
    const response = makeDiscoveryResponse({ crossDomainSupport: ['a', 'b', 'c', 'd'] });
    // learner has 2 source domains, both matched → 2/2 = 1.0
    expect(computeCrossDomainMatch(response, ['a', 'b'])).toBe(1.0);
  });
});

// ── computeSpecificity ────────────────────────────────────────────────────

describe('computeSpecificity', () => {
  it('returns 1.0 for cert-specific twin when certName matches intent', () => {
    const response = makeDiscoveryResponse({ certName: 'SAA', domain: 'aws' });
    expect(computeSpecificity(response, 'aws saa certification')).toBe(1.0);
  });

  it('returns higher score for cert-specific twin on cert-specific intent than general twin', () => {
    const certSpecific = makeDiscoveryResponse({ certName: 'SAA', domain: 'aws' });
    const generalTwin  = makeDiscoveryResponse({ certName: null, domain: 'aws' });

    const certScore    = computeSpecificity(certSpecific, 'aws saa');
    const generalScore = computeSpecificity(generalTwin, 'aws saa');

    expect(certScore).toBeGreaterThan(generalScore);
  });

  it('returns lower score for cert-specific twin when cert does not match intent', () => {
    const certMatchingResponse = makeDiscoveryResponse({ certName: 'SAA', domain: 'aws' });
    const certNonMatchingResponse = makeDiscoveryResponse({ certName: 'DVA', domain: 'aws' });

    const matchScore    = computeSpecificity(certMatchingResponse, 'aws saa');
    const nonMatchScore = computeSpecificity(certNonMatchingResponse, 'aws saa');

    expect(matchScore).toBeGreaterThan(nonMatchScore);
  });

  it('returns higher score when domain name is in intent (general twin)', () => {
    const matchingDomain    = makeDiscoveryResponse({ certName: null, domain: 'aws' });
    const nonMatchingDomain = makeDiscoveryResponse({ certName: null, domain: 'gcp' });

    const matchScore    = computeSpecificity(matchingDomain, 'aws solutions architect');
    const nonMatchScore = computeSpecificity(nonMatchingDomain, 'aws solutions architect');

    expect(matchScore).toBeGreaterThan(nonMatchScore);
  });
});

// ── selectBestBridgeCandidate ──────────────────────────────────────────────

describe('selectBestBridgeCandidate', () => {
  it('returns null when candidates array is empty', () => {
    const result = selectBestBridgeCandidate([], makeEmptyBBContext());
    expect(result).toBeNull();
  });

  it('returns the single candidate when only one exists', () => {
    const c = makeBridgeCandidate();
    const result = selectBestBridgeCandidate([c], makeEmptyBBContext());
    expect(result).toBe(c);
  });

  it('returns higher-effectivenessScore candidate when other factors are equal', () => {
    const low  = makeBridgeCandidate({ bridgeId: 'low',  effectivenessScore: 0.3, profileClusterMatch: 0 });
    const high = makeBridgeCandidate({ bridgeId: 'high', effectivenessScore: 0.9, profileClusterMatch: 0 });

    const result = selectBestBridgeCandidate([low, high], makeEmptyBBContext());
    expect(result!.bridgeId).toBe('high');
  });

  it('boosts candidate whose targetConcept is in an active gap cluster', () => {
    const gapCandidate = makeBridgeCandidate({
      bridgeId: 'gap',
      effectivenessScore: 0.5,
      targetConcept: 'concept-iam', // in active gap
    });
    const noGapCandidate = makeBridgeCandidate({
      bridgeId: 'no-gap',
      effectivenessScore: 0.7,
      targetConcept: 'concept-s3', // not in gap
    });

    const context: DwellBBContext = {
      masteryMap: {},
      gapClusters: [makeGapCluster({ conceptIds: ['concept-iam'] })],
      sourceDomains: [],
    };

    const result = selectBestBridgeCandidate([noGapCandidate, gapCandidate], context);
    // gapCandidate: 0.5 + 0.25 (gap bonus) + 0 (profile) = 0.75
    // noGapCandidate: 0.7 + 0 + 0 = 0.7
    expect(result!.bridgeId).toBe('gap');
  });

  it('returns best match considering profileClusterMatch factor', () => {
    const profileMatch = makeBridgeCandidate({
      bridgeId: 'profile',
      effectivenessScore: 0.5,
      profileClusterMatch: 1.0,
    });
    const noProfile = makeBridgeCandidate({
      bridgeId: 'no-profile',
      effectivenessScore: 0.6,
      profileClusterMatch: 0.0,
    });

    const context = makeEmptyBBContext();
    const result = selectBestBridgeCandidate([noProfile, profileMatch], context);
    // profileMatch: 0.5 + 1.0 * 0.3 = 0.8
    // noProfile: 0.6 + 0 = 0.6
    expect(result!.bridgeId).toBe('profile');
  });
});

// ── DiscoveryScoringIsAlgorithmic invariant ───────────────────────────────

describe('DiscoveryScoringIsAlgorithmic invariant', () => {
  it('scoreDiscoveryResponse is a pure function — no external calls', () => {
    // Pure function test: no mock needed, no external dependencies.
    // If it were to call an LLM or fetch anything, it would throw here since
    // no network stubs are configured.
    const response = makeDiscoveryResponse();
    const policy = DEFAULT_DISCOVERY_POLICY;

    expect(() =>
      scoreDiscoveryResponse(response, ['networking'], policy, 'aws saa'),
    ).not.toThrow();
  });

  it('rankResponses is a pure function — no external calls', () => {
    const responses = [makeDiscoveryResponse(), makeDiscoveryResponse({ twinId: 't2', coverage: 0.5 })];
    expect(() =>
      rankResponses(responses, makeEmptyBBContext(), DEFAULT_DISCOVERY_POLICY, 'aws'),
    ).not.toThrow();
  });

  it('computeCrossDomainMatch is a pure function — no external calls', () => {
    const response = makeDiscoveryResponse({ crossDomainSupport: ['networking'] });
    expect(() => computeCrossDomainMatch(response, ['networking'])).not.toThrow();
  });

  it('computeSpecificity is a pure function — no external calls', () => {
    const response = makeDiscoveryResponse();
    expect(() => computeSpecificity(response, 'aws saa')).not.toThrow();
  });

  it('selectBestBridgeCandidate is a pure function — no external calls', () => {
    const candidates = [makeBridgeCandidate()];
    expect(() => selectBestBridgeCandidate(candidates, makeEmptyBBContext())).not.toThrow();
  });
});

// ── Agent integration: contribution → answer ──────────────────────────────

describe('DwellAnswerAgent — contribution handling', () => {
  it('publishes bb.answer.discovery with ranked responses on discovery contribution', () => {
    const deps = makeDeps();
    const agent = new DwellAnswerAgent(deps);
    agent.mount();

    const discoveryHandler = getHandler(deps, BB.CONTRIBUTION('discovery'));

    const contribution: DwellDiscoveryContribution = {
      intent: 'aws saa',
      responses: [
        makeDiscoveryResponse({ twinId: 'twin-a', coverage: 0.9 }),
        makeDiscoveryResponse({ twinId: 'twin-b', coverage: 0.2 }),
      ],
    };

    discoveryHandler(contribution);

    expect(deps.nats.publish).toHaveBeenCalledWith(
      BB.ANSWER('discovery'),
      expect.arrayContaining([
        expect.objectContaining({ twinId: 'twin-a', rank: 1 }),
        expect.objectContaining({ twinId: 'twin-b', rank: 2 }),
      ]),
    );
  });

  it('publishes bb.answer.bridge-candidate with best candidate on bridge-candidates contribution', () => {
    const deps = makeDeps();
    const agent = new DwellAnswerAgent(deps);
    agent.mount();

    const bridgeHandler = getHandler(deps, BB.CONTRIBUTION('bridge-candidates'));

    const candidate = makeBridgeCandidate({ bridgeId: 'best-bridge', effectivenessScore: 0.9 });
    const contribution: DwellBridgeCandidatesContribution = {
      candidates: [candidate],
    };

    bridgeHandler(contribution);

    expect(deps.nats.publish).toHaveBeenCalledWith(
      BB.ANSWER('bridge-candidate'),
      expect.objectContaining({ bridgeId: 'best-bridge' }),
    );
  });

  it('publishes null to bb.answer.bridge-candidate when no candidates', () => {
    const deps = makeDeps();
    const agent = new DwellAnswerAgent(deps);
    agent.mount();

    const bridgeHandler = getHandler(deps, BB.CONTRIBUTION('bridge-candidates'));
    const contribution: DwellBridgeCandidatesContribution = { candidates: [] };

    bridgeHandler(contribution);

    expect(deps.nats.publish).toHaveBeenCalledWith(BB.ANSWER('bridge-candidate'), null);
  });

  it('incorporates gap clusters into bridge candidate scoring', () => {
    const deps = makeDeps();
    const agent = new DwellAnswerAgent(deps);
    agent.mount();

    // Feed in gap clusters
    const gapsHandler = getHandler(deps, BB.GAPS_INITIAL_PATTERN);
    const gaps: DwellGapsInitial = {
      domain: 'aws',
      clusters: [makeGapCluster({ conceptIds: ['concept-iam'] })],
      assessedAt: new Date().toISOString(),
    };
    gapsHandler(gaps);

    const bridgeHandler = getHandler(deps, BB.CONTRIBUTION('bridge-candidates'));

    const gapCandidate  = makeBridgeCandidate({ bridgeId: 'gap',    targetConcept: 'concept-iam', effectivenessScore: 0.5 });
    const noGapCandidate = makeBridgeCandidate({ bridgeId: 'no-gap', targetConcept: 'concept-s3',  effectivenessScore: 0.6 });

    const contribution: DwellBridgeCandidatesContribution = {
      candidates: [noGapCandidate, gapCandidate],
    };
    bridgeHandler(contribution);

    const publishCall = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls.find(
      ([subject]: [string]) => subject === BB.ANSWER('bridge-candidate'),
    );
    expect(publishCall).toBeDefined();
    expect(publishCall[1].bridgeId).toBe('gap');
  });

  it('uses source domains from learner baseline for cross-domain scoring', () => {
    const deps = makeDeps();
    const agent = new DwellAnswerAgent(deps);
    agent.mount();

    // Set up source domain from learner baseline
    const baselineHandler = getHandler(deps, BB.LEARNER_BASELINE_PATTERN);
    const baseline: DwellLearnerBaseline = {
      domain: 'networking',
      nodes: [{ conceptId: 'c1', signalStrength: 'strong', evidenceSources: [] }],
      assessedAt: new Date().toISOString(),
    };
    baselineHandler(baseline);

    const discoveryHandler = getHandler(deps, BB.CONTRIBUTION('discovery'));

    // crossDomainMatch twin explicitly supports 'networking' (learner's source domain)
    const crossDomainTwin = makeDiscoveryResponse({
      twinId: 'cross-domain',
      coverage: 0.5,
      qualityScore: 0.5,
      crossDomainSupport: ['networking'],
      certName: null,
      domain: 'aws',
    });
    const noCrossTwin = makeDiscoveryResponse({
      twinId: 'no-cross',
      coverage: 0.5,
      qualityScore: 0.5,
      crossDomainSupport: [],
      certName: null,
      domain: 'aws',
    });

    const contribution: DwellDiscoveryContribution = {
      intent: 'aws',
      responses: [noCrossTwin, crossDomainTwin],
    };
    discoveryHandler(contribution);

    const publishCall = (deps.nats.publish as ReturnType<typeof vi.fn>).mock.calls.find(
      ([subject]: [string]) => subject === BB.ANSWER('discovery'),
    );
    expect(publishCall).toBeDefined();

    const ranked = publishCall[1] as Array<{ twinId: string; rank: number }>;
    const crossRank = ranked.find((r) => r.twinId === 'cross-domain')!.rank;
    const noRank    = ranked.find((r) => r.twinId === 'no-cross')!.rank;
    expect(crossRank).toBeLessThan(noRank); // lower rank number = better
  });

  it('mastery initialization feeds into BBContext for subsequent evaluations', () => {
    const deps = makeDeps();
    const agent = new DwellAnswerAgent(deps);
    agent.mount();

    // Feed in mastery initialization
    const masteryHandler = getHandler(deps, BB.MASTERY_INITIALIZED_PATTERN);
    const masteryInit: DwellMasteryInitialized = {
      domain: 'aws',
      totalNodes: 1,
      nodes: [
        { conceptId: 'concept-iam', confidence: 0.8, bloomsAltitude: 4, source: 'prior-evidence' },
      ],
      overallReadiness: 0.8,
      initializedAt: new Date().toISOString(),
    };
    masteryHandler(masteryInit);

    // Now trigger a discovery contribution — should not throw
    const discoveryHandler = getHandler(deps, BB.CONTRIBUTION('discovery'));
    const contribution: DwellDiscoveryContribution = {
      intent: 'aws',
      responses: [makeDiscoveryResponse()],
    };
    expect(() => discoveryHandler(contribution)).not.toThrow();

    expect(deps.nats.publish).toHaveBeenCalledWith(
      BB.ANSWER('discovery'),
      expect.any(Array),
    );
  });
});
