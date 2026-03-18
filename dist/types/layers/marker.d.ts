/**
 * Marker layer — round colored circles with Lucide icon support.
 *
 * Icon sources (in priority order):
 *   1. "icon": "truck"  — fetches from Lucide CDN (https://lucide.dev/icons)
 *   2. "iconSvg": "<path d='...'/>"  — inline SVG markup
 *   3. "iconUrl": "https://..."  — external image URL
 *   4. (none) — plain colored circle
 */
import type { MarkerLayerConfig } from '../types';
export declare function addMarkerLayer(map: mapboxgl.Map, layer: MarkerLayerConfig, visible: boolean): Promise<void>;
export declare function removeMarkerLayer(layerId: string): void;
export declare function setMarkerLayerVisibility(map: mapboxgl.Map, layerId: string, visible: boolean): void;
