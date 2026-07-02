/**
 * MockBlackboard — a real in-memory Blackboard implementation for integration tests.
 *
 * Unlike the vi.fn() mock used in unit tests, this implementation provides
 * real pub/sub semantics so agents can coordinate through BB state without
 * a live NATS/Redis backing store.
 *
 * Behaviour:
 *   - read(key)              → returns stored value or null if absent
 *   - write(key, value)      → stores value AND fires all matching subscribers
 *   - subscribe(pattern, h)  → registers handler; returns unsubscribe fn
 *
 * Pattern matching: supports '*' wildcard (single token) and '>' (multi-token suffix),
 * matching the NATS subject-pattern semantics used elsewhere in Dwell.
 *
 * @namespace dwell
 */

import type { Blackboard } from '../../types.js';

// ── Pattern matcher ───────────────────────────────────────────────────────

/**
 * Returns true if `key` matches `pattern`.
 *
 * Rules (NATS-style, applied to dot-delimited keys):
 *   - '*' matches exactly one token
 *   - '>' matches one or more trailing tokens
 *   - Exact strings match only themselves
 */
function matchesPattern(key: string, pattern: string): boolean {
  if (pattern === key) return true;

  const keyParts     = key.split('.');
  const patternParts = pattern.split('.');

  let ki = 0;
  let pi = 0;

  while (ki < keyParts.length && pi < patternParts.length) {
    const pt = patternParts[pi];

    if (pt === '>') {
      // '>' matches everything remaining — always a match from here
      return true;
    }

    if (pt === '*') {
      // '*' matches any single token
      ki++;
      pi++;
      continue;
    }

    if (pt !== keyParts[ki]) {
      return false;
    }

    ki++;
    pi++;
  }

  // Both exhausted at the same time → exact match
  return ki === keyParts.length && pi === patternParts.length;
}

// ── Entry type ─────────────────────────────────────────────────────────────

interface SubscriberEntry {
  pattern: string;
  handler: (event: unknown) => void;
}

// ── MockBlackboard ─────────────────────────────────────────────────────────

export class MockBlackboard implements Blackboard {
  private readonly store: Map<string, unknown> = new Map();
  private readonly subscribers: SubscriberEntry[] = [];

  /** All (key, value) writes — accessible for test assertions. */
  readonly writes: Array<{ key: string; value: unknown }> = [];

  // ── Blackboard interface ──────────────────────────────────────────────

  async read(key: string): Promise<unknown> {
    return this.store.get(key) ?? null;
  }

  async write(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
    this.writes.push({ key, value });

    // Fire matching subscribers synchronously
    for (const entry of this.subscribers) {
      if (matchesPattern(key, entry.pattern)) {
        entry.handler({ key, value });
      }
    }
  }

  subscribe(pattern: string, handler: (event: unknown) => void): () => void {
    const entry: SubscriberEntry = { pattern, handler };
    this.subscribers.push(entry);

    return () => {
      const idx = this.subscribers.indexOf(entry);
      if (idx >= 0) this.subscribers.splice(idx, 1);
    };
  }

  // ── Test helpers ──────────────────────────────────────────────────────

  /** Directly pre-populate a key for test setup (no subscriber fire). */
  seed(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  /** Return the current value of a key synchronously (for test assertions). */
  peek(key: string): unknown {
    return this.store.get(key) ?? null;
  }

  /** Clear all stored state and write history. */
  reset(): void {
    this.store.clear();
    this.writes.length = 0;
  }
}
