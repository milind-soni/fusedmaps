/**
 * Color legend component
 */
import type { LayerConfig } from '../types';
type WidgetPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
/**
 * Setup the legend container
 */
export declare function setupLegend(layers: LayerConfig[], visibilityState: Record<string, boolean>, geojsons: Record<string, GeoJSON.FeatureCollection>, position?: WidgetPosition, tileData?: Map<string, any[]>, expanded?: boolean): void;
/**
 * Update the legend based on visible layers
 */
export declare function updateLegend(layers: LayerConfig[], visibilityState: Record<string, boolean>, geojsons: Record<string, GeoJSON.FeatureCollection>, tileData?: Map<string, any[]>): void;
export {};
