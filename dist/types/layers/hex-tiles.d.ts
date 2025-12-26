/**
 * Hex tile layers via Deck.gl TileLayer + MapboxOverlay.
 *
 * Notes:
 * - We intentionally use globals (window.deck, window.hyparquet) to match the
 *   original map_utils.py approach and keep Rollup externals working.
 * - Required globals when tile layers are present:
 *   - window.deck (deck.gl UMD)
 *   - window.hyparquet (hyparquet ESM loaded into window)
 */
import type { LayerConfig } from '../types';
export interface DeckTileOverlayState {
    overlay: any;
    rebuild: () => void;
    pickObject: (opts: {
        x: number;
        y: number;
        radius?: number;
    }) => any;
}
export declare function createHexTileOverlay(map: mapboxgl.Map, layers: LayerConfig[], visibility: Record<string, boolean>): DeckTileOverlayState | null;
