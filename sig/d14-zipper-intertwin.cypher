// ============================================================
// D-14 ZIPPER (Inter-Twin Extension) — Code-as-Graph (Pre-Game Blueprint)
// ============================================================
//
// This file specifies the Dwell-specific inter-twin extension
// of the Zipper. The UDT Zipper (F-1) already exists in
// artifacts/udt-rebuild/ and handles internal prompt processing.
// This file defines the MCP channel connectors, the dwell.*
// subject handling, and the discovery broadcast/collect pattern
// that are Dwell-specific. It EXTENDS F-1; it does not replace it.
//
// The Zipper is the ONLY agent that may communicate across the
// bb.*/dwell.* boundary. All other Personal Twin agents
// communicate exclusively through the BB abstraction.
//
// Everything on the Zipper looks like a tool — Domain Twins
// are MCP External Tools that register as BBTools. The Zipper's
// Probe stage calls them like any other registered tool.
//
// Key relationships:
//   - Holds ChannelConnector map (one per connected Domain Twin)
//   - Broadcasts dwell.broadcast.discovery on intent declaration
//   - Routes dwell.{twinId}.* tool calls to correct Domain Twin
//   - Fires dwell.{twinId}.outcome.signal (fire-and-forget)
//   - Relays dwell.domain.{twinId}.updated → bb.domain.<domain>.change-available
//
// Traceability: F-3.1 (Discovery by Broadcast), F-9.1 (Isolate
//               Learner's Private World), REQ-DW-ARC-01, ARC-02,
//               REQ-DW-DTD-01..05, REQ-DW-CUR-01..03
// Invariants: ZipperIsOnlyCrossBoundaryAgent,
//             EverythingOnZipperLooksLikeATool
//
// ============================================================

// ──────────────────────────────────────────────────────────────
// MODULE — MERGE (declared in d01-agents.cypher)
// ──────────────────────────────────────────────────────────────

MERGE (mod:TGTModule {name: 'zipper'})

// Sub-module marker: this file specifies the dwell inter-twin extension
CREATE (subMod:TGTModule {
  name: 'zipper-intertwin',
  parent: 'zipper',
  path: 'src/dwell/zipper',
  capability: 'inter-twin',
  tier: 'Dwell',
  description: 'Dwell-specific inter-twin extension of the UDT Zipper (F-1). Adds MCP channel connectors for Domain Twin connections, dwell.* subject routing, and discovery broadcast/collect. Extends F-1 without replacing it.'
})
CREATE (mod)-[:HAS_EXTENSION]->(subMod)

// ──────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────

CREATE (tChannelConnector:TGTType {
  name: 'ChannelConnector',
  kind: 'class',
  style: 'value-object',
  description: 'Represents one active MCP connection to a Domain Twin. Holds the connection metadata and the tool manifest the Domain Twin advertises. Held in the ChannelRegistry. Immutable after creation — a new connector replaces a stale one.',
  invariants: 'twinId always unique in registry; connectedAt always ISO8601; tools never empty for a valid connection'
})
CREATE (tChannelConnector)-[:HAS_FIELD]->(:TGTField {name: 'twinId',      type: 'string',   description: 'Unique Domain Twin identifier'})
CREATE (tChannelConnector)-[:HAS_FIELD]->(:TGTField {name: 'domain',      type: 'string',   description: 'Domain this Twin covers (e.g. "aws-solutions-architect")'})
CREATE (tChannelConnector)-[:HAS_FIELD]->(:TGTField {name: 'connectedAt', type: 'string',   description: 'ISO8601 timestamp when this connection was established'})
CREATE (tChannelConnector)-[:HAS_FIELD]->(:TGTField {name: 'version',     type: 'string',   description: 'Domain Twin protocol version reported at connection time'})
CREATE (tChannelConnector)-[:HAS_FIELD]->(:TGTField {name: 'tools',       type: 'string[]', description: 'Tool names this Domain Twin advertises via MCP (e.g. kg.request, bridge.query, assessment.request)'})

CREATE (tInterTwinCall:TGTType {
  name: 'InterTwinCall',
  kind: 'interface',
  style: 'pure',
  description: 'Represents a single outbound call to a Domain Twin via its channel connector. Carries the target twin, the tool name (everything looks like a tool), the payload, and the reply subject for response collection.',
  invariants: 'replySubject always unique per call to avoid response fan-in confusion'
})
CREATE (tInterTwinCall)-[:HAS_FIELD]->(:TGTField {name: 'twinId',       type: 'string',  description: 'Target Domain Twin ID'})
CREATE (tInterTwinCall)-[:HAS_FIELD]->(:TGTField {name: 'tool',         type: 'string',  description: 'Tool name to invoke on the Domain Twin'})
CREATE (tInterTwinCall)-[:HAS_FIELD]->(:TGTField {name: 'payload',      type: 'unknown', description: 'Tool-specific request payload'})
CREATE (tInterTwinCall)-[:HAS_FIELD]->(:TGTField {name: 'replySubject', type: 'string',  description: 'NATS subject on which this call expects the Domain Twin response'})

// ──────────────────────────────────────────────────────────────
// FILES
// ──────────────────────────────────────────────────────────────

// === types.ts ===
CREATE (fZipperTypes:TGTFile {
  name: 'types.ts',
  path: 'src/dwell/zipper/types.ts',
  description: 'Dwell inter-twin Zipper type definitions: ChannelConnector and InterTwinCall.',
  exports: 'ChannelConnector, InterTwinCall'
})
CREATE (fZipperTypes)-[:BELONGS_TO]->(subMod)
CREATE (fZipperTypes)-[:CONTAINS]->(tChannelConnector)
CREATE (fZipperTypes)-[:CONTAINS]->(tInterTwinCall)

// === channel-registry.ts ===
CREATE (fChannelRegistry:TGTFile {
  name: 'channel-registry.ts',
  path: 'src/dwell/zipper/channel-registry.ts',
  description: 'Stateful registry of active Domain Twin channel connectors. The Zipper holds one ChannelRegistry. Supports lookup by twinId and by tool name for routing. Satisfies REQ-DW-DTD-04, REQ-DW-DTD-05.',
  exports: 'ChannelRegistry'
})
CREATE (fChannelRegistry)-[:BELONGS_TO]->(subMod)

CREATE (tChannelRegistryClass:TGTType {
  name: 'ChannelRegistry',
  kind: 'class',
  style: 'stateful-class',
  description: 'Stateful registry of active ChannelConnectors. Keyed by twinId. Supports multi-twin connections per REQ-DW-DTD-05. The Zipper creates one ChannelRegistry at startup.',
  invariants: 'At most one connector per twinId; adding a new connector for an existing twinId replaces the previous'
})
CREATE (fChannelRegistry)-[:CONTAINS]->(tChannelRegistryClass)

CREATE (fnRegister:TGTFunction {
  name: 'register',
  signature: '(connector: ChannelConnector): void',
  style: 'effect',
  async: false,
  description: 'Adds a ChannelConnector to the registry on Domain Twin MCP connection. Replaces any existing connector with the same twinId. Effect: mutates registry state.'
})
CREATE (tChannelRegistryClass)-[:HAS_FUNCTION]->(fnRegister)

CREATE (fnGetConnector:TGTFunction {
  name: 'getConnector',
  signature: '(twinId: string): ChannelConnector | null',
  style: 'pure',
  async: false,
  description: 'Retrieves the ChannelConnector for a specific Domain Twin ID. Returns null if not connected. Pure — no side effects.'
})
CREATE (tChannelRegistryClass)-[:HAS_FUNCTION]->(fnGetConnector)

CREATE (fnGetConnectorsByTool:TGTFunction {
  name: 'getConnectorsByTool',
  signature: '(tool: string): ChannelConnector[]',
  style: 'pure',
  async: false,
  description: 'Returns all ChannelConnectors that advertise the given tool name. Used for routing tool calls when the target twinId is not specified (e.g. broadcast-style bridge.query). Pure — no side effects.'
})
CREATE (tChannelRegistryClass)-[:HAS_FUNCTION]->(fnGetConnectorsByTool)

// === discovery-broadcast.ts ===
CREATE (fDiscoveryBroadcast:TGTFile {
  name: 'discovery-broadcast.ts',
  path: 'src/dwell/zipper/discovery-broadcast.ts',
  description: 'Effect functions for the discovery broadcast/collect pattern. No central registry — Domain Twins self-announce in response to the broadcast. Satisfies REQ-DW-DTD-01 (broadcast, not registry) and REQ-DW-DTD-02 (zero response is a first-class event).',
  exports: 'broadcastDiscovery, collectResponses, fireDomainGap'
})
CREATE (fDiscoveryBroadcast)-[:BELONGS_TO]->(subMod)

CREATE (fnBroadcastDiscovery:TGTFunction {
  name: 'broadcastDiscovery',
  signature: '(intent: LearningIntent, sourceKnowledge: SourceKnowledge[], replyTo: string): void',
  style: 'effect',
  async: false,
  description: 'Fires dwell.broadcast.discovery with the learning intent and the learner\'s prior knowledge baseline. Any subscribed Domain Twin may respond on replyTo. Effect: publishes NATS broadcast.'
})
CREATE (fDiscoveryBroadcast)-[:CONTAINS]->(fnBroadcastDiscovery)

CREATE (fnCollectResponses:TGTFunction {
  name: 'collectResponses',
  signature: '(replyTo: string, timeoutMs: number): Promise<DiscoveryResponse[]>',
  style: 'effect',
  async: true,
  description: 'Collects DiscoveryResponse messages on the replyTo subject until the timeout expires. Returns all responses received (may be empty). Effect: reads from NATS subject with deadline.'
})
CREATE (fDiscoveryBroadcast)-[:CONTAINS]->(fnCollectResponses)

CREATE (fnFireDomainGap:TGTFunction {
  name: 'fireDomainGap',
  signature: '(intent: LearningIntent, userId: string): void',
  style: 'effect',
  async: false,
  description: 'Fires dwell.{userId}.domain.gap when no Domain Twin responded to discovery within the timeout. This is a platform-level finding, not an error (REQ-DW-DTD-02). Effect: publishes NATS event.'
})
CREATE (fDiscoveryBroadcast)-[:CONTAINS]->(fnFireDomainGap)

// === inter-twin-caller.ts ===
CREATE (fInterTwinCaller:TGTFile {
  name: 'inter-twin-caller.ts',
  path: 'src/dwell/zipper/inter-twin-caller.ts',
  description: 'Effect functions for directed inter-twin calls: invoking a specific Domain Twin tool, firing outcome signals, and relaying domain change notifications into the BB. Satisfies REQ-DW-ARC-01 (Zipper is the only cross-boundary agent), REQ-DW-CUR-01.',
  exports: 'callDomainTwin, fireOutcomeSignal, relayUpdateNotification'
})
CREATE (fInterTwinCaller)-[:BELONGS_TO]->(subMod)

CREATE (fnCallDomainTwin:TGTFunction {
  name: 'callDomainTwin',
  signature: '(connector: ChannelConnector, tool: string, payload: unknown, replySubject: string): Promise<unknown>',
  style: 'effect',
  async: true,
  description: 'Sends a dwell.{twinId}.{tool} call to the Domain Twin identified by connector and awaits the response on replySubject. This is the single directed-call gateway for all Personal Twin → Domain Twin interactions. Effect: publishes NATS request, awaits response.'
})
CREATE (fInterTwinCaller)-[:CONTAINS]->(fnCallDomainTwin)

CREATE (fnFireOutcomeSignal:TGTFunction {
  name: 'fireOutcomeSignal',
  signature: '(connector: ChannelConnector, signal: OutcomeSignal): void',
  style: 'effect',
  async: false,
  description: 'Fires dwell.{twinId}.outcome.signal to the Domain Twin. Fire-and-forget — no response expected. The signal carries no personal identifiers (REQ-DW-OUT-02). Effect: publishes NATS event.'
})
CREATE (fInterTwinCaller)-[:CONTAINS]->(fnFireOutcomeSignal)

CREATE (fnRelayUpdateNotification:TGTFunction {
  name: 'relayUpdateNotification',
  signature: '(domain: string): void',
  style: 'effect',
  async: false,
  description: 'Receives a dwell.domain.{twinId}.updated thin signal from a Domain Twin channel connector and relays it into the BB as bb.domain.<domain>.change-available. This is how Cultivator learns of domain changes without the Domain Twin knowing who is subscribed (REQ-DW-CUR-03). Effect: posts to BB.'
})
CREATE (fInterTwinCaller)-[:CONTAINS]->(fnRelayUpdateNotification)

// ──────────────────────────────────────────────────────────────
// INVARIANT REFERENCES
// ──────────────────────────────────────────────────────────────

MATCH (inv1:TGTInvariant {name: 'ZipperIsOnlyCrossBoundaryAgent'})
CREATE (mod)-[:ENFORCES]->(inv1)

MATCH (inv2:TGTInvariant {name: 'EverythingOnZipperLooksLikeATool'})
CREATE (mod)-[:ENFORCES]->(inv2)
