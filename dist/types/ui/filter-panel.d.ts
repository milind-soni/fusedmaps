/**
 * Data filter panel – per-layer dual-range slider with mini histogram.
 * Renders as a separate dropdown widget (like layers / legend).
 */
import type { WidgetPosition } from '../types';
import type { FilterableLayerInfo } from '../layers/hex-tiles';
type FilterCallback = (layerId: string, range: [number, number] | null) => void;
export declare function setupFilterPanel(onFilterChange: FilterCallback, position?: WidgetPosition, expanded?: boolean): {
    destroy: () => void;
};
/**
 * Refresh histogram data for all filterable layers.
 * Call this on tile load events and map move.
 */
export declare function updateFilterHistograms(infos: FilterableLayerInfo[], binFn: (tileUrl: string, attr: string, info?: FilterableLayerInfo) => ReturnType<typeof import('../layers/hex-tiles').binHistogram>): void;
export {};
