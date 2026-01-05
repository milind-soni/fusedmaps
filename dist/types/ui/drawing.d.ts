/**
 * Drawing mode (experimental)
 *
 * Hybrid approach inspired by `open_felt.py`:
 * - SVG overlay for freehand/arrow (direct color application, no expression issues)
 * - Terra Draw for shapes (polygon, line, rectangle, circle) with per-feature style functions
 *
 * This fixes the coloring issues that plagued the Mapbox GL Draw approach.
 */
import type { FusedMapsConfig } from '../types';
export declare function setupDrawing(map: mapboxgl.Map, config: FusedMapsConfig): Promise<{
    destroy: () => void;
    setVisible: (v: boolean) => void;
    getGeoJSON: () => any;
} | null>;
