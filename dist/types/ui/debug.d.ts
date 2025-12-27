/**
 * Debug panel (minimal) - ported from map_utils.py.
 *
 * Goal: quick view-state editing + JSON dumps for debugging.
 */
import type { FusedMapsConfig } from '../types';
export interface DebugHandle {
    destroy: () => void;
}
export declare function setupDebugPanel(map: mapboxgl.Map, config: FusedMapsConfig): DebugHandle;
