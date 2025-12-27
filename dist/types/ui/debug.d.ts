/**
 * Debug panel (ported toward map_utils.py).
 *
 * In fusedmaps we focus on the deck/tile hex ecosystem; debug panel edits the in-memory
 * `config.layers` objects and triggers a Deck rebuild so changes apply immediately.
 */
import type { FusedMapsConfig } from '../types';
export interface DebugHandle {
    destroy: () => void;
}
export declare function setupDebugPanel(map: mapboxgl.Map, config: FusedMapsConfig): DebugHandle;
