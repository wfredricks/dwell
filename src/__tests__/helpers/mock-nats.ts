/**
 * MockNats — an in-memory NatsClient implementation for integration tests.
 *
 * Supports wildcard subscriptions (* single-token, > trailing) so that agents
 * registered with pattern subscriptions (e.g. 'bb.learner.*.baseline') receive
 * events published to matching subjects (e.g. 'bb.learner.aws-saa.baseline').
 *
 * Published events are captured in `events` for assertion.
 *
 * @namespace dwell
 */

import type { NatsClient } from '../../types.js';

// ── Pattern matcher (same logic as mock-blackboard) ───────────────────────

export function matchesNatsPattern(subject: string, pattern: string): boolean {
  if (pattern === subject) return true;

  const sParts = subject.split('.');
  const pParts = pattern.split('.');

  let si = 0;
  let pi = 0;

  while (si < sParts.length && pi < pParts.length) {
    const pt = pParts[pi];

    if (pt === '>') return true;

    if (pt === '*') {
      si++;
      pi++;
      continue;
    }

    if (pt !== sParts[si]) return false;

    si++;
    pi++;
  }

  return si === sParts.length && pi === pParts.length;
}

// ── Entry type ─────────────────────────────────────────────────────────────

interface SubEntry {
  pattern: string;
  handler: (data: unknown) => void;
}

// ── MockNats ──────────────────────────────────────────────────────────────

export class MockNats implements NatsClient {
  private readonly subs: SubEntry[] = [];

  /** Every published event in order — for assertion. */
  readonly events: Array<{ subject: string; data: unknown }> = [];

  publish(subject: string, data: unknown): void {
    this.events.push({ subject, data });

    // Fire all matching subscribers synchronously
    // Copy array to avoid mutation issues if a handler adds/removes subs
    for (const entry of [...this.subs]) {
      if (matchesNatsPattern(subject, entry.pattern)) {
        entry.handler(data);
      }
    }
  }

  subscribe(pattern: string, handler: (data: unknown) => void): () => void {
    const entry: SubEntry = { pattern, handler };
    this.subs.push(entry);

    return () => {
      const idx = this.subs.indexOf(entry);
      if (idx >= 0) this.subs.splice(idx, 1);
    };
  }

  /** Return all events matching a subject (exact or pattern). */
  eventsFor(subject: string): Array<{ subject: string; data: unknown }> {
    return this.events.filter((e) => matchesNatsPattern(e.subject, subject));
  }

  /** Return first event matching subject, or undefined. */
  firstEventFor(subject: string): unknown | undefined {
    return this.eventsFor(subject)[0]?.data;
  }

  /** Clear captured events (useful for test isolation within one describe). */
  reset(): void {
    this.events.length = 0;
  }
}
