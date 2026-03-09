/**
 * Data filter panel – per-layer dual-range slider.
 * No histogram; min/max computed once on init.
 */
import type { WidgetPosition } from '../types';
import type { FilterableLayerInfo } from '../layers/hex-tiles';
type FilterCallback = (layerId: string, range: [number, number] | null) => void;
export declare function setupFilterPanel(onFilterChange: FilterCallback, position?: WidgetPosition, expanded?: boolean): {
    destroy: () => void;
};
/**
 * Initialize filter state for layers. Called once when data first becomes available.
 * For tiled layers, call when tiles load. For inline, call on init.
 */
export declare function initFilterMinMax(infos: FilterableLayerInfo[], getDataFn: (info: FilterableLayerInfo) => any[] | null): void;
export {};
