/**
 * Schema exports for AI agent integration.
 *
 * This module provides JSON Schema definitions and tool definitions
 * that can be used by AI frameworks (OpenAI, Claude, LangChain, etc.)
 * to understand how to generate valid FusedMaps configurations.
 */
import { configSchema } from './config.schema';
import { layerSchema, colorScaleSchema } from './layer.schema';
export { examples, getExample, listExamples, getExamplesByLayerType } from './examples';
export { colorScaleSchema };
export { PALETTE_CATEGORIES, ALL_PALETTES, PALETTE_INFO, getPalettesByCategory, getAllPalettes, getPaletteInfo, suggestPalette, getPaletteColors, isValidPalette, findClosestPalette } from './palettes';
/**
 * JSON Schema for FusedMapsConfig
 */
export { configSchema, layerSchema };
/**
 * Get a tool definition compatible with OpenAI function calling format.
 * This can be used directly with OpenAI, Claude tools, or LangChain.
 */
export declare function getToolDefinition(): {
    name: string;
    description: string;
    parameters: {
        type: string;
        required: string[];
        properties: {
            center: {
                type: string;
                items: {
                    type: string;
                };
                minItems: number;
                maxItems: number;
                description: string;
            };
            zoom: {
                type: string;
                minimum: number;
                maximum: number;
                description: string;
            };
            layers: {
                type: string;
                description: string;
                items: {
                    type: string;
                    required: string[];
                    properties: {
                        id: {
                            type: string;
                            description: string;
                        };
                        name: {
                            type: string;
                            description: string;
                        };
                        layerType: {
                            type: string;
                            enum: string[];
                            description: string;
                        };
                        data: {
                            description: string;
                        };
                        dataUrl: {
                            type: string;
                            description: string;
                        };
                        style: {
                            type: string;
                            properties: {
                                fillColor: {
                                    description: string;
                                };
                                lineColor: {
                                    description: string;
                                };
                                opacity: {
                                    type: string;
                                    description: string;
                                };
                                pointRadius: {
                                    type: string;
                                    description: string;
                                };
                                lineWidth: {
                                    type: string;
                                    description: string;
                                };
                                extruded: {
                                    type: string;
                                    description: string;
                                };
                                elevationAttr: {
                                    type: string;
                                    description: string;
                                };
                            };
                        };
                        tooltip: {
                            type: string;
                            items: {
                                type: string;
                            };
                            description: string;
                        };
                    };
                };
            };
            basemap: {
                type: string;
                enum: string[];
                description: string;
            };
        };
    };
};
/**
 * Get a simplified tool definition with fewer options.
 * Better for agents that struggle with complex schemas.
 */
export declare function getSimpleToolDefinition(): {
    name: string;
    description: string;
    parameters: {
        type: string;
        required: string[];
        properties: {
            center: {
                type: string;
                description: string;
            };
            zoom: {
                type: string;
                description: string;
            };
            layers: {
                type: string;
                items: {
                    type: string;
                    required: string[];
                    properties: {
                        layerType: {
                            enum: string[];
                        };
                        data: {
                            description: string;
                        };
                        style: {
                            type: string;
                            properties: {
                                fillColor: {
                                    description: string;
                                };
                            };
                        };
                    };
                };
            };
        };
    };
};
/**
 * Get MCP (Model Context Protocol) tool definition.
 */
export declare function getMcpToolDefinition(): {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        required: string[];
        properties: {
            center: {
                type: string;
                items: {
                    type: string;
                };
                minItems: number;
                maxItems: number;
                description: string;
            };
            zoom: {
                type: string;
                minimum: number;
                maximum: number;
                description: string;
            };
            layers: {
                type: string;
                description: string;
                items: {
                    type: string;
                    required: string[];
                    properties: {
                        id: {
                            type: string;
                            description: string;
                        };
                        name: {
                            type: string;
                            description: string;
                        };
                        layerType: {
                            type: string;
                            enum: string[];
                            description: string;
                        };
                        data: {
                            description: string;
                        };
                        dataUrl: {
                            type: string;
                            description: string;
                        };
                        style: {
                            type: string;
                            properties: {
                                fillColor: {
                                    description: string;
                                };
                                lineColor: {
                                    description: string;
                                };
                                opacity: {
                                    type: string;
                                    description: string;
                                };
                                pointRadius: {
                                    type: string;
                                    description: string;
                                };
                                lineWidth: {
                                    type: string;
                                    description: string;
                                };
                                extruded: {
                                    type: string;
                                    description: string;
                                };
                                elevationAttr: {
                                    type: string;
                                    description: string;
                                };
                            };
                        };
                        tooltip: {
                            type: string;
                            items: {
                                type: string;
                            };
                            description: string;
                        };
                    };
                };
            };
            basemap: {
                type: string;
                enum: string[];
                description: string;
            };
        };
    };
};
