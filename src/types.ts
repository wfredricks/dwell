/**
 * DwellDeps — the contract seam between udt-foundation and the Dwell capability.
 *
 * This is the only interface Dwell requires from the foundation. Add to it
 * explicitly and visibly; never reach into the foundation beyond what is
 * declared here.
 *
 * @adopt:dwell-foundation-seam
 */
export interface DwellDeps {
  /** The Blackboard — shared working memory for all agents in the twin. */
  bb: Blackboard
  /** The Zipper — tool layer; Domain Twins register here as BBTools via MCP. */
  zipper: Zipper
  /** NATS client — event fabric for intra- and inter-twin messaging. */
  nats: NatsClient
  /** Graph reader — read access to the twin's knowledge graph. */
  graph: GraphReader
}

/**
 * DwellHandle — returned by mountDwell(). Call dispose() for clean teardown.
 */
export interface DwellHandle {
  dispose: () => Promise<void>
  /** The Zipper inter-twin registry. Domain Twins register here at connection time. */
  registry: import('./bbtools/contract.js').DwellZipperRegistry
}

// ── Placeholders until udt-foundation exports these types ──────────────────
// @adopt:dwell-foundation-types  [resolved: import from udt-foundation when published]

export interface Blackboard {
  read: (key: string) => Promise<unknown>
  write: (key: string, value: unknown) => Promise<void>
  subscribe: (pattern: string, handler: (event: unknown) => void) => () => void
}

export interface Zipper {
  registerTool: (id: string, handler: (input: unknown) => Promise<unknown>) => void
  unregisterTool: (id: string) => void
}

export interface NatsClient {
  publish: (subject: string, data: unknown) => void
  subscribe: (subject: string, handler: (data: unknown) => void) => () => void
}

export interface GraphReader {
  query: (cypher: string, params?: Record<string, unknown>) => Promise<unknown[]>
}
