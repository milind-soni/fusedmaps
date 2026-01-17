/**
 * FusedMaps - Interactive map library for Fused.io
 *
 * Renders H3 hexagon layers, GeoJSON vectors, MVT tiles, and raster tiles
 * using Mapbox GL JS and Deck.gl.
 */
import type { FusedMapsConfig, FusedMapsInstance, FusedMapsState } from './types';
import { formatErrors } from './config/validate';
import type { ValidationResult, ValidationError } from './config/validate';
import { type SimpleMapConfig } from './config/defaults';
import { getPaletteColors, getPaletteInfo, suggestPalette } from './schema/palettes';
import { getToolDefinition, getSimpleToolDefinition, getMcpToolDefinition } from './schema/index';
import { examples, getExample, listExamples } from './schema/examples';
export * from './types';
export { createLayerStore, LayerStore } from './state';
export type { LayerEvent, LayerEventType, LayerEventCallback } from './state';
export type { ValidationResult, ValidationError };
export type { SimpleMapConfig };
/**
 * Result from createMap() with success/error info for AI agents
 */
export interface CreateMapResult {
    /** Whether the map was created successfully */
    success: boolean;
    /** The FusedMaps instance (if successful) */
    instance: FusedMapsInstance | null;
    /** Current map state */
    state: FusedMapsState | null;
    /** Validation errors (if any) */
    errors: ValidationError[];
    /** Non-fatal warnings */
    warnings: string[];
}
/**
 * Create a map with a simplified config format.
 * This is the recommended entry point for AI agents.
 *
 * @example
 * ```typescript
 * const result = FusedMaps.createMap({
 *   center: [-122.4, 37.8],
 *   zoom: 10,
 *   layers: [{
 *     layerType: 'hex',
 *     data: [{ h3: '8928308280fffff', value: 100 }],
 *     style: { fillColor: { type: 'continuous', attr: 'value', palette: 'Viridis' } }
 *   }]
 * });
 *
 * if (result.success) {
 *   console.log('Map created!', result.state);
 * } else {
 *   console.error('Errors:', result.errors);
 * }
 * ```
 */
export declare function createMap(config: SimpleMapConfig): CreateMapResult;
/**
 * Validate a map config without creating a map.
 * Useful for AI agents to check configs before rendering.
 *
 * @example
 * ```typescript
 * const result = FusedMaps.validate(config);
 * if (!result.valid) {
 *   console.log('Errors:', result.errors);
 *   // AI agent can use error messages to fix the config
 * }
 * ```
 */
export declare function validate(config: unknown): ValidationResult;
/**
 * Format validation errors as a human-readable string.
 */
export { formatErrors };
/**
 * Get all available color palettes
 */
export declare function getPalettes(): {
    all: string[];
    byCategory: {
        readonly sequential: readonly ["Viridis", "Mint", "BluGrn", "Sunset", "Magenta", "SunsetDark", "Teal", "TealGrn", "Purp", "PurpOr", "Emrld", "OrYel", "Peach", "Burg", "RedOr", "BurgYl", "BluYl", "PinkYl", "DarkMint"];
        readonly diverging: readonly ["TealRose", "Temps", "Tropic", "Earth", "Fall", "Geyser", "ArmyRose"];
        readonly qualitative: readonly ["Bold", "Prism", "Safe", "Vivid", "Pastel", "Antique"];
    };
    sequential: string[];
    diverging: string[];
    qualitative: string[];
};
/**
 * Get colors for a specific palette
 */
export { getPaletteColors, getPaletteInfo, suggestPalette };
/**
 * Get tool definitions for AI frameworks
 */
export declare const schema: {
    /** OpenAI/Claude function calling format */
    getToolDefinition: typeof getToolDefinition;
    /** Simplified tool definition for agents that struggle with complex schemas */
    getSimpleToolDefinition: typeof getSimpleToolDefinition;
    /** MCP (Model Context Protocol) format */
    getMcpToolDefinition: typeof getMcpToolDefinition;
};
/**
 * Canonical examples for AI training
 */
export { examples, getExample, listExamples };
/**
 * Initialize a FusedMaps instance
 */
export declare function init(config: FusedMapsConfig): FusedMapsInstance;
declare const _default: {
    init: typeof init;
    createMap: typeof createMap;
    validate: typeof validate;
    formatErrors: typeof formatErrors;
    getPalettes: typeof getPalettes;
    getPaletteColors: typeof getPaletteColors;
    getPaletteInfo: typeof getPaletteInfo;
    suggestPalette: typeof suggestPalette;
    schema: {
        /** OpenAI/Claude function calling format */
        getToolDefinition: typeof getToolDefinition;
        /** Simplified tool definition for agents that struggle with complex schemas */
        getSimpleToolDefinition: typeof getSimpleToolDefinition;
        /** MCP (Model Context Protocol) format */
        getMcpToolDefinition: typeof getMcpToolDefinition;
    };
    examples: {
        [x: string]: import("./schema/examples").MapExample;
    };
    getExample: typeof getExample;
    listExamples: typeof listExamples;
};
export default _default;
