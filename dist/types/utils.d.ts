/**
 * Shared utility functions
 */
/**
 * Clamp a number between min and max
 */
export declare function clamp(v: number, lo: number, hi: number): number;
/**
 * Safely execute a function, swallowing errors
 */
export declare function safe(fn: () => void): void;
/**
 * Parse hex color string to RGB array
 * @param hex - Color string like "#ff0000"
 * @param alpha - Optional alpha value (0-255)
 * @returns [r, g, b] or [r, g, b, a] array, or null if invalid
 */
export declare function parseHexColor(hex: string, alpha?: number): number[] | null;
/**
 * Convert RGB array to hex string
 */
export declare function rgbToHex(rgb: number[]): string;
/**
 * Format number with fixed decimal places
 */
export declare function fmt(n: number, digits: number): string;
import type { LayerConfig } from './types';
/**
 * Layer ID suffix patterns for each layer type
 */
export declare const LAYER_ID_SUFFIXES: {
    readonly hex: {
        readonly fill: "-fill";
        readonly extrusion: "-extrusion";
        readonly outline: "-outline";
    };
    readonly vector: {
        readonly fill: "-fill";
        readonly outline: "-outline";
        readonly circle: "-circle";
        readonly line: "-line";
    };
    readonly mvt: {
        readonly fill: "-fill";
        readonly line: "-line";
        readonly extrusion: "-extrusion";
    };
    readonly raster: {
        readonly raster: "-raster";
    };
    readonly pmtiles: {
        readonly fill: "-fill";
        readonly line: "-line";
        readonly circles: "-circles";
    };
};
/**
 * Get all possible Mapbox layer IDs for a given layer config.
 * This is the single source of truth for layer ID generation.
 *
 * @param layer - The layer configuration
 * @param options - Optional settings
 * @returns Array of Mapbox layer IDs (may not all exist on map)
 */
export declare function getMapboxLayerIds(layer: LayerConfig, options?: {
    includeAll?: boolean;
}): string[];
/**
 * Get layer IDs that can be queried for hover/click interactions.
 * Excludes tile layers (handled by Deck.gl) and non-queryable layers.
 *
 * @param layer - The layer configuration
 * @returns Array of queryable Mapbox layer IDs
 */
export declare function getQueryableLayerIds(layer: LayerConfig): string[];
/**
 * Get the first (primary) Mapbox layer ID for a layer config.
 * Used for beforeId calculations in layer ordering.
 *
 * @param layer - The layer configuration
 * @returns The first layer ID, or null for tile layers
 */
export declare function getFirstMapboxLayerId(layer: LayerConfig): string | null;
/**
 * Get all layer IDs to remove when removing a layer.
 * Includes all possible suffixes to ensure cleanup.
 */
export declare function getRemovableLayerIds(layer: LayerConfig): string[];
