/**
 * Layer management - add, remove, toggle visibility
 */
import type { LayerConfig, FusedMapsConfig } from '../types';
/**
 * Get all computed layer GeoJSONs
 */
export declare function getLayerGeoJSONs(): Record<string, GeoJSON.FeatureCollection>;
/**
 * Add all layers to the map
 */
export declare function addAllLayers(map: mapboxgl.Map, layers: LayerConfig[], visibilityState: Record<string, boolean>, config: FusedMapsConfig): {
    deckOverlay: unknown;
};
/**
 * Set visibility for a single layer
 */
export declare function setLayerVisibility(map: mapboxgl.Map, layerId: string, visible: boolean, layers: LayerConfig[], deckOverlay: unknown): void;
export * from './hex';
export * from './vector';
export * from './raster';
