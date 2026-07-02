/**
 * Pure function for transforming a generic BridgeCard into a personalized one
 * using the learner's selected mental model and AntiquarianSnapshot.
 * No BB posts, no state mutation.
 *
 * Satisfies REQ-DW-BRG-02 (mental model anchor), REQ-DW-BRG-04 (personalized text).
 *
 * @namespace dwell
 * @sig d11-bridge.cypher
 */

import type { DwellAntiquarianSnapshot } from '../../events/types.js';
import type { DwellBridgeCardGeneric, DwellBridgeCardPersonalized, DwellMentalModel } from './types.js';

/**
 * Transforms a generic bridge card into a learner-specific card using the selected
 * mental model from the AntiquarianSnapshot. Populates personalizedText, anchorReference,
 * and mentalModelId. Returns a new DwellBridgeCardPersonalized.
 * Pure — no side effects, no BB access.
 *
 * @sig-node DwellBridge.personalize
 */
export function personalize(
  generic: DwellBridgeCardGeneric,
  model: DwellMentalModel,
  snapshot: DwellAntiquarianSnapshot,
): DwellBridgeCardPersonalized {
  // Build personalized text by referencing the learner's anchor experience
  // @adopt:dwell-bridge-personalized-text-template  [resolved: "{anchor}: {generic text}"]
  const personalizedText = `Drawing on your experience with "${model.name}": ${generic.genericText}`;

  // The anchor reference is the human-readable label for the experience used
  const anchorReference = model.name;

  return {
    // Inherit all generic card fields (value-object extension)
    ...generic,
    // Personalization fields
    personalizedText,
    anchorReference,
    mentalModelId: model.id,
  };
}
