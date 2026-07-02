/**
 * Pure functions for selecting the best mental model anchor for a bridge request.
 * No BB posts, no NATS calls. Deterministic selection logic per
 * REQ-DW-BRG-02, REQ-DW-BRG-03, REQ-DW-BRG-05.
 *
 * @namespace dwell
 * @sig d11-bridge.cypher
 */

import type { DwellAntiquarianSnapshot } from '../../events/types.js';
import type { DwellMentalModel, DwellMentalModelType } from './types.js';

// ── Thresholds ────────────────────────────────────────────────────────────

/** Strength threshold above which operational/embodied models receive a fit boost. */
const OPERATIONAL_STRENGTH_THRESHOLD = 0.80; // @adopt:dwell-bridge-operational-strength-threshold  [resolved: 0.80]

/** Minimum strength for a mental model to be eligible as an anchor. */
const MIN_VIABLE_STRENGTH = 0.20; // @adopt:dwell-bridge-min-viable-strength  [resolved: 0.20]

/** Minimum strength required for convergent-misconception gap anchors (stricter). */
const CONVERGENT_MISCONCEPTION_MIN_STRENGTH = 0.50; // @adopt:dwell-bridge-cm-min-strength  [resolved: 0.50]

// ── Signal strength → numeric map ─────────────────────────────────────────
// @adopt:dwell-signal-strength-numerics  [resolved: strong=0.90, weak=0.40, conflicting=0.30, none=0.00]
const SIGNAL_STRENGTH_MAP: Readonly<Record<string, number>> = {
  strong:      0.90,
  weak:        0.40,
  conflicting: 0.30,
  none:        0.00,
} as const;

// ── Source name → model type inference ────────────────────────────────────

const ACADEMIC_KEYWORDS    = ['textbook', 'academic', 'theory', 'theoretical', 'lecture'];
const EMBODIED_KEYWORDS    = ['embodied', 'simulation', 'hands-on', 'hands on', 'lab', 'practical'];
const EXPERIENTIAL_KEYWORDS = ['field', 'experiential', 'real-world', 'on-the-job', 'internship'];

function inferModelType(sourceName: string): DwellMentalModelType {
  const lower = sourceName.toLowerCase();
  if (ACADEMIC_KEYWORDS.some((kw) => lower.includes(kw)))    return 'academic';
  if (EMBODIED_KEYWORDS.some((kw) => lower.includes(kw)))    return 'embodied';
  if (EXPERIENTIAL_KEYWORDS.some((kw) => lower.includes(kw))) return 'experiential';
  return 'operational'; // default: direct practice/operational experience
}

// ── deriveModelsFromSnapshot (internal) ───────────────────────────────────

/**
 * Derives DwellMentalModel candidates by grouping evidence sources across nodes
 * in the AntiquarianSnapshot. Each unique source becomes one candidate model.
 * Strength is computed as the mean numeric signal strength across all nodes
 * that cite the source.
 */
function deriveModelsFromSnapshot(snapshot: DwellAntiquarianSnapshot): DwellMentalModel[] {
  // Accumulate signal strengths and conceptIds per source
  const sourceMap = new Map<string, { strengths: number[]; conceptIds: string[] }>();

  for (const node of snapshot.nodes) {
    const numericStrength = SIGNAL_STRENGTH_MAP[node.signalStrength] ?? 0;
    for (const src of node.evidenceSources) {
      const entry = sourceMap.get(src) ?? { strengths: [], conceptIds: [] };
      entry.strengths.push(numericStrength);
      if (!entry.conceptIds.includes(node.conceptId)) {
        entry.conceptIds.push(node.conceptId);
      }
      sourceMap.set(src, entry);
    }
  }

  const models: DwellMentalModel[] = [];
  for (const [source, { strengths, conceptIds }] of sourceMap.entries()) {
    const avgStrength = strengths.reduce((a, b) => a + b, 0) / strengths.length;
    models.push({
      id:         source,
      name:       source,
      domain:     snapshot.domain,
      modelType:  inferModelType(source),
      strength:   avgStrength,
      conceptIds,
    });
  }

  return models;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Returns a 0–1 fit score for a mental model against a bridge type.
 * Operational/embodied models with strength > 0.80 are preferred over academic.
 * Pure — no side effects.
 *
 * REQ-DW-BRG-02: operational/embodied anchors preferred.
 *
 * @sig-node DwellBridge.scoreModelFit
 */
export function scoreModelFit(model: DwellMentalModel, bridgeType: string): number {
  const base = model.strength;

  // Operational/embodied models above threshold receive a fit boost
  if (
    (model.modelType === 'operational' || model.modelType === 'embodied') &&
    model.strength > OPERATIONAL_STRENGTH_THRESHOLD
  ) {
    return Math.min(1.0, base * 1.2);
  }

  // Academic models are less effective bridge anchors (REQ-DW-BRG-02)
  if (model.modelType === 'academic') {
    return base * 0.7;
  }

  return base;
}

/**
 * Picks the best mental model anchor for a bridge type and gap type.
 *
 * For convergent-misconception gaps (REQ-DW-BRG-05): only selects models with
 * strength >= CONVERGENT_MISCONCEPTION_MIN_STRENGTH and modelType !== 'academic',
 * because academic models are the most common source of convergent misconceptions.
 *
 * Returns null if no suitable model is found. Pure — no side effects.
 *
 * @sig-node DwellBridge.selectMentalModel
 */
export function selectMentalModel(
  snapshot: DwellAntiquarianSnapshot,
  bridgeType: string,
  gapType: string,
): DwellMentalModel | null {
  const candidates = deriveModelsFromSnapshot(snapshot);

  if (candidates.length === 0) return null;

  // Convergent-misconception: stricter eligibility — no academic models, higher min strength
  // REQ-DW-BRG-05: only select from domains orthogonal to misleading prior domains
  const minStrength =
    gapType === 'convergent-misconception' ? CONVERGENT_MISCONCEPTION_MIN_STRENGTH : MIN_VIABLE_STRENGTH;

  let eligible = candidates.filter((m) => m.strength >= minStrength);

  if (gapType === 'convergent-misconception') {
    // Exclude academic models — they are the most likely source of the misconception
    eligible = eligible.filter((m) => m.modelType !== 'academic');
  }

  if (eligible.length === 0) return null;

  // Score and sort descending
  const scored = eligible
    .map((m) => ({ model: m, score: scoreModelFit(m, bridgeType) }))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.model ?? null;
}
