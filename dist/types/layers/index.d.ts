/**
 * Layer management - add, remove, toggle visibility
 */
import type { LayerConfig, FusedMapsConfig } from '../types';
/**
 * Get all computed layer GeoJSONs
 */
export declare function getLayerGeoJSONs(): Record<string, GeoJSON.FeatureCollection>;
/**
 * Update (or create) a computed GeoJSON for a layer.
 * Useful for dynamic sources (e.g. DuckDB SQL filtered layers) without rebuilding all layers.
 */
export declare function setLayerGeoJSON(layerId: string, geojson: GeoJSON.FeatureCollection): void;
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
