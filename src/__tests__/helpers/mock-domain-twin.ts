/**
 * MockDomainTwin — a full in-memory implementation of DwellBBTool.
 *
 * Returns realistic synthetic data for all Domain Twin operations:
 *   - getKnowledgeGraph(): 10 concept nodes, 15 edges, 3 curated batches, 2 misconceptions
 *   - queryBridge():       2 bridge card candidates
 *   - requestAssessment(): 3 assessment items at the requested Bloom's level
 *   - requestUpdate():     empty delta (no changes)
 *   - receiveOutcomeSignal(): records signal, returns void
 *
 * @namespace dwell
 */

import type { DwellBBTool, DwellDomainTwinIdentity, DwellDomainTwinTools } from '../../bbtools/contract.js';
import type {
  DwellKgRequest,
  DwellKgDelivered,
  DwellBridgeQuery,
  DwellBridgeResponse,
  DwellAssessmentRequest,
  DwellAssessmentDelivered,
  DwellUpdateRequest,
  DwellUpdateDelivered,
  DwellOutcomeSignal,
  DwellBloomsLevel,
} from '../../events/types.js';

// ── Identity ──────────────────────────────────────────────────────────────

const MOCK_TWIN_ID = 'aws-saa-domain-twin-test'; // @adopt:dwell-mock-twin-id  [resolved: aws-saa-domain-twin-test]
const MOCK_DOMAIN  = 'aws-saa';                   // @adopt:dwell-mock-domain  [resolved: aws-saa]

// ── Concept node definitions (10 nodes) ───────────────────────────────────

const CONCEPT_IDS = [
  'iam-policies',
  'iam-roles',
  'vpc-routing',
  'ec2-instance-types',
  's3-storage-classes',
  'cloudfront-distributions',
  'rds-multi-az',
  'elb-target-groups',
  'route53-routing-policies',
  'kms-key-management',
] as const;

// ── Tools implementation ──────────────────────────────────────────────────

class MockDomainTwinTools implements DwellDomainTwinTools {
  /** Records of all received outcome signals — inspectable in tests. */
  readonly receivedSignals: DwellOutcomeSignal[] = [];

  async getKnowledgeGraph(_request: DwellKgRequest): Promise<DwellKgDelivered> {
    return {
      twinId: MOCK_TWIN_ID,
      domain: MOCK_DOMAIN,
      graph: {
        nodes: [
          { conceptId: 'iam-policies',             label: 'IAM Policies',              bloomsTargetAltitude: 4 as DwellBloomsLevel, examWeight: 0.12, crossDomainEquivalents: [] },
          { conceptId: 'iam-roles',                label: 'IAM Roles',                 bloomsTargetAltitude: 4 as DwellBloomsLevel, examWeight: 0.10, crossDomainEquivalents: [] },
          { conceptId: 'vpc-routing',              label: 'VPC Routing',               bloomsTargetAltitude: 3 as DwellBloomsLevel, examWeight: 0.09, crossDomainEquivalents: [] },
          { conceptId: 'ec2-instance-types',       label: 'EC2 Instance Types',        bloomsTargetAltitude: 3 as DwellBloomsLevel, examWeight: 0.08, crossDomainEquivalents: [] },
          { conceptId: 's3-storage-classes',       label: 'S3 Storage Classes',        bloomsTargetAltitude: 3 as DwellBloomsLevel, examWeight: 0.11, crossDomainEquivalents: [] },
          { conceptId: 'cloudfront-distributions', label: 'CloudFront Distributions',  bloomsTargetAltitude: 3 as DwellBloomsLevel, examWeight: 0.07, crossDomainEquivalents: [] },
          { conceptId: 'rds-multi-az',             label: 'RDS Multi-AZ',              bloomsTargetAltitude: 4 as DwellBloomsLevel, examWeight: 0.10, crossDomainEquivalents: [] },
          { conceptId: 'elb-target-groups',        label: 'ELB Target Groups',         bloomsTargetAltitude: 3 as DwellBloomsLevel, examWeight: 0.08, crossDomainEquivalents: [] },
          { conceptId: 'route53-routing-policies', label: 'Route 53 Routing Policies', bloomsTargetAltitude: 3 as DwellBloomsLevel, examWeight: 0.09, crossDomainEquivalents: [] },
          { conceptId: 'kms-key-management',       label: 'KMS Key Management',        bloomsTargetAltitude: 3 as DwellBloomsLevel, examWeight: 0.08, crossDomainEquivalents: [] },
        ],
        edges: [
          // 15 directed edges (prerequisite / reinforces / contrasts)
          { from: 'iam-policies',             to: 'iam-roles',                relationshipType: 'prerequisite' },
          { from: 'iam-roles',                to: 'ec2-instance-types',       relationshipType: 'reinforces'   },
          { from: 'iam-roles',                to: 'rds-multi-az',             relationshipType: 'reinforces'   },
          { from: 'vpc-routing',              to: 'elb-target-groups',        relationshipType: 'prerequisite' },
          { from: 'vpc-routing',              to: 'cloudfront-distributions', relationshipType: 'reinforces'   },
          { from: 'vpc-routing',              to: 'route53-routing-policies', relationshipType: 'reinforces'   },
          { from: 'ec2-instance-types',       to: 'elb-target-groups',        relationshipType: 'reinforces'   },
          { from: 'ec2-instance-types',       to: 'rds-multi-az',             relationshipType: 'reinforces'   },
          { from: 's3-storage-classes',       to: 'cloudfront-distributions', relationshipType: 'prerequisite' },
          { from: 's3-storage-classes',       to: 'kms-key-management',       relationshipType: 'reinforces'   },
          { from: 'elb-target-groups',        to: 'route53-routing-policies', relationshipType: 'reinforces'   },
          { from: 'rds-multi-az',             to: 'kms-key-management',       relationshipType: 'reinforces'   },
          { from: 'cloudfront-distributions', to: 'kms-key-management',       relationshipType: 'reinforces'   },
          { from: 'iam-policies',             to: 'kms-key-management',       relationshipType: 'reinforces'   },
          { from: 'vpc-routing',              to: 'ec2-instance-types',       relationshipType: 'prerequisite' },
        ],
      },
      curatedBatches: [
        {
          batchId:               'batch-iam-core',
          label:                 'IAM Core',
          conceptIds:            ['iam-policies', 'iam-roles'],
          teachTogetherReason:   'IAM roles consume policies; teach together for proper mental model',
        },
        {
          batchId:               'batch-network-stack',
          label:                 'Network Stack',
          conceptIds:            ['vpc-routing', 'elb-target-groups', 'route53-routing-policies'],
          teachTogetherReason:   'Traffic routing forms a single mental stack from DNS to instances',
        },
        {
          batchId:               'batch-resilience',
          label:                 'Resilience Patterns',
          conceptIds:            ['rds-multi-az', 'elb-target-groups'],
          teachTogetherReason:   'High-availability patterns reinforce each other',
        },
      ],
      misconceptionCatalog: [
        {
          misconceptionId: 'mc-iam-role-vs-user',
          conceptIds:      ['iam-roles', 'iam-policies'],
          sourceDomain:    null,
          description:     'Learners confuse IAM roles (assumable identities) with IAM users (permanent identities)',
        },
        {
          misconceptionId: 'mc-s3-storage-class-cost',
          conceptIds:      ['s3-storage-classes'],
          sourceDomain:    null,
          description:     'Learners assume Glacier is always cheapest; miss retrieval cost trade-offs',
        },
      ],
    };
  }

  async queryBridge(_request: DwellBridgeQuery): Promise<DwellBridgeResponse> {
    return {
      twinId: MOCK_TWIN_ID,
      targetConceptIds: _request.targetConceptIds,
      candidates: [
        {
          bridgeId:             'bridge-vpc-containment',
          bridgeType:           'analogy',
          sourceAnchor:         'nuclear-safety',
          targetConcept:        'vpc-routing',
          genericText:          'A VPC is a network containment zone — like a nuclear security envelope that separates reactor systems from administrative systems. Traffic only crosses where explicitly permitted.',
          effectivenessScore:   0.85,
          profileClusterMatch:  0.90,
        },
        {
          bridgeId:             'bridge-iam-clearance',
          bridgeType:           'analogy',
          sourceAnchor:         'nuclear-safety',
          targetConcept:        'iam-policies',
          genericText:          'IAM policies are like access clearance levels at a nuclear plant — you need both identity verification and specific permissions for each action.',
          effectivenessScore:   0.80,
          profileClusterMatch:  0.82,
        },
      ],
    };
  }

  async requestAssessment(request: DwellAssessmentRequest): Promise<DwellAssessmentDelivered> {
    const level = request.bloomsLevel;
    const conceptId = request.conceptIds[0] ?? 'vpc-routing';
    return {
      twinId: MOCK_TWIN_ID,
      items: [
        {
          itemId:      `item-${conceptId}-1`,
          question:    `[Level ${level}] Which VPC feature controls traffic between subnets?`,
          bloomsLevel: level,
          conceptIds:  [conceptId],
          distractors: ['Security Group', 'IAM Policy', 'Route Table'],
          correctAnswer: 'Network ACL',
        },
        {
          itemId:      `item-${conceptId}-2`,
          question:    `[Level ${level}] A VPC subnet with no route to an internet gateway is considered:`,
          bloomsLevel: level,
          conceptIds:  [conceptId],
          distractors: ['Public', 'DMZ', 'Isolated'],
          correctAnswer: 'Private',
        },
        {
          itemId:      `item-${conceptId}-3`,
          question:    `[Level ${level}] Which AWS service allows instances in a private subnet to reach the internet without accepting inbound connections?`,
          bloomsLevel: level,
          conceptIds:  [conceptId],
          distractors: ['Internet Gateway', 'VPN Gateway', 'Transit Gateway'],
          correctAnswer: 'NAT Gateway',
        },
      ],
    };
  }

  async requestUpdate(_request: DwellUpdateRequest): Promise<DwellUpdateDelivered> {
    // Empty delta — no changes in this mock
    return {
      twinId:           MOCK_TWIN_ID,
      domain:           MOCK_DOMAIN,
      fromVersion:      _request.sinceVersion,
      toVersion:        _request.sinceVersion, // no change
      affectedConcepts: [],
      deliveredAt:      new Date().toISOString(),
    };
  }

  async receiveOutcomeSignal(signal: DwellOutcomeSignal): Promise<void> {
    this.receivedSignals.push(signal);
  }
}

// ── Public export ─────────────────────────────────────────────────────────

/**
 * Create a fully implemented mock DwellBBTool for use in integration tests.
 * The tools object exposes `receivedSignals` for inspection.
 */
export function createMockDomainTwin(): DwellBBTool & { tools: MockDomainTwinTools } {
  const identity: DwellDomainTwinIdentity = {
    twinId:             MOCK_TWIN_ID,
    domain:             MOCK_DOMAIN,
    name:               'AWS SAA Domain Twin (Test Mock)',
    version:            '1.0.0-test',
    certName:           'AWS Certified Solutions Architect – Associate',
    coverage:           0.95,
    qualityScore:       0.90,
    crossDomainSupport: ['nuclear-safety', 'networking'],
  };
  const tools = new MockDomainTwinTools();
  return { identity, tools };
}

/** All concept IDs covered by the mock domain twin — exported for test assertions. */
export { CONCEPT_IDS as MOCK_CONCEPT_IDS, MOCK_TWIN_ID, MOCK_DOMAIN };
