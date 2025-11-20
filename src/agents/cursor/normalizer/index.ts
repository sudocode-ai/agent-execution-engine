/**
 * Cursor Output Normalizer
 *
 * @module agents/cursor/normalizer
 */

export { CursorNormalizationState } from './state.js';
export { normalizeOutput } from './normalizer.js';
export {
  mapToolToAction,
  mapToolToActionWithResult,
  makePathRelative,
} from './mappers.js';
export type { ToolMapping } from './mappers.js';
