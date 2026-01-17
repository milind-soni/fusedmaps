/**
 * Canonical examples for AI agent training and documentation.
 *
 * These examples demonstrate common use cases and serve as templates
 * that AI agents can reference when generating map configurations.
 *
 * Note: These examples use the simplified AI-friendly format with 'data'
 * property which gets normalized to layer-specific properties internally.
 */
/**
 * Simplified layer config for examples (AI-friendly format)
 */
interface SimpleLayerConfig {
    id?: string;
    name?: string;
    layerType: 'hex' | 'vector' | 'mvt' | 'raster' | 'pmtiles';
    data?: unknown;
    dataUrl?: string;
    geojson?: unknown;
    tileUrl?: string;
    opacity?: number;
    style?: {
        fillColor?: unknown;
        lineColor?: unknown;
        opacity?: number;
        filled?: boolean;
        stroked?: boolean;
        extruded?: boolean;
        elevationAttr?: string;
        elevationScale?: number;
        lineWidth?: number;
        pointRadius?: number;
    };
    tooltip?: string[];
}
export interface MapExample {
    name: string;
    description: string;
    config: {
        center?: [number, number];
        zoom?: number;
        layers: SimpleLayerConfig[];
    };
}
/**
 * Minimal examples - simplest possible configs for each layer type
 */
export declare const minimalExamples: Record<string, MapExample>;
/**
 * Advanced examples - more complex configurations
 */
export declare const advancedExamples: Record<string, MapExample>;
/**
 * All examples combined
 */
export declare const examples: {
    [x: string]: MapExample;
};
/**
 * Get example by name
 */
export declare function getExample(name: string): MapExample | undefined;
/**
 * List all available example names
 */
export declare function listExamples(): string[];
/**
 * Get examples filtered by layer type
 */
export declare function getExamplesByLayerType(layerType: string): MapExample[];
export {};
