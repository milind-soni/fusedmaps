/**
 * Click-to-highlight interaction
 */
import type { LayerConfig } from '../types';
export interface HighlightConfig {
    idFields?: string[];
}
/**
 * Register original GeoJSON data for a layer (called from vector.ts)
 * This allows highlight to use full geometries instead of tile-clipped fragments
 */
export declare function registerOriginalGeoJSON(layerId: string, geojson: GeoJSON.FeatureCollection): void;
/**
 * Setup click-to-highlight for all layers.
 *
 * Each call creates isolated closure state and namespaced Mapbox source/layer IDs,
 * so multiple map instances on the same page work independently.
 */
export declare function setupHighlight(map: mapboxgl.Map, layers: LayerConfig[], visibilityState: Record<string, boolean>, deckOverlay: unknown, config?: HighlightConfig): void;
