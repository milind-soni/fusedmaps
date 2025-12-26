/**
 * Vector layer rendering (GeoJSON and MVT)
 */
import type { VectorLayerConfig, MVTLayerConfig } from '../types';
/**
 * Add a GeoJSON vector layer to the map
 */
export declare function addVectorLayer(map: mapboxgl.Map, layer: VectorLayerConfig, visible: boolean): void;
/**
 * Add an MVT vector tile layer to the map
 */
export declare function addMVTLayer(map: mapboxgl.Map, layer: MVTLayerConfig, visible: boolean): void;
/**
 * Toggle visibility of vector layer
 */
export declare function setVectorLayerVisibility(map: mapboxgl.Map, layerId: string, visible: boolean): void;
