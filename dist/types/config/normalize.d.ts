/**
 * Config normalizer - converts new clean config format to internal format
 *
 * New format (user-facing):
 *   { type: 'continuous', attr: 'value', palette: 'Viridis', domain: [0, 100] }
 *
 * Internal format (renderer):
 *   { '@@function': 'colorContinuous', attr: 'value', colors: 'Viridis', domain: [0, 100] }
 */
import type { LayerConfig, ColorValue, ColorConfig } from '../types';
/**
 * Convert new-style color config to legacy @@function format
 */
export declare function normalizeColor(color: ColorValue | undefined): ColorConfig | undefined;
/**
 * Normalize a layer config to internal format
 */
export declare function normalizeLayerConfig(config: LayerConfig): LayerConfig;
/**
 * Check if a layer config uses the new format (has `style` key)
 */
export declare function isNewFormat(config: any): boolean;
