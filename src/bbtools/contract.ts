/**
 * DwellDomainTwin BBTool Contract
 *
 * Every Domain Twin that registers on the Personal Twin's Zipper as a BBTool
 * MUST implement this interface. The Zipper calls these methods; the Domain
 * Twin provides the implementations.
 *
 * The contract is deliberately minimal — only what the Zipper needs to satisfy
 * Dwell agent requests. Domain Twins may have richer internal APIs; they expose
 * only this surface to the Personal Twin.
 *
 * Registration: a Domain Twin registers by calling DwellZipperRegistry.register()
 * at connection time (I-7 MCP channel open). It unregisters on disconnect.
 *
 * @namespace dwell
 * @adopt:dwell-bbtool-contract-version  [resolved: 1.0.0]
 */

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
} from '../events/types.js';

/**
 * The identity a Domain Twin presents when registering on the Zipper.
 */
export interface DwellDomainTwinIdentity {
  /** Stable identifier — matches the twinId used in dwell.* NATS subjects. */
  twinId: string;
  /** The knowledge domain this twin covers. e.g. "aws-solutions-architect" */
  domain: string;
  /** Human-readable name. e.g. "AWS Solutions Architect Domain Twin" */
  name: string;
  /** Semantic version of this Domain Twin's knowledge graph. */
  version: string;
  /** The cert or offering this twin covers, if applicable. */
  certName: string | null;
  /** How much of the declared domain this twin covers. 0.0–1.0 */
  coverage: number;
  /** Self-assessed quality score. 0.0–1.0 */
  qualityScore: number;
  /** Other domains this twin can serve cross-domain transfer from. */
  crossDomainSupport: string[];
}

/**
 * The tool surface a Domain Twin exposes to the Zipper.
 * Every method maps to a dwell.* Call in the event architecture.
 */
export interface DwellDomainTwinTools {
  /**
   * Deliver the full knowledge graph, curated batches, and misconception catalog.
   * Called in response to dwell.{twinId}.kg.request
   */
  getKnowledgeGraph(request: DwellKgRequest): Promise<DwellKgDelivered>;

  /**
   * Return bridge card candidates for the specified concepts and source domains.
   * Called in response to dwell.{twinId}.bridge.query
   */
  queryBridge(request: DwellBridgeQuery): Promise<DwellBridgeResponse>;

  /**
   * Deliver calibrated assessment items at the requested Bloom's level.
   * Called in response to dwell.{twinId}.assessment.request
   */
  requestAssessment(request: DwellAssessmentRequest): Promise<DwellAssessmentDelivered>;

  /**
   * Deliver the pre-curated change delta since the specified version.
   * Called in response to dwell.{twinId}.update.request
   */
  requestUpdate(request: DwellUpdateRequest): Promise<DwellUpdateDelivered>;

  /**
   * Accept an anonymized outcome signal after a learning interaction.
   * Fire-and-forget — the Personal Twin does not await a response.
   * Called on dwell.{twinId}.outcome.signal
   */
  receiveOutcomeSignal(signal: DwellOutcomeSignal): Promise<void>;
}

/**
 * Full BBTool contract — identity + tools.
 * Pass an instance to DwellZipperRegistry.register() at connection time.
 */
export interface DwellBBTool {
  identity: DwellDomainTwinIdentity;
  tools: DwellDomainTwinTools;
}

/**
 * The registry interface the Zipper exposes to Domain Twins for registration.
 * Provided by the Zipper via DwellDeps.zipper at mount time.
 *
 * @adopt:dwell-zipper-registry  [resolved: injected by mountDwell deps]
 */
export interface DwellZipperRegistry {
  /**
   * Register a Domain Twin BBTool.
   * Called at MCP channel-open time (I-7 connection).
   * Returns a deregister function — call it on channel close.
   */
  register(tool: DwellBBTool): () => void;

  /**
   * List all currently registered Domain Twin BBTools.
   */
  listRegistered(): DwellDomainTwinIdentity[];

  /**
   * Find a registered Domain Twin by its twinId.
   */
  find(twinId: string): DwellBBTool | undefined;

  /**
   * Find all registered Domain Twins that cover a given domain.
   */
  findByDomain(domain: string): DwellBBTool[];
}
