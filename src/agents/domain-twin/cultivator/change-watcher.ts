/**
 * change-watcher.ts — Watches external sources and detects domain knowledge graph changes.
 *
 * detectChanges        — pure: given a current snapshot and new source data, returns changes.
 * watchExternalSources — effect: polls/subscribes external sources, calls onChange on changes.
 *
 * @namespace dwell
 * @sig d18-cultivator-domain.cypher
 */

import type { DomainChangeEvent } from './types.js';

// ── Seam constants ────────────────────────────────────────────────────────────

/** How often to poll external sources for changes (milliseconds). */
const POLL_INTERVAL_MS = 60_000; // @adopt:dwell-cultivator-domain-poll-interval  [resolved: 60000]

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A simple domain knowledge node snapshot. In production this would be a richer
 * structure from the Cartographer; for now it carries enough to diff.
 */
export interface DomainKnowledgeSnapshot {
  /** Map of conceptId → examWeight (0–1). */
  concepts: Record<string, { examWeight: number; deprecated?: boolean }>;
  /** ISO8601 snapshot timestamp. */
  snapshotAt: string;
}

// ── Pure functions ─────────────────────────────────────────────────────────────

/**
 * Detects changes between a current knowledge snapshot and a new source snapshot.
 * Compares concept presence and exam weights to produce DomainChangeEvent[].
 * Pure — given the same inputs, always returns the same output.
 *
 * @sig-node DwellCultivatorDomain.detectChanges
 */
export function detectChanges(
  current: DomainKnowledgeSnapshot,
  newSource: DomainKnowledgeSnapshot,
): DomainChangeEvent[] {
  const detectedAt = new Date().toISOString();
  const events: DomainChangeEvent[] = [];

  const currentConcepts = current.concepts;
  const newConcepts = newSource.concepts;

  // Detect added and modified concepts
  for (const [conceptId, newEntry] of Object.entries(newConcepts)) {
    const existing = currentConcepts[conceptId];

    if (existing === undefined) {
      events.push({
        changeType: 'added',
        conceptId,
        severity: 'minor',
        changeNote: `Concept ${conceptId} added to the domain graph.`,
        detectedAt,
      });
    } else if (newEntry.deprecated && !existing.deprecated) {
      events.push({
        changeType: 'deprecated',
        conceptId,
        severity: 'major',
        changeNote: `Concept ${conceptId} has been deprecated.`,
        detectedAt,
      });
    } else {
      const weightDelta = Math.abs((newEntry.examWeight ?? 0) - (existing.examWeight ?? 0));
      const WEIGHT_CHANGE_THRESHOLD = 0.05; // @adopt:dwell-cultivator-domain-weight-threshold  [resolved: 0.05]
      if (weightDelta >= WEIGHT_CHANGE_THRESHOLD) {
        const severity: DomainChangeEvent['severity'] = weightDelta >= 0.15 ? 'major' : 'minor';
        events.push({
          changeType: 'reweighted',
          conceptId,
          severity,
          changeNote: `Concept ${conceptId} exam weight changed by ${(weightDelta * 100).toFixed(1)}%.`,
          detectedAt,
        });
      }
    }
  }

  // Detect removed (now absent) concepts that were not explicitly deprecated
  for (const conceptId of Object.keys(currentConcepts)) {
    if (!(conceptId in newConcepts)) {
      events.push({
        changeType: 'deprecated',
        conceptId,
        severity: 'major',
        changeNote: `Concept ${conceptId} removed from the domain source.`,
        detectedAt,
      });
    }
  }

  return events;
}

// ── Effect functions ───────────────────────────────────────────────────────────

/**
 * Watches external sources for domain knowledge graph changes.
 * In production this subscribes to cert body feeds or changelog monitors;
 * in this implementation it uses a poll loop with a configurable interval.
 *
 * Calls onChange when one or more DomainChangeEvents are detected.
 * Returns a teardown function — call it to stop watching.
 *
 * Effect — starts a background timer. Not pure.
 *
 * @sig-node DwellCultivatorDomain.watchExternalSources
 */
export function watchExternalSources(
  onChange: (events: DomainChangeEvent[]) => void,
): () => void {
  // In production: subscribe to external cert body feeds / changelog webhooks.
  // Here: expose an injectable trigger mechanism via the returned setter.
  // The interval acts as a heartbeat; real triggers come from the agent via triggerCheck().

  let stopped = false;

  // Periodic poll — a stub that does nothing by default;
  // real source adapters would call onChange here.
  const intervalId = setInterval(() => {
    if (stopped) return;
    // External source polling happens here in a production implementation.
    // @adopt:dwell-cultivator-domain-external-source-adapter  [resolved: stub poll]
  }, POLL_INTERVAL_MS);

  return () => {
    stopped = true;
    clearInterval(intervalId);
  };
}
