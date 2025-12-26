/**
 * Color legend component
 */
import type { LayerConfig } from '../types';
/**
 * Setup the legend container
 */
export declare function setupLegend(layers: LayerConfig[], visibilityState: Record<string, boolean>, geojsons: Record<string, GeoJSON.FeatureCollection>): void;
/**
 * Update the legend based on visible layers
 */
export declare function updateLegend(layers: LayerConfig[], visibilityState: Record<string, boolean>, geojsons: Record<string, GeoJSON.FeatureCollection>): void;
