/**
 * Click broadcast - sends click events when map features are clicked
 */
import type { LayerConfig } from '../types';
export interface ClickBroadcastConfig {
    channel?: string;
    messageType?: string;
    properties?: string[] | null;
    includeCoords?: boolean;
    includeLayer?: boolean;
}
interface ClickBroadcastState {
    destroy: () => void;
}
/**
 * Enable click broadcast on a map
 */
export declare function enableClickBroadcast(map: mapboxgl.Map, layers: LayerConfig[], deckOverlay: any | null, // DeckTileOverlayState for hex tile layers
config: ClickBroadcastConfig): ClickBroadcastState;
export {};
