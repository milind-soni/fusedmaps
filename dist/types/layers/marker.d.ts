/**
 * Marker layer rendering — uses mapboxgl.Marker with custom HTML pin elements.
 * Supports built-in icons (corn, leaf, wheat, etc.) and custom inline SVG.
 */
import type { MarkerLayerConfig } from '../types';
export declare function addMarkerLayer(map: mapboxgl.Map, layer: MarkerLayerConfig, visible: boolean): void;
export declare function removeMarkerLayer(layerId: string): void;
export declare function setMarkerLayerVisibility(map: mapboxgl.Map, layerId: string, visible: boolean): void;
