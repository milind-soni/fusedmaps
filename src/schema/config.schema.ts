/**
 * JSON Schema for FusedMapsConfig
 *
 * This schema can be used by AI frameworks to validate map configurations.
 */

export const configSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://fused.io/schemas/fusedmaps/config.json",
  "title": "FusedMapsConfig",
  "description": "Configuration for creating an interactive map with FusedMaps. Pass this to FusedMaps.createMap() to render a map.",
  "type": "object",
  "required": ["layers"],
  "properties": {
    "center": {
      "type": "array",
      "items": { "type": "number" },
      "minItems": 2,
      "maxItems": 2,
      "description": "Map center as [longitude, latitude]. If omitted, map will auto-fit to layer data bounds.",
      "examples": [[-122.4194, 37.7749], [0, 0]]
    },
    "zoom": {
      "type": "number",
      "minimum": 0,
      "maximum": 22,
      "default": 10,
      "description": "Initial zoom level (0 = world view, 22 = building level). Ignored if center is omitted (auto-fit mode)."
    },
    "pitch": {
      "type": "number",
      "minimum": 0,
      "maximum": 85,
      "default": 0,
      "description": "Map tilt angle in degrees (0 = top-down, 60 = oblique view)."
    },
    "bearing": {
      "type": "number",
      "minimum": -180,
      "maximum": 180,
      "default": 0,
      "description": "Map rotation in degrees (0 = north up)."
    },
    "layers": {
      "type": "array",
      "minItems": 0,
      "description": "Array of data layers to display on the map. Layers are rendered in order (first = bottom)."
    },
    "basemap": {
      "type": "string",
      "enum": ["dark", "light", "streets", "satellite", "none"],
      "default": "dark",
      "description": "Base map style. Use 'none' for transparent background."
    },
    "title": {
      "type": "string",
      "description": "Optional title displayed on the map."
    },
    "ui": {
      "type": "object",
      "description": "UI component visibility settings.",
      "properties": {
        "legend": {
          "type": "boolean",
          "default": true,
          "description": "Show color legend for data-driven layers."
        },
        "layerPanel": {
          "type": "boolean",
          "default": true,
          "description": "Show layer visibility toggle panel."
        },
        "tooltip": {
          "type": "boolean",
          "default": true,
          "description": "Show tooltips on feature hover."
        },
        "controls": {
          "type": "boolean",
          "default": true,
          "description": "Show zoom and navigation controls."
        },
        "scale": {
          "type": "boolean",
          "default": true,
          "description": "Show scale bar."
        }
      }
    }
  }
} as const;

/**
 * Example configurations for documentation
 */
export const configExamples = [
  {
    description: "Simple hex layer with continuous color",
    value: {
      center: [-122.4, 37.8],
      zoom: 10,
      layers: [{
        layerType: "hex",
        data: [
          { h3: "8928308280fffff", value: 100 },
          { h3: "8928308281fffff", value: 200 }
        ],
        style: {
          fillColor: { type: "continuous", attr: "value", palette: "Viridis" }
        }
      }]
    }
  },
  {
    description: "GeoJSON points with categorical colors",
    value: {
      layers: [{
        layerType: "vector",
        data: {
          type: "FeatureCollection",
          features: [
            { type: "Feature", geometry: { type: "Point", coordinates: [-122.4, 37.8] }, properties: { type: "restaurant" } }
          ]
        },
        style: {
          fillColor: { type: "categorical", attr: "type", palette: "Bold" }
        }
      }]
    }
  }
];
