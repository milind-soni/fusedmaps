/**
 * Color legend component
 */
import type { LayerConfig } from '../types';
type WidgetPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export declare function setupLegend(layers: LayerConfig[], visibilityState: Record<string, boolean>, geojsons: Record<string, GeoJSON.FeatureCollection>, position?: WidgetPosition, tileData?: Map<string, any[]>, expanded?: boolean): void;
export declare function updateLegend(layers: LayerConfig[], visibilityState: Record<string, boolean>, geojsons: Record<string, GeoJSON.FeatureCollection>, tileData?: Map<string, any[]>): void;
export {};
