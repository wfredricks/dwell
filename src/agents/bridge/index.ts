/**
 * DwellBridge — the personalization engine.
 *
 * When a learner is stuck at a confidence plateau, Bridge transforms a generic
 * bridge card into something anchored in the learner's own lived experience and
 * mental models. Reads the AntiquarianSnapshot from the BB (NEVER calls Antiquarian
 * directly — BridgeReadsSnapshotNotAntiquarian invariant).
 *
 * Consumes: bb.bridge.requested (DwellBridgeRequested)
 *           bb.attention.outcome (DwellAttentionOutcome — follow-up routing)
 *           bb.intent.declared  (DwellIntentDeclared — reset bridge state)
 * Emits:    bb.bridge.ready     (DwellBridgeReady)
 *
 * Invariant: BridgeReadsSnapshotNotAntiquarian
 *   Bridge must NEVER call Antiquarian or request a new baseline. It reads
 *   the AntiquarianSnapshot from the BB (key: 'dwell.antiquarian.snapshot').
 *   If the snapshot is absent, Bridge logs and skips — it does not block.
 *
 * @namespace dwell
 * @sig d11-bridge.cypher
 */

import type { DwellDeps } from '../../types.js';
import type {
  DwellAntiquarianSnapshot,
  DwellBridgeRequested,
  DwellBridgeReady,
  DwellBridgeCard,
  DwellAttentionOutcome,
  DwellIntentDeclared,
  DwellGapType,
} from '../../events/types.js';
import { BB } from '../../events/subjects.js';
import type { DwellBridgeCardGeneric } from './types.js';
import { selectMentalModel } from './mental-model-selector.js';
import { personalize } from './personalizer.js';

// ── Blackboard key ────────────────────────────────────────────────────────
// Must match the key used by DwellAntiquarian.
const ANTIQUARIAN_SNAPSHOT_KEY = 'dwell.antiquarian.snapshot'; // @adopt:dwell-antiquarian-snapshot-key  [resolved: 'dwell.antiquarian.snapshot']

// ── Learner state → gap type heuristic ───────────────────────────────────
// @adopt:dwell-bridge-learner-state-gap-type  [resolved: plateau→bridge, confused→knowledge, slow→bridge]
function inferGapType(learnerState: string): DwellGapType {
  if (learnerState === 'confused') return 'knowledge';
  return 'bridge';
}

// ── Default bridge type ───────────────────────────────────────────────────
const DEFAULT_BRIDGE_TYPE = 'analogy'; // @adopt:dwell-bridge-default-bridge-type  [resolved: 'analogy']

// ── Internal state ────────────────────────────────────────────────────────

/**
 * Tracks bridge cards surfaced per session so dismissed items can be noted
 * for future model selection.
 */
interface DismissedBridgeRecord {
  itemId: string;
  mentalModelId: string | null;
}

// ── Agent class ───────────────────────────────────────────────────────────

/**
 * @namespace dwell
 * @sig d11-bridge.cypher
 */
export class DwellBridge {
  private readonly unsubscribers: Array<() => void> = [];

  /** Dismissed bridge card records — noted for future model selection. */
  private readonly dismissedBridges: DismissedBridgeRecord[] = [];

  /** Last surfaced bridge card per domain (for follow-up routing). */
  private readonly lastSurfacedByDomain = new Map<string, string>(); // domain → itemId

  constructor(private readonly deps: DwellDeps) {}

  /**
   * Register NATS subscriptions.
   * Called by mountDwell().
   *
   * @sig-node DwellBridge.mount
   */
  mount(): void {
    // bb.bridge.requested — core trigger
    const unsubBridgeRequested = this.deps.nats.subscribe(BB.BRIDGE_REQUESTED, async (data) => {
      try {
        await this.handleBridgeRequested(data as DwellBridgeRequested);
      } catch (err) {
        // TODO: emit bb.dwell.agent.error when error event type is defined
        console.error('[DwellBridge] handleBridgeRequested failed:', err);
      }
    });
    this.unsubscribers.push(unsubBridgeRequested);

    // bb.attention.outcome — follow-up routing (note dismissals)
    const unsubAttentionOutcome = this.deps.nats.subscribe(BB.ATTENTION_OUTCOME, async (data) => {
      try {
        await this.handleAttentionOutcome(data as DwellAttentionOutcome);
      } catch (err) {
        console.error('[DwellBridge] handleAttentionOutcome failed:', err);
      }
    });
    this.unsubscribers.push(unsubAttentionOutcome);

    // bb.intent.declared — reset bridge state on new intent
    const unsubIntentDeclared = this.deps.nats.subscribe(BB.INTENT_DECLARED, async (data) => {
      try {
        await this.handleIntentDeclared(data as DwellIntentDeclared);
      } catch (err) {
        console.error('[DwellBridge] handleIntentDeclared failed:', err);
      }
    });
    this.unsubscribers.push(unsubIntentDeclared);
  }

  /**
   * Tear down all subscriptions.
   *
   * @sig-node DwellBridge.dispose
   */
  dispose(): void {
    for (const unsub of [...this.unsubscribers].reverse()) unsub();
    this.unsubscribers.length = 0;
  }

  // ── Private handlers ────────────────────────────────────────────────────

  /**
   * Handle bb.bridge.requested.
   *
   * Reads AntiquarianSnapshot from BB (invariant: BridgeReadsSnapshotNotAntiquarian).
   * If absent, logs and skips. Otherwise personalizes the generic card and emits
   * bb.bridge.ready.
   *
   * @sig-node DwellBridge.handleBridgeRequested
   */
  private async handleBridgeRequested(payload: DwellBridgeRequested): Promise<void> {
    // ── Read snapshot from BB (invariant: BridgeReadsSnapshotNotAntiquarian) ──
    const snapshotRaw = await this.deps.bb.read(ANTIQUARIAN_SNAPSHOT_KEY);

    if (!snapshotRaw) {
      // Snapshot absent — log and skip per BridgeReadsSnapshotNotAntiquarian
      console.warn(
        `[DwellBridge] AntiquarianSnapshot absent for domain "${payload.domain}" — skipping bridge personalization`,
      );
      return;
    }

    const snapshot = snapshotRaw as DwellAntiquarianSnapshot;

    // ── Build a synthetic generic card from the bridge request ────────────
    const genericCard: DwellBridgeCardGeneric = {
      bridgeId:           crypto.randomUUID(),
      bridgeType:         DEFAULT_BRIDGE_TYPE,
      sourceAnchor:       snapshot.domain,
      targetConceptIds:   payload.conceptIds,
      genericText:        this.buildGenericText(payload),
      effectivenessScore: 0.5, // @adopt:dwell-bridge-default-effectiveness  [resolved: 0.5]
    };

    // ── Select best mental model anchor ───────────────────────────────────
    const gapType = inferGapType(payload.learnerState);
    const mentalModel = selectMentalModel(snapshot, genericCard.bridgeType, gapType);

    // ── Personalize or fall back to generic text ──────────────────────────
    let cardBody: string;
    let cardMentalModelId: string | null = null;

    if (mentalModel) {
      const personalized = personalize(genericCard, mentalModel, snapshot);
      cardBody = personalized.personalizedText;
      cardMentalModelId = personalized.mentalModelId;
      // Track last surfaced card per domain for follow-up routing
      this.lastSurfacedByDomain.set(payload.domain, genericCard.bridgeId);
    } else {
      // No suitable mental model — fall back to generic text
      cardBody = genericCard.genericText;
    }

    // ── Emit bb.bridge.ready ──────────────────────────────────────────────
    const bridgeCard: DwellBridgeCard = {
      body:   cardBody,
      origin: mentalModel ? 'personal-twin-synthesized' : 'domain-twin-generic',
    };

    const bridgeReady: DwellBridgeReady = {
      domain:       payload.domain,
      conceptIds:   payload.conceptIds,
      sourceAnchor: genericCard.sourceAnchor,
      bridgeType:   genericCard.bridgeType,
      card:         bridgeCard,
      readyAt:      new Date().toISOString(),
    };

    this.deps.nats.publish(BB.BRIDGE_READY, bridgeReady);
  }

  /**
   * Handle bb.attention.outcome — if the response is 'dismissed' and the item
   * was a bridge card, note the dismissal for future model selection.
   *
   * @sig-node DwellBridge.handleAttentionOutcome
   */
  private async handleAttentionOutcome(payload: DwellAttentionOutcome): Promise<void> {
    if (payload.response === 'dismissed' && payload.itemType === 'bridge-card') {
      this.dismissedBridges.push({
        itemId:        payload.itemId,
        mentalModelId: null, // model id not available in attention outcome — noted for future enrichment
      });
    }
  }

  /**
   * Handle bb.intent.declared — reset internal bridge state for the new domain.
   *
   * @sig-node DwellBridge.handleIntentDeclared
   */
  private async handleIntentDeclared(payload: DwellIntentDeclared): Promise<void> {
    // Reset domain-specific bridge state on new intent
    this.lastSurfacedByDomain.delete(payload.intent);
    // Note: dismissedBridges is intentionally preserved across intent changes
    // as cross-domain signal; only cleared on full dispose()
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /**
   * Build a generic bridge text from the bridge request context.
   * This is the fallback text before personalization.
   */
  private buildGenericText(payload: DwellBridgeRequested): string {
    const conceptList = payload.conceptIds.slice(0, 3).join(', ');
    return `To strengthen your understanding of ${conceptList} in ${payload.domain}, consider how similar patterns appear in contexts you already know well.`;
  }
}
