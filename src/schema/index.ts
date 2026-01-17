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
export {
  PALETTE_CATEGORIES,
  ALL_PALETTES,
  PALETTE_INFO,
  getPalettesByCategory,
  getAllPalettes,
  getPaletteInfo,
  suggestPalette,
  getPaletteColors,
  isValidPalette,
  findClosestPalette
} from './palettes';

/**
 * JSON Schema for FusedMapsConfig
 */
export { configSchema, layerSchema };

/**
 * Get a tool definition compatible with OpenAI function calling format.
 * This can be used directly with OpenAI, Claude tools, or LangChain.
 */
export function getToolDefinition() {
  return {
    name: 'create_map',
    description: `Create an interactive map with data visualization layers.

Supported layer types:
- hex: H3 hexagon grids (pass array of {h3: "index", ...props})
- vector: GeoJSON points, lines, polygons
- raster: Tile image overlays
- mvt: Mapbox Vector Tiles
- pmtiles: PMTiles format

Color options:
- Static: "#ff0000" or [255, 0, 0]
- Continuous: { type: "continuous", attr: "fieldName", palette: "Viridis" }
- Categorical: { type: "categorical", attr: "fieldName", palette: "Bold" }

Popular palettes: Viridis, Mint, Sunset, Magenta, Bold, Prism, Safe`,
    parameters: {
      type: 'object',
      required: ['layers'],
      properties: {
        center: {
          type: 'array',
          items: { type: 'number' },
          minItems: 2,
          maxItems: 2,
          description: 'Map center [longitude, latitude]. Omit to auto-fit to data.'
        },
        zoom: {
          type: 'number',
          minimum: 0,
          maximum: 22,
          description: 'Zoom level 0-22. Default: 10'
        },
        layers: {
          type: 'array',
          description: 'Data layers to display',
          items: {
            type: 'object',
            required: ['layerType'],
            properties: {
              id: {
                type: 'string',
                description: 'Unique layer ID. Auto-generated if omitted.'
              },
              name: {
                type: 'string',
                description: 'Display name for legend/panel.'
              },
              layerType: {
                type: 'string',
                enum: ['hex', 'vector', 'raster', 'mvt', 'pmtiles'],
                description: 'Layer type'
              },
              data: {
                description: 'Inline data (H3 array or GeoJSON)'
              },
              dataUrl: {
                type: 'string',
                description: 'URL to GeoJSON/CSV/Parquet'
              },
              style: {
                type: 'object',
                properties: {
                  fillColor: {
                    description: 'Fill color - string, RGB array, or color scale object'
                  },
                  lineColor: {
                    description: 'Stroke color'
                  },
                  opacity: {
                    type: 'number',
                    description: '0-1, default 0.8'
                  },
                  pointRadius: {
                    type: 'number',
                    description: 'Point size in pixels'
                  },
                  lineWidth: {
                    type: 'number',
                    description: 'Stroke width in pixels'
                  },
                  extruded: {
                    type: 'boolean',
                    description: '3D extrusion'
                  },
                  elevationAttr: {
                    type: 'string',
                    description: 'Attribute for 3D height'
                  }
                }
              },
              tooltip: {
                type: 'array',
                items: { type: 'string' },
                description: 'Properties to show on hover'
              }
            }
          }
        },
        basemap: {
          type: 'string',
          enum: ['dark', 'light', 'streets', 'satellite'],
          description: 'Base map style. Default: dark'
        }
      }
    }
  };
}

/**
 * Get a simplified tool definition with fewer options.
 * Better for agents that struggle with complex schemas.
 */
export function getSimpleToolDefinition() {
  return {
    name: 'create_map',
    description: 'Create an interactive map. Pass center [lng, lat], zoom, and layers array.',
    parameters: {
      type: 'object',
      required: ['layers'],
      properties: {
        center: {
          type: 'array',
          description: '[longitude, latitude] or omit to auto-fit'
        },
        zoom: {
          type: 'number',
          description: 'Zoom 0-22, default 10'
        },
        layers: {
          type: 'array',
          items: {
            type: 'object',
            required: ['layerType', 'data'],
            properties: {
              layerType: { enum: ['hex', 'vector'] },
              data: { description: 'Array of {h3, ...} for hex, or GeoJSON for vector' },
              style: {
                type: 'object',
                properties: {
                  fillColor: { description: '"#hex" or {type:"continuous",attr:"field",palette:"Viridis"}' }
                }
              }
            }
          }
        }
      }
    }
  };
}

/**
 * Get MCP (Model Context Protocol) tool definition.
 */
export function getMcpToolDefinition() {
  return {
    name: 'fusedmaps_create_map',
    description: 'Create an interactive geospatial map with data layers. Supports H3 hexagons, GeoJSON, and tile layers.',
    inputSchema: getToolDefinition().parameters
  };
}
