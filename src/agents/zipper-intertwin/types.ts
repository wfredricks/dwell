/**
 * DwellZipperIntertwin — local types
 *
 * ChannelConnector: represents one live connection slot to a Domain Twin's tool surface.
 * InterTwinCall: a single outbound call record for logging/tracing.
 *
 * @namespace dwell
 * @sig d14-zipper-intertwin.cypher
 */

import type { DwellDomainTwinTools } from '../../bbtools/contract.js';

/**
 * Represents one active connection slot to a Domain Twin.
 * Held by DwellChannelRegistry, keyed by twinId.
 *
 * Invariant: twinId is unique in the registry; a new connector replaces a stale one.
 */
export interface ChannelConnector {
  /** Unique Domain Twin identifier — matches twinId in dwell.* NATS subjects. */
  twinId: string;
  /** Domain this Twin covers. e.g. "aws-solutions-architect" */
  domain: string;
  /** Direct tool call surface exposed by this Domain Twin. */
  tool: DwellDomainTwinTools;
  /** Whether this connection is currently active. */
  connected: boolean;
}

/**
 * A single outbound call to a Domain Twin. Used for logging/tracing.
 * No PII carried — twinId and toolName only.
 */
export interface InterTwinCall {
  /** Target Domain Twin ID. */
  twinId: string;
  /** Tool method name invoked. e.g. "getKnowledgeGraph" */
  toolName: string;
  /** Unique request ID for correlation. */
  requestId: string;
  /** ISO8601 timestamp when the call was fired. */
  firedAt: string;
}
