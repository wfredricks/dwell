/**
 * AWS SA Domain Twin — reference Domain Twin for the Dwell constellation.
 *
 * Connects to NATS, announces itself, and responds to dwell.* subjects.
 *
 * @adopt:dwell-aws-sa-twin-id [resolved: aws-sa]
 * @adopt:dwell-nats-url       [resolved: nats://nats:4222]
 */

import { connect, StringCodec, NatsConnection, Msg } from 'nats';

// @adopt:dwell-nats-url [resolved: nats://nats:4222]
const NATS_URL = process.env['NATS_URL'] ?? 'nats://nats:4222';
// @adopt:dwell-aws-sa-twin-id [resolved: aws-sa]
const TWIN_ID  = 'aws-sa';
const DOMAIN   = 'aws-solutions-architect';

const sc = StringCodec();

function pub(nc: NatsConnection, subject: string, data: unknown): void {
  nc.publish(subject, sc.encode(JSON.stringify(data)));
}

function replyTo(nc: NatsConnection, msg: Msg, data: unknown): void {
  if (msg.reply) {
    nc.publish(msg.reply, sc.encode(JSON.stringify(data)));
  }
}

function parse(msg: Msg): unknown {
  try { return JSON.parse(sc.decode(msg.data)); } catch { return {}; }
}

// ── Knowledge graph: 20 AWS concept nodes ───────────────────────────────────

const KG_NODES = [
  { id: 'iam-roles',          label: 'IAM Roles',               domain: 'IAM',          bloomsTargetAltitude: 3 },
  { id: 'iam-policies',       label: 'IAM Policies',             domain: 'IAM',          bloomsTargetAltitude: 3 },
  { id: 'iam-users-groups',   label: 'IAM Users & Groups',       domain: 'IAM',          bloomsTargetAltitude: 2 },
  { id: 'ec2-instances',      label: 'EC2 Instances',            domain: 'EC2',          bloomsTargetAltitude: 3 },
  { id: 'ec2-autoscaling',    label: 'EC2 Auto Scaling',         domain: 'EC2',          bloomsTargetAltitude: 3 },
  { id: 'ec2-elb',            label: 'Elastic Load Balancing',   domain: 'EC2',          bloomsTargetAltitude: 3 },
  { id: 's3-buckets',         label: 'S3 Buckets',               domain: 'S3',           bloomsTargetAltitude: 3 },
  { id: 's3-storage-classes', label: 'S3 Storage Classes',       domain: 'S3',           bloomsTargetAltitude: 2 },
  { id: 's3-lifecycle',       label: 'S3 Lifecycle Policies',    domain: 'S3',           bloomsTargetAltitude: 3 },
  { id: 'vpc-basics',         label: 'VPC Fundamentals',         domain: 'VPC',          bloomsTargetAltitude: 3 },
  { id: 'vpc-subnets',        label: 'VPC Subnets & Routing',    domain: 'VPC',          bloomsTargetAltitude: 3 },
  { id: 'vpc-security',       label: 'Security Groups & NACLs',  domain: 'VPC',          bloomsTargetAltitude: 3 },
  { id: 'rds-basics',         label: 'RDS Fundamentals',         domain: 'RDS',          bloomsTargetAltitude: 3 },
  { id: 'rds-multi-az',       label: 'RDS Multi-AZ',             domain: 'RDS',          bloomsTargetAltitude: 3 },
  { id: 'rds-read-replicas',  label: 'RDS Read Replicas',        domain: 'RDS',          bloomsTargetAltitude: 2 },
  { id: 'lambda-basics',      label: 'Lambda Functions',         domain: 'Lambda',       bloomsTargetAltitude: 3 },
  { id: 'lambda-triggers',    label: 'Lambda Triggers & Events', domain: 'Lambda',       bloomsTargetAltitude: 3 },
  { id: 'cloudfront-dist',    label: 'CloudFront Distributions', domain: 'CloudFront',   bloomsTargetAltitude: 3 },
  { id: 'cloudfront-cache',   label: 'CloudFront Caching',       domain: 'CloudFront',   bloomsTargetAltitude: 2 },
  { id: 'cloudfront-origins', label: 'CloudFront Origins',       domain: 'CloudFront',   bloomsTargetAltitude: 3 },
];

const BRIDGE_CANDIDATES = [
  {
    bridgeId: 'b1',
    fromDomain: 'networking',
    toDomain: DOMAIN,
    conceptId: 'vpc-basics',
    analogyLabel: 'VPC is like your corporate network in the cloud',
    strength: 0.85,
  },
  {
    bridgeId: 'b2',
    fromDomain: 'general-programming',
    toDomain: DOMAIN,
    conceptId: 'lambda-basics',
    analogyLabel: 'Lambda functions are like serverless event handlers',
    strength: 0.80,
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[AWS-SA Twin] Connecting to ${NATS_URL}`); // @adopt:dwell-nats-url [resolved: nats://nats:4222]
  const nc = await connect({ servers: NATS_URL });
  console.log('[AWS-SA Twin] Connected');

  const ANNOUNCE_PAYLOAD = {
    twinId:              TWIN_ID,   // @adopt:dwell-aws-sa-twin-id [resolved: aws-sa]
    domain:              DOMAIN,
    name:                'AWS SA Domain Twin',
    version:             '1.0.0',
    certName:            'AWS Certified Solutions Architect – Associate',
    coverage:            0.90,
    qualityScore:        0.88,
    crossDomainSupport:  ['networking', 'general-programming'],
  };

  // ── Announce ────────────────────────────────────────────────────────────────
  pub(nc, 'dwell.twin.announce', ANNOUNCE_PAYLOAD);
  console.log('[AWS-SA Twin] Announced');

  // ── dwell.broadcast.discovery ───────────────────────────────────────────────
  const discoverySub = nc.subscribe('dwell.broadcast.discovery');
  (async () => {
    for await (const msg of discoverySub) {
      const req = parse(msg) as { replyTo?: string };
      const replySubject = req.replyTo ?? msg.reply;
      if (replySubject) {
        nc.publish(replySubject, sc.encode(JSON.stringify({
          twinId:   TWIN_ID,
          identity: ANNOUNCE_PAYLOAD,
        })));
      }
      console.log('[AWS-SA Twin] Responded to discovery broadcast');
    }
  })();

  // ── dwell.aws-sa.kg.request ─────────────────────────────────────────────────
  const kgSub = nc.subscribe(`dwell.${TWIN_ID}.kg.request`); // @adopt:dwell-aws-sa-twin-id [resolved: aws-sa]
  (async () => {
    for await (const msg of kgSub) {
      const _req = parse(msg);
      replyTo(nc, msg, {
        twinId: TWIN_ID,
        nodes:  KG_NODES,
        edges:  [],
        misconceptions: [],
        version: '1.0.0',
      });
      console.log('[AWS-SA Twin] Responded to kg.request');
    }
  })();

  // ── dwell.aws-sa.bridge.query ───────────────────────────────────────────────
  const bridgeSub = nc.subscribe(`dwell.${TWIN_ID}.bridge.query`);
  (async () => {
    for await (const msg of bridgeSub) {
      const _req = parse(msg);
      replyTo(nc, msg, {
        twinId:     TWIN_ID,
        candidates: BRIDGE_CANDIDATES,
      });
      console.log('[AWS-SA Twin] Responded to bridge.query');
    }
  })();

  // ── dwell.aws-sa.assessment.request ────────────────────────────────────────
  const assessSub = nc.subscribe(`dwell.${TWIN_ID}.assessment.request`);
  (async () => {
    for await (const msg of assessSub) {
      const req = parse(msg) as { bloomsLevel?: number };
      const level = req.bloomsLevel ?? 2;
      replyTo(nc, msg, {
        twinId: TWIN_ID,
        items: [
          {
            itemId:      'q1',
            conceptId:   'iam-roles',
            bloomsLevel: level,
            question:    'What is the primary purpose of IAM roles in AWS?',
            options:     ['A) Replace passwords', 'B) Delegate access to AWS services', 'C) Encrypt S3 data', 'D) Monitor costs'],
            correct:     'B',
          },
          {
            itemId:      'q2',
            conceptId:   'vpc-basics',
            bloomsLevel: level,
            question:    'Which component defines the IP address range for a VPC?',
            options:     ['A) Security Group', 'B) CIDR block', 'C) Route table', 'D) Internet gateway'],
            correct:     'B',
          },
          {
            itemId:      'q3',
            conceptId:   's3-buckets',
            bloomsLevel: level,
            question:    'S3 bucket names must be globally unique. True or False?',
            options:     ['A) True', 'B) False'],
            correct:     'A',
          },
        ],
      });
      console.log('[AWS-SA Twin] Responded to assessment.request');
    }
  })();

  // ── dwell.aws-sa.outcome.signal ─────────────────────────────────────────────
  const outcomeSub = nc.subscribe(`dwell.${TWIN_ID}.outcome.signal`);
  (async () => {
    for await (const msg of outcomeSub) {
      const signal = parse(msg);
      console.log('[AWS-SA Twin] Received outcome.signal:', JSON.stringify(signal));
      // No response expected — fire and forget
    }
  })();

  // ── dwell.aws-sa.update.request ─────────────────────────────────────────────
  const updateSub = nc.subscribe(`dwell.${TWIN_ID}.update.request`);
  (async () => {
    for await (const msg of updateSub) {
      const _req = parse(msg);
      replyTo(nc, msg, {
        twinId: TWIN_ID,
        delta:  { added: [], deprecated: [], modified: [] },
        version: '1.0.0',
      });
      console.log('[AWS-SA Twin] Responded to update.request');
    }
  })();

  console.log('[AWS-SA Twin] Subscriptions active — ready');

  // Keep alive
  process.on('SIGTERM', async () => {
    console.log('[AWS-SA Twin] SIGTERM — shutting down');
    await nc.drain();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[AWS-SA Twin] Fatal:', err);
  process.exit(1);
});
