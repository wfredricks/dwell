/**
 * DwellCultivatorDomain — keeps the Domain Twin's knowledge graph current.
 *
 * Watches external sources (cert body feeds, changelog monitors).
 * Pre-curates change deltas proactively when changes are detected.
 * Emits thin broadcast notifications (no subscriber list — invariant
 * DomainTwinDoesNotTrackSubscribers). Delivers pre-curated deltas on request.
 *
 * Distinct from the Personal Twin Cultivator (DwellCultivatorPersonal / d13).
 *
 * Tier: Dwell-DomainTwin — instantiated by Domain Twin implementations,
 * NOT by mountDwell() in the Personal Twin.
 *
 * Consumes:
 *   dwell.{twinId}.update.request  — deliver pre-curated delta since sinceVersion
 *
 * Emits:
 *   dwell.domain.{twinId}.updated  — thin broadcast when graph changes (no subscriber list)
 *   {replyTo}                      — DwellUpdateDelivered on request (reply subject from payload)
 *
 * @namespace dwell
 * @sig d18-cultivator-domain.cypher
 */

import type { DwellDeps } from '../../../types.js';
import { DWELL } from '../../../events/subjects.js';
import type { DwellUpdateRequest } from '../../../events/types.js';
import type { DomainChangeEvent, DomainDelta } from './types.js';
import { watchExternalSources } from './change-watcher.js';
import { buildDelta } from './delta-builder.js';
import { notifyConnectedTwins, deliverDelta } from './update-notifier.js';

export type { DomainChangeEvent, DomainDelta } from './types.js';

// ── Seam constants ────────────────────────────────────────────────────────────

/** Initial version label for the domain graph. */
const INITIAL_VERSION = '0'; // @adopt:dwell-cultivator-domain-initial-version  [resolved: 0]

// ── Identity ──────────────────────────────────────────────────────────────────

export interface DwellCultivatorDomainIdentity {
  /** Stable twinId — matches the twinId used in dwell.* NATS subjects. */
  twinId: string;
  /** The knowledge domain this twin covers. e.g. "aws-solutions-architect" */
  domain: string;
}

// ── Agent ─────────────────────────────────────────────────────────────────────

export class DwellCultivatorDomain {
  private readonly unsubscribers: Array<() => void> = [];

  /** Current graph version. Increments on every change detection. */
  private currentVersion: string = INITIAL_VERSION;

  /**
   * Stored deltas indexed by fromVersion.
   * On change detection, a new delta is pre-curated and stored here.
   * Delivered on request via DWELL.TWIN_UPDATE_REQUEST.
   */
  private readonly deltaStore = new Map<string, DomainDelta>();

  constructor(
    private readonly deps: DwellDeps,
    private readonly identity: DwellCultivatorDomainIdentity,
  ) {}

  /**
   * Register all subscriptions and start watching external sources.
   * Called by Domain Twin implementations at startup.
   */
  mount(): void {
    const { twinId } = this.identity;

    // Start watching external sources; on change → onChangeDetected
    const stopWatcher = watchExternalSources((events) => {
      try {
        this.onChangeDetected(events);
      } catch (err) {
        console.error('[DwellCultivatorDomain] onChangeDetected failed:', err);
      }
    });
    this.unsubscribers.push(stopWatcher);

    // Subscribe to DWELL.TWIN_UPDATE_REQUEST(twinId)
    const unsubUpdateRequest = this.deps.nats.subscribe(
      DWELL.TWIN_UPDATE_REQUEST(twinId),
      (data) => {
        try {
          const payload = data as DwellUpdateRequest;
          const replyTo = payload.replyTo ?? DWELL.USER_UPDATE_DELIVERED('unknown');
          this.onUpdateRequest(payload.sinceVersion, replyTo);
        } catch (err) {
          console.error('[DwellCultivatorDomain] onUpdateRequest failed:', err);
        }
      },
    );
    this.unsubscribers.push(unsubUpdateRequest);
  }

  /**
   * Tear down all subscriptions and stop watching.
   * Called by Domain Twin implementations at shutdown.
   */
  dispose(): void {
    for (const unsub of [...this.unsubscribers].reverse()) {
      unsub();
    }
    this.unsubscribers.length = 0;
  }

  // ── Public trigger (for Domain Twin implementations and tests) ───────────────

  /**
   * Trigger change detection with externally provided DomainChangeEvents.
   * Domain Twin implementations call this when their external source adapter
   * detects changes. Also used in tests.
   *
   * @sig-node DwellCultivatorDomain.onChangeDetected
   */
  triggerChanges(events: DomainChangeEvent[]): void {
    this.onChangeDetected(events);
  }

  // ── Private handlers ──────────────────────────────────────────────────────────

  /**
   * Called when watchExternalSources detects changes.
   * Increments version, builds delta, stores it, notifies connected Personal Twins.
   *
   * @sig-node DwellCultivatorDomain.onChangeDetected
   */
  private onChangeDetected(changes: DomainChangeEvent[]): void {
    if (changes.length === 0) return;

    const fromVersion = this.currentVersion;
    const toVersion = String(Number(this.currentVersion) + 1);
    this.currentVersion = toVersion;

    const delta = buildDelta(changes, fromVersion, toVersion);
    this.deltaStore.set(fromVersion, delta);

    notifyConnectedTwins(this.identity.twinId, this.identity.domain, this.deps.nats);
  }

  /**
   * Called when a Personal Twin requests an update since a given version.
   * Retrieves the stored delta and delivers it to the reply subject.
   *
   * @sig-node DwellCultivatorDomain.onUpdateRequest
   */
  private onUpdateRequest(sinceVersion: string, replySubject: string): void {
    const delta = this.deltaStore.get(sinceVersion);
    if (!delta) {
      console.warn(
        `[DwellCultivatorDomain] No delta found for sinceVersion=${sinceVersion}; ` +
          `twinId=${this.identity.twinId}`,
      );
      return;
    }
    deliverDelta(delta, replySubject, this.identity.twinId, this.identity.domain, this.deps.nats);
  }
}
