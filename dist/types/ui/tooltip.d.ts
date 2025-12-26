/**
 * Hover tooltip component
 */
import type { LayerConfig } from '../types';
/**
 * Setup tooltip for the map
 */
export declare function setupTooltip(map: mapboxgl.Map, layers: LayerConfig[], visibilityState: Record<string, boolean>): void;
