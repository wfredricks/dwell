/**
 * DwellChannelRegistry — stateful registry of active Domain Twin BBTools.
 *
 * Implements DwellZipperRegistry. Domain Twins call register() at MCP channel-open
 * time (I-7 connection) and receive a deregister function to call on disconnect.
 *
 * Invariant: at most one BBTool per twinId; registering a new tool for an existing
 * twinId replaces the previous (re-connection case).
 *
 * Satisfies: REQ-DW-DTD-04, REQ-DW-DTD-05
 *
 * @namespace dwell
 * @sig d14-zipper-intertwin.cypher
 */

import type { DwellBBTool, DwellDomainTwinIdentity, DwellZipperRegistry } from '../../bbtools/contract.js';

/**
 * Stateful registry of active Domain Twin channel connectors.
 * The single DwellChannelRegistry instance is created by DwellZipperIntertwin
 * and exposed on DwellHandle.registry.
 *
 * @implements DwellZipperRegistry
 */
export class DwellChannelRegistry implements DwellZipperRegistry {
  /**
   * Internal map: twinId → DwellBBTool.
   * At most one entry per twinId (re-connection replaces stale entry).
   */
  private readonly tools: Map<string, DwellBBTool> = new Map();

  /**
   * Register a Domain Twin BBTool.
   * Called at MCP channel-open time. Returns a deregister function — call it
   * when the channel closes. Re-registration for an existing twinId silently
   * replaces the previous entry.
   *
   * @sig-node DwellChannelRegistry.register
   */
  register(tool: DwellBBTool): () => void {
    const { twinId } = tool.identity;
    this.tools.set(twinId, tool);

    return () => {
      // Only deregister if this is still the registered tool (avoid stale removes).
      if (this.tools.get(twinId) === tool) {
        this.tools.delete(twinId);
      }
    };
  }

  /**
   * Find a registered Domain Twin by its twinId.
   * Returns undefined if not connected.
   *
   * @sig-node DwellChannelRegistry.find
   */
  find(twinId: string): DwellBBTool | undefined {
    return this.tools.get(twinId);
  }

  /**
   * Find all registered Domain Twins that cover a given domain.
   * Multiple twins may cover the same domain (per REQ-DW-DTD-05).
   *
   * @sig-node DwellChannelRegistry.findByDomain
   */
  findByDomain(domain: string): DwellBBTool[] {
    const result: DwellBBTool[] = [];
    for (const tool of this.tools.values()) {
      if (tool.identity.domain === domain) {
        result.push(tool);
      }
    }
    return result;
  }

  /**
   * List all currently registered Domain Twin identities.
   *
   * @sig-node DwellChannelRegistry.listRegistered
   */
  listRegistered(): DwellDomainTwinIdentity[] {
    return Array.from(this.tools.values()).map((t) => t.identity);
  }
}
