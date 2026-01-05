/**
 * Layer management - add, remove, toggle visibility
 *
 * This module handles the actual Mapbox GL layer operations.
 * State is managed by LayerStore in state/layer-store.ts.
 */
import type { LayerConfig, FusedMapsConfig } from '../types';
/**
 * Get all computed layer GeoJSONs
 */
export declare function getLayerGeoJSONs(): Record<string, GeoJSON.FeatureCollection>;
/**
 * Update (or create) a computed GeoJSON for a layer.
 * Also syncs to LayerStore if available.
 */
export declare function setLayerGeoJSON(layerId: string, geojson: GeoJSON.FeatureCollection): void;
/**
 * Clear a layer's GeoJSON from cache
 */
export declare function clearLayerGeoJSON(layerId: string): void;
/**
 * Add all layers to the map
 */
export declare function addAllLayers(map: mapboxgl.Map, layers: LayerConfig[], visibilityState: Record<string, boolean>, config: FusedMapsConfig): {
    deckOverlay: unknown;
};
/**
 * Add a single layer to the map
 */
export declare function addSingleLayer(map: mapboxgl.Map, layer: LayerConfig, visible: boolean, config?: FusedMapsConfig): void;
/**
 * Remove a single layer from the map
 */
export declare function removeSingleLayer(map: mapboxgl.Map, layer: LayerConfig): void;
/**
 * Attempt an in-place style update for a layer.
 * Returns true if update was applied without needing remove+add.
 *
 * We only do this for "style-ish" changes. For structural changes
 * (URL/source changes, geometry toggles, etc.), return false.
 */
export declare function updateLayerStyleInPlace(map: mapboxgl.Map, before: LayerConfig, after: LayerConfig, visible: boolean): boolean;
/**
 * Set visibility for a single layer
 */
export declare function setLayerVisibility(map: mapboxgl.Map, layerId: string, visible: boolean, layers: LayerConfig[], deckOverlay: unknown): void;
export * from './hex';
export * from './vector';
export * from './raster';
export * from './pmtiles';
