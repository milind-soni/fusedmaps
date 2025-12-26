/**
 * Click-to-highlight interaction
 */
import type { LayerConfig } from '../types';
/**
 * Setup click-to-highlight for all layers
 */
export declare function setupHighlight(map: mapboxgl.Map, layers: LayerConfig[], visibilityState: Record<string, boolean>, deckOverlay: unknown): void;
