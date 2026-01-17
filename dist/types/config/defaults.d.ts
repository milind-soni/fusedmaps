/**
 * Smart defaults for AI-agent-generated configs.
 *
 * Applies sensible defaults to minimize required fields,
 * making it easier for AI agents to generate valid configs.
 */
import type { FusedMapsConfig, LayerConfig, ViewState } from '../types';
/**
 * Reset the layer counter (useful for testing)
 */
export declare function resetLayerCounter(): void;
/**
 * Generate a unique layer ID
 */
export declare function generateLayerId(): string;
/**
 * Simplified config format that AI agents can easily generate
 */
export interface SimpleMapConfig {
    /** Map center [longitude, latitude]. Omit to auto-fit to data. */
    center?: [number, number];
    /** Zoom level 0-22 */
    zoom?: number;
    /** Map pitch (tilt) in degrees */
    pitch?: number;
    /** Map bearing (rotation) in degrees */
    bearing?: number;
    /** Base map style */
    basemap?: 'dark' | 'light' | 'streets' | 'satellite' | 'none';
    /** Data layers */
    layers: Array<Partial<LayerConfig> & {
        layerType: LayerConfig['layerType'];
    }>;
    /** Mapbox access token (optional - uses default if not provided) */
    mapboxToken?: string;
    /** UI options */
    ui?: {
        legend?: boolean;
        layerPanel?: boolean;
        tooltip?: boolean;
        controls?: boolean;
        scale?: boolean;
    };
}
/**
 * Apply smart defaults to a simplified config.
 * Converts SimpleMapConfig to full FusedMapsConfig.
 */
export declare function applyDefaults(config: SimpleMapConfig): FusedMapsConfig;
/**
 * Apply defaults to a single layer config
 */
export declare function applyLayerDefaults(layer: Partial<LayerConfig> & {
    layerType: LayerConfig['layerType'];
}, index: number): LayerConfig;
/**
 * Infer view state from layer data bounds
 */
export declare function inferViewStateFromData(layers: LayerConfig[]): ViewState | null;
/**
 * Check if config has explicit view state
 */
export declare function hasExplicitViewState(config: SimpleMapConfig): boolean;
