/**
 * PMTiles support for FusedMaps
 *
 * Uses mapbox-pmtiles library with Mapbox GL JS v3's setSourceType()
 */
import type { PMTilesLayerConfig } from '../types';
/**
 * Add PMTiles layers to the map
 */
export declare function addPMTilesLayers(map: mapboxgl.Map, layers: PMTilesLayerConfig[], visibilityState: Record<string, boolean>, hasCustomView?: boolean): Promise<void>;
/**
 * Update visibility of PMTiles layers
 */
export declare function updatePMTilesVisibility(map: mapboxgl.Map, layerId: string, visible: boolean): void;
/**
 * Remove PMTiles layers from the map
 */
export declare function removePMTilesLayers(map: mapboxgl.Map, layerId: string): void;
/**
 * Check if PMTiles layers exist for a given layer ID
 */
export declare function hasPMTilesLayers(map: mapboxgl.Map, layerId: string): boolean;
