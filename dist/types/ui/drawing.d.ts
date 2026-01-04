/**
 * Drawing mode (experimental)
 *
 * Uses Mapbox GL Draw under the hood, but provides a custom bottom toolbar UI
 * inspired by `open_felt.py`.
 *
 * NOTE: We intentionally keep this module self-contained and only load external
 * dependencies (mapbox-gl-draw) when enabled.
 */
import type { FusedMapsConfig } from '../types';
export declare function setupDrawing(map: mapboxgl.Map, config: FusedMapsConfig): Promise<{
    destroy: () => void;
    setVisible: (v: boolean) => void;
    getGeoJSON: () => any;
} | null>;
