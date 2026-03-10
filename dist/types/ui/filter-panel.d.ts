/**
 * Data filter panel – per-layer dual-range slider (continuous) + checkbox list (categorical).
 */
import type { WidgetPosition } from '../types';
import type { FilterableLayerInfo } from '../layers/hex-tiles';
type ContinuousFilterCallback = (layerId: string, range: [number, number] | null) => void;
type CategoricalFilterCallback = (layerId: string, selected: Set<string> | null) => void;
export declare function setupFilterPanel(onContinuousChange: ContinuousFilterCallback, onCategoricalChange: CategoricalFilterCallback, position?: WidgetPosition, expanded?: boolean): {
    destroy: () => void;
};
/**
 * Initialize continuous filter state for layers.
 */
export declare function initFilterMinMax(infos: FilterableLayerInfo[], getDataFn: (info: FilterableLayerInfo) => any[] | null): void;
/**
 * Initialize categorical filter state for layers.
 */
export declare function initCategoricalFilter(infos: FilterableLayerInfo[], getDataFn: (info: FilterableLayerInfo) => any[] | null): void;
/**
 * Store the full list of filter infos so re-renders show everything.
 */
export declare function setAllFilterInfos(infos: FilterableLayerInfo[]): void;
export {};
