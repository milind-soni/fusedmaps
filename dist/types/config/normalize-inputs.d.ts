/**
 * Forgiving input normalization for AI-generated configs.
 *
 * AI agents make predictable mistakes. This module normalizes
 * common variations to valid formats, reducing errors.
 */
/**
 * Normalize a complete map config, handling common AI mistakes
 */
export declare function normalizeInputs(config: any): any;
/**
 * Normalize a single layer config
 */
export declare function normalizeLayer(layer: any): any;
/**
 * Normalize layer type variations
 */
export declare function normalizeLayerType(type: string): string;
/**
 * Normalize center coordinates
 */
export declare function normalizeCenter(center: any): [number, number] | undefined;
/**
 * Normalize basemap name
 */
export declare function normalizeBasemap(basemap: string): string;
/**
 * Normalize style object
 */
export declare function normalizeStyle(style: any): any;
/**
 * Normalize color value
 */
export declare function normalizeColor(color: any): any;
/**
 * Normalize data array
 */
export declare function normalizeData(data: any, layerType?: string): any;
/**
 * Normalize GeoJSON structure
 */
export declare function normalizeGeoJSON(geojson: any): any;
