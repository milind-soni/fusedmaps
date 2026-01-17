/**
 * JSON Schema for LayerConfig
 *
 * This schema can be used by AI frameworks to validate layer configurations.
 */

export const layerSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://fused.io/schemas/fusedmaps/layer.json",
  "title": "LayerConfig",
  "description": "Configuration for a single map layer",
  "type": "object",
  "required": ["layerType"],
  "properties": {
    "id": {
      "type": "string",
      "description": "Unique layer identifier. Auto-generated if omitted (e.g., 'layer-1', 'layer-2')."
    },
    "name": {
      "type": "string",
      "description": "Display name shown in layer panel and legend. Defaults to id if omitted."
    },
    "layerType": {
      "type": "string",
      "enum": ["hex", "vector", "mvt", "raster", "pmtiles"],
      "description": "Type of layer: 'hex' for H3 hexagons, 'vector' for GeoJSON, 'mvt' for Mapbox Vector Tiles, 'raster' for tile/image overlays, 'pmtiles' for PMTiles format."
    },
    "visible": {
      "type": "boolean",
      "default": true,
      "description": "Whether the layer is visible on the map."
    },
    "data": {
      "description": "Inline data for hex or vector layers. For hex: array of objects with 'h3' field. For vector: GeoJSON FeatureCollection."
    },
    "dataUrl": {
      "type": "string",
      "format": "uri",
      "description": "URL to external data file (GeoJSON, CSV, or Parquet). Alternative to inline 'data'."
    },
    "tileUrl": {
      "type": "string",
      "description": "URL template for tile layers (MVT or raster). Use {z}/{x}/{y} placeholders."
    },
    "style": {
      "type": "object",
      "description": "Visual styling options",
      "properties": {
        "fillColor": {
          "description": "Fill color for polygons/hexagons. Can be a static color or data-driven color scale."
        },
        "lineColor": {
          "description": "Stroke/outline color."
        },
        "opacity": {
          "type": "number",
          "minimum": 0,
          "maximum": 1,
          "default": 0.8,
          "description": "Layer opacity (0 = transparent, 1 = opaque)."
        },
        "filled": {
          "type": "boolean",
          "default": true,
          "description": "Whether to fill polygons."
        },
        "stroked": {
          "type": "boolean",
          "default": true,
          "description": "Whether to draw outlines."
        },
        "extruded": {
          "type": "boolean",
          "default": false,
          "description": "Whether to extrude polygons in 3D."
        },
        "elevationAttr": {
          "type": "string",
          "description": "Data attribute to use for 3D extrusion height."
        },
        "elevationScale": {
          "type": "number",
          "default": 1,
          "description": "Multiplier for extrusion height."
        },
        "lineWidth": {
          "type": "number",
          "default": 1,
          "description": "Width of lines/strokes in pixels."
        },
        "pointRadius": {
          "type": "number",
          "default": 5,
          "description": "Radius of point markers in pixels."
        }
      }
    },
    "tooltip": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Property names to show in tooltip on hover."
    }
  }
} as const;

/**
 * Color scale schemas
 */
export const colorScaleSchema = {
  continuous: {
    "type": "object",
    "required": ["type", "attr"],
    "properties": {
      "type": {
        "const": "continuous",
        "description": "Use continuous color scale for numeric data."
      },
      "attr": {
        "type": "string",
        "description": "Data attribute (property name) to map to color."
      },
      "palette": {
        "type": "string",
        "enum": [
          "Viridis", "Mint", "BluGrn", "Sunset", "Magenta", "SunsetDark",
          "Teal", "TealGrn", "Purp", "PurpOr", "Emrld", "OrYel",
          "Peach", "Burg", "RedOr", "BurgYl", "BluYl", "PinkYl",
          "DarkMint", "TealRose", "Temps", "Tropic", "Earth", "Fall", "Geyser"
        ],
        "default": "Viridis",
        "description": "Color palette name from CartoColor."
      },
      "domain": {
        "type": "array",
        "items": { "type": "number" },
        "minItems": 2,
        "maxItems": 2,
        "description": "Value range [min, max] for the color scale. Auto-detected from data if omitted."
      },
      "steps": {
        "type": "integer",
        "minimum": 2,
        "maximum": 12,
        "default": 7,
        "description": "Number of color steps in the scale."
      },
      "reverse": {
        "type": "boolean",
        "default": false,
        "description": "Reverse the color palette direction."
      }
    }
  },
  categorical: {
    "type": "object",
    "required": ["type", "attr"],
    "properties": {
      "type": {
        "const": "categorical",
        "description": "Use categorical colors for discrete categories."
      },
      "attr": {
        "type": "string",
        "description": "Data attribute (property name) containing category values."
      },
      "palette": {
        "type": "string",
        "enum": ["Bold", "Prism", "Safe", "Vivid", "Pastel", "Antique"],
        "default": "Bold",
        "description": "Color palette name for categorical data."
      },
      "categories": {
        "type": "array",
        "description": "Explicit list of category values. Auto-detected from data if omitted."
      }
    }
  }
} as const;
