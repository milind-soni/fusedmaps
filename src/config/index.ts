/**
 * Config module - handles normalization of layer configs
 *
 * Converts new clean user-facing format to internal format.
 */

export { normalizeColor, normalizeLayerConfig, normalizeConfig, isNewFormat } from './normalize';

// Validation
export { validate, isValid, formatErrors } from './validate';
export type { ValidationError, ValidationResult } from './validate';

// Smart defaults
export { applyDefaults, applyLayerDefaults, generateLayerId, resetLayerCounter } from './defaults';
export type { SimpleMapConfig } from './defaults';

// Forgiving input normalization
export {
  normalizeInputs,
  normalizeLayer,
  normalizeLayerType,
  normalizeCenter,
  normalizeBasemap,
  normalizeStyle,
  normalizeColor as normalizeColorInput,
  normalizeData,
  normalizeGeoJSON
} from './normalize-inputs';
