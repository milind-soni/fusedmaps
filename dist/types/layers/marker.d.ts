/**
 * Marker layer rendering — renders point features as colored SVG pin markers
 * using Mapbox symbol layers.
 */
import type { MarkerLayerConfig } from '../types';
export declare function addMarkerLayer(map: mapboxgl.Map, layer: MarkerLayerConfig, visible: boolean): Promise<void>;
export declare function setMarkerLayerVisibility(map: mapboxgl.Map, layerId: string, visible: boolean): void;
