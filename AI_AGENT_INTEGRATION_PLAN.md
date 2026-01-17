# FusedMaps AI Agent Integration Plan

> Making FusedMaps the easiest way for AI agents to create interactive maps

---

## Executive Summary

Transform FusedMaps into an AI-agent-friendly mapping API by:
1. Adding JSON Schema for tool definitions
2. Simplifying the config with smart defaults
3. Building an MCP (Model Context Protocol) server
4. Providing better validation with actionable errors
5. Creating a URL-based render API

---

## Part 1: JSON Schema Export

### Why It's Critical
Every AI framework (OpenAI functions, Claude tools, LangChain, CrewAI, etc.) uses JSON Schema to define tool parameters. Without this, agents can't use FusedMaps.

### Files to Create

```
src/schema/
├── index.ts                 # Main exports
├── config.schema.json       # Full FusedMapsConfig schema
├── layer.schema.json        # LayerConfig schema
├── examples.ts              # Canonical examples for AI training
└── palettes.ts              # Available palette names + colors
```

### Schema Structure

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FusedMapsConfig",
  "description": "Configuration for creating an interactive map with FusedMaps",
  "type": "object",
  "required": ["layers"],
  "properties": {
    "center": {
      "description": "Map center as [longitude, latitude]",
      "type": "array",
      "items": { "type": "number" },
      "minItems": 2,
      "maxItems": 2,
      "default": [0, 0]
    },
    "zoom": {
      "description": "Initial zoom level (0-22)",
      "type": "number",
      "minimum": 0,
      "maximum": 22,
      "default": 10
    },
    "layers": {
      "description": "Array of map layers to render",
      "type": "array",
      "items": { "$ref": "#/$defs/LayerConfig" }
    }
  }
}
```

### Layer Schema (Simplified)

```json
{
  "$defs": {
    "LayerConfig": {
      "type": "object",
      "required": ["layerType"],
      "properties": {
        "id": {
          "description": "Unique layer identifier. Auto-generated if omitted.",
          "type": "string"
        },
        "name": {
          "description": "Display name for layer panel. Defaults to id.",
          "type": "string"
        },
        "layerType": {
          "description": "Type of layer to render",
          "enum": ["hex", "vector", "mvt", "raster", "pmtiles"]
        },
        "data": {
          "description": "Inline GeoJSON or H3 data array",
          "oneOf": [
            { "$ref": "#/$defs/GeoJSON" },
            { "type": "array", "items": { "$ref": "#/$defs/H3DataPoint" } }
          ]
        },
        "dataUrl": {
          "description": "URL to GeoJSON, CSV, or Parquet file",
          "type": "string",
          "format": "uri"
        },
        "style": {
          "$ref": "#/$defs/LayerStyle"
        }
      }
    },
    "LayerStyle": {
      "type": "object",
      "properties": {
        "fillColor": {
          "description": "Fill color - can be static or data-driven",
          "oneOf": [
            { "type": "string", "description": "CSS color string" },
            { "type": "array", "items": { "type": "number" }, "description": "RGB(A) array" },
            { "$ref": "#/$defs/ColorScale" }
          ]
        },
        "fillOpacity": {
          "type": "number",
          "minimum": 0,
          "maximum": 1,
          "default": 0.8
        },
        "strokeColor": {
          "description": "Outline color",
          "type": "string"
        },
        "strokeWidth": {
          "type": "number",
          "default": 1
        }
      }
    },
    "ColorScale": {
      "type": "object",
      "required": ["type", "attr"],
      "properties": {
        "type": {
          "enum": ["continuous", "categorical"]
        },
        "attr": {
          "description": "Data attribute to map to color",
          "type": "string"
        },
        "palette": {
          "description": "Color palette name",
          "enum": ["Viridis", "Mint", "BluGrn", "Sunset", "Magenta", "SunsetDark", "Teal", "TealGrn", "Purp", "PurpOr", "Emrld", "OrYel", "Peach", "Burg", "RedOr", "Bold", "Prism", "Safe", "Vivid", "Pastel"],
          "default": "Viridis"
        },
        "domain": {
          "description": "Value range [min, max] for continuous scales",
          "type": "array",
          "items": { "type": "number" },
          "minItems": 2,
          "maxItems": 2
        }
      }
    },
    "H3DataPoint": {
      "type": "object",
      "required": ["h3"],
      "properties": {
        "h3": {
          "description": "H3 hexagon index",
          "type": "string"
        }
      },
      "additionalProperties": true
    }
  }
}
```

### Exports

```typescript
// src/schema/index.ts
import configSchema from './config.schema.json';
import layerSchema from './layer.schema.json';
import { examples } from './examples';
import { palettes, getPaletteColors } from './palettes';

export {
  configSchema,
  layerSchema,
  examples,
  palettes,
  getPaletteColors
};

// For OpenAI/Claude tool definitions
export function getToolDefinition() {
  return {
    name: "create_map",
    description: "Create an interactive map with data layers",
    parameters: configSchema
  };
}
```

---

## Part 2: Simplified Config with Smart Defaults

### Current vs New Required Fields

| Field | Current | New |
|-------|---------|-----|
| `mapboxToken` | Required | Use env default or passed token |
| `containerId` | Required | Default: `"map"` |
| `styleUrl` | Required | Default: dark basemap |
| `initialViewState` | Required (nested) | Flatten to `center`/`zoom`, auto-fit if omitted |
| `layers[].id` | Required | Auto-generate: `"layer-{index}"` |
| `layers[].name` | Required | Default to `id` |

### Implementation

```typescript
// src/config/defaults.ts

let layerCounter = 0;

export function applyDefaults(config: Partial<FusedMapsConfig>): FusedMapsConfig {
  const layers = (config.layers || []).map((layer, index) => ({
    id: layer.id || `layer-${++layerCounter}`,
    name: layer.name || layer.id || `Layer ${index + 1}`,
    ...layer
  }));

  return {
    containerId: config.containerId || 'map',
    mapboxToken: config.mapboxToken || getDefaultToken(),
    styleUrl: config.styleUrl || 'mapbox://styles/mapbox/dark-v11',
    initialViewState: config.initialViewState || inferViewState(config, layers),
    layers,
    ...config
  };
}

function inferViewState(config: any, layers: LayerConfig[]) {
  // If center/zoom provided at top level, use them
  if (config.center && config.zoom) {
    return {
      longitude: config.center[0],
      latitude: config.center[1],
      zoom: config.zoom
    };
  }
  // Otherwise return undefined - will auto-fit to data
  return undefined;
}

function getDefaultToken(): string {
  // Check common locations for token
  if (typeof window !== 'undefined') {
    return (window as any).MAPBOX_TOKEN
      || (window as any).mapboxToken
      || '';
  }
  return '';
}
```

### Simplified Top-Level API

```typescript
// New simplified entry point
export function createMap(config: SimpleMapConfig): FusedMapsResult {
  const fullConfig = applyDefaults(config);
  const validation = validate(fullConfig);

  if (!validation.valid) {
    return {
      success: false,
      errors: validation.errors,
      state: null,
      instance: null
    };
  }

  const instance = init(fullConfig);

  return {
    success: true,
    instance,
    state: instance.getState(),
    errors: [],
    warnings: validation.warnings || []
  };
}
```

---

## Part 3: Deep Validation with Actionable Errors

### Why It Matters
AI agents make mistakes. Good error messages let them self-correct.

### Validation Rules

```typescript
// src/config/validate.ts

interface ValidationError {
  path: string;           // e.g., "layers[0].style.fillColor.palette"
  message: string;        // Human-readable error
  suggestion?: string;    // How to fix it
  received?: any;         // What was provided
  expected?: string;      // What was expected
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

export function validate(config: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // Check layers array
  if (!config.layers || !Array.isArray(config.layers)) {
    errors.push({
      path: 'layers',
      message: 'layers must be an array',
      received: typeof config.layers,
      expected: 'array'
    });
    return { valid: false, errors, warnings };
  }

  if (config.layers.length === 0) {
    warnings.push('No layers provided - map will be empty');
  }

  // Validate each layer
  config.layers.forEach((layer: any, index: number) => {
    const prefix = `layers[${index}]`;

    // Layer type
    const validTypes = ['hex', 'vector', 'mvt', 'raster', 'pmtiles'];
    if (!layer.layerType) {
      errors.push({
        path: `${prefix}.layerType`,
        message: 'layerType is required',
        expected: validTypes.join(' | ')
      });
    } else if (!validTypes.includes(layer.layerType)) {
      const suggestion = findClosestMatch(layer.layerType, validTypes);
      errors.push({
        path: `${prefix}.layerType`,
        message: `Invalid layerType: "${layer.layerType}"`,
        received: layer.layerType,
        expected: validTypes.join(' | '),
        suggestion: suggestion ? `Did you mean "${suggestion}"?` : undefined
      });
    }

    // Data validation
    if (layer.layerType === 'hex' || layer.layerType === 'vector') {
      if (!layer.data && !layer.dataUrl) {
        errors.push({
          path: `${prefix}`,
          message: 'Layer requires either "data" or "dataUrl"',
          suggestion: 'Provide inline data array or a URL to GeoJSON/CSV/Parquet'
        });
      }
    }

    // Style validation
    if (layer.style?.fillColor) {
      validateColorConfig(layer.style.fillColor, `${prefix}.style.fillColor`, errors);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

function validateColorConfig(color: any, path: string, errors: ValidationError[]) {
  if (typeof color === 'object' && color.type) {
    // Color scale
    const validPalettes = ['Viridis', 'Mint', 'BluGrn', /* ... */];

    if (color.palette && !validPalettes.includes(color.palette)) {
      const suggestion = findClosestMatch(color.palette, validPalettes);
      errors.push({
        path: `${path}.palette`,
        message: `Unknown palette: "${color.palette}"`,
        received: color.palette,
        expected: validPalettes.slice(0, 5).join(', ') + '...',
        suggestion: suggestion ? `Did you mean "${suggestion}"?` : undefined
      });
    }

    if (color.type === 'continuous' && !color.attr) {
      errors.push({
        path: `${path}.attr`,
        message: 'Continuous color scale requires "attr" (data attribute to map)',
        suggestion: 'Add attr: "your_numeric_field"'
      });
    }
  }
}

function findClosestMatch(input: string, options: string[]): string | null {
  // Levenshtein distance or simple case-insensitive match
  const lower = input.toLowerCase();
  const match = options.find(o => o.toLowerCase() === lower);
  if (match) return match;

  // Could add fuzzy matching here
  return null;
}
```

---

## Part 4: Forgiving Input Normalization

### Common AI Mistakes to Handle

```typescript
// src/config/normalize-inputs.ts

export function normalizeInputs(config: any): any {
  return {
    ...config,
    layers: config.layers?.map(normalizeLayer)
  };
}

function normalizeLayer(layer: any): any {
  return {
    ...layer,
    // Normalize layerType variations
    layerType: normalizeLayerType(layer.layerType),
    style: layer.style ? normalizeStyle(layer.style) : undefined
  };
}

function normalizeLayerType(type: string): string {
  const mapping: Record<string, string> = {
    'hexagon': 'hex',
    'hexagons': 'hex',
    'h3': 'hex',
    'geojson': 'vector',
    'json': 'vector',
    'tiles': 'mvt',
    'vectortiles': 'mvt',
    'image': 'raster',
    'xyz': 'raster',
    'pmtile': 'pmtiles'
  };
  return mapping[type?.toLowerCase()] || type;
}

function normalizeStyle(style: any): any {
  return {
    ...style,
    fillColor: style.fillColor ? normalizeColor(style.fillColor) : undefined,
    strokeColor: style.strokeColor ? normalizeColor(style.strokeColor) : undefined
  };
}

function normalizeColor(color: any): any {
  // String color name → keep as is (CSS handles it)
  if (typeof color === 'string') {
    return color;
  }

  // RGB array with 0-1 values → scale to 0-255
  if (Array.isArray(color)) {
    const isNormalized = color.every((v: number) => v >= 0 && v <= 1);
    if (isNormalized && color.some((v: number) => v !== 0 && v !== 1)) {
      return color.map((v: number) => Math.round(v * 255));
    }
    return color;
  }

  // Color scale object
  if (typeof color === 'object' && color.type) {
    return {
      ...color,
      // Normalize palette name case
      palette: normalizePaletteName(color.palette),
      // Normalize type variations
      type: color.type === 'linear' ? 'continuous' : color.type
    };
  }

  return color;
}

function normalizePaletteName(name: string): string {
  if (!name) return 'Viridis';

  const palettes: Record<string, string> = {
    'viridis': 'Viridis',
    'mint': 'Mint',
    'blugrn': 'BluGrn',
    'blue-green': 'BluGrn',
    'sunset': 'Sunset',
    'magenta': 'Magenta',
    'teal': 'Teal',
    'purple': 'Purp',
    'purp': 'Purp',
    'bold': 'Bold',
    'prism': 'Prism'
    // ... etc
  };

  return palettes[name.toLowerCase()] || name;
}
```

---

## Part 5: MCP Server

### What is MCP?
Model Context Protocol - the standard way for AI agents (Claude, etc.) to call external tools.

### File Structure

```
mcp-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # MCP server entry
│   ├── tools/
│   │   ├── create-map.ts  # create_map tool
│   │   ├── update-map.ts  # update_map tool
│   │   └── get-palettes.ts
│   └── render/
│       └── html.ts        # Generate standalone HTML
└── README.md
```

### MCP Server Implementation

```typescript
// mcp-server/src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { configSchema } from 'fusedmaps/schema';

const server = new Server({
  name: 'fusedmaps',
  version: '1.0.0'
}, {
  capabilities: {
    tools: {}
  }
});

// Register tools
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'create_map',
      description: 'Create an interactive map with data visualization layers. Supports H3 hexagons, GeoJSON vectors, and raster tiles.',
      inputSchema: configSchema
    },
    {
      name: 'get_palettes',
      description: 'Get list of available color palettes',
      inputSchema: { type: 'object', properties: {} }
    }
  ]
}));

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'create_map':
      return await handleCreateMap(args);
    case 'get_palettes':
      return await handleGetPalettes();
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function handleCreateMap(config: any) {
  // Validate
  const validation = validate(config);
  if (!validation.valid) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: false,
          errors: validation.errors
        }, null, 2)
      }]
    };
  }

  // Generate HTML
  const html = generateMapHtml(config);
  const url = await uploadToHosting(html); // Your hosting solution

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success: true,
        url,
        embedCode: `<iframe src="${url}" width="100%" height="500"></iframe>`
      }, null, 2)
    }]
  };
}

// Start server
const transport = new StdioServerTransport();
server.connect(transport);
```

### Tool Definition for AI Agents

```typescript
// What AI agents see
{
  "name": "create_map",
  "description": "Create an interactive map. Returns an embeddable URL.",
  "parameters": {
    "type": "object",
    "required": ["layers"],
    "properties": {
      "center": {
        "type": "array",
        "description": "Map center [longitude, latitude]. Auto-fits to data if omitted."
      },
      "zoom": {
        "type": "number",
        "description": "Zoom level 0-22. Default: 10"
      },
      "layers": {
        "type": "array",
        "description": "Data layers to display",
        "items": {
          "type": "object",
          "required": ["layerType"],
          "properties": {
            "layerType": {
              "enum": ["hex", "vector", "raster"],
              "description": "hex=H3 hexagons, vector=GeoJSON, raster=tile images"
            },
            "data": {
              "description": "Inline data array"
            },
            "dataUrl": {
              "type": "string",
              "description": "URL to data file (GeoJSON, CSV, Parquet)"
            },
            "style": {
              "type": "object",
              "properties": {
                "fillColor": {
                  "description": "Color or color scale",
                  "oneOf": [
                    { "type": "string" },
                    {
                      "type": "object",
                      "properties": {
                        "type": { "enum": ["continuous", "categorical"] },
                        "attr": { "type": "string" },
                        "palette": { "enum": ["Viridis", "Mint", "Sunset", "Bold"] }
                      }
                    }
                  ]
                }
              }
            }
          }
        }
      }
    }
  }
}
```

---

## Part 6: URL-Based Render API

### Endpoint Design

```
GET /api/render?config={...}
POST /api/render
  Body: { config: {...} }

Response:
{
  "success": true,
  "id": "map_abc123",
  "url": "https://maps.fused.io/m/abc123",
  "embedUrl": "https://maps.fused.io/embed/abc123",
  "embedHtml": "<iframe src=\"...\" width=\"100%\" height=\"500\"></iframe>",
  "expiresAt": "2025-01-24T00:00:00Z"
}
```

### Static HTML Generation

```typescript
// src/render/html.ts

export function generateMapHtml(config: FusedMapsConfig): string {
  const safeConfig = JSON.stringify(config);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>FusedMap</title>
  <script src="https://api.mapbox.com/mapbox-gl-js/v3.2.0/mapbox-gl.js"></script>
  <link href="https://api.mapbox.com/mapbox-gl-js/v3.2.0/mapbox-gl.css" rel="stylesheet">
  <script src="https://unpkg.com/h3-js@4"></script>
  <script src="https://unpkg.com/deck.gl@9/dist.min.js"></script>
  <script src="https://cdn.jsdelivr.net/gh/fused-io/fusedmaps@latest/dist/fusedmaps.umd.js"></script>
  <style>
    body { margin: 0; padding: 0; }
    #map { position: absolute; top: 0; bottom: 0; width: 100%; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const config = ${safeConfig};
    FusedMaps.createMap(config);
  </script>
</body>
</html>`;
}
```

---

## Part 7: Palette Discovery API

### Implementation

```typescript
// src/schema/palettes.ts

export const PALETTES = {
  // Sequential (good for continuous data)
  sequential: ['Viridis', 'Mint', 'BluGrn', 'Sunset', 'Magenta', 'SunsetDark',
               'Teal', 'TealGrn', 'Purp', 'PurpOr', 'Emrld', 'OrYel',
               'Peach', 'Burg', 'RedOr'],

  // Qualitative (good for categorical data)
  qualitative: ['Bold', 'Prism', 'Safe', 'Vivid', 'Pastel'],

  // All palettes
  all: [] as string[] // populated below
};

PALETTES.all = [...PALETTES.sequential, ...PALETTES.qualitative];

export function getPalettes(): typeof PALETTES {
  return PALETTES;
}

export function getPaletteColors(name: string, steps: number = 7): string[] {
  // Implementation using cartocolor
  const cartocolor = (window as any).cartocolor || {};
  const palette = cartocolor[name];
  if (!palette) return [];
  return palette[steps] || palette[Object.keys(palette).pop()!];
}

export function suggestPalette(dataType: 'continuous' | 'categorical'): string {
  return dataType === 'continuous' ? 'Viridis' : 'Bold';
}
```

### Public API

```typescript
// Added to FusedMaps namespace
FusedMaps.getPalettes()           // → { sequential: [...], qualitative: [...], all: [...] }
FusedMaps.getPaletteColors('Viridis')  // → ['#440154', '#482878', ...]
FusedMaps.suggestPalette('continuous') // → 'Viridis'
```

---

## Part 8: Examples for AI Training

### Canonical Examples

```typescript
// src/schema/examples.ts

export const examples = {
  // Minimal hex layer
  simpleHex: {
    layers: [{
      layerType: 'hex',
      data: [
        { h3: '8928308280fffff', value: 100 },
        { h3: '8928308281fffff', value: 200 }
      ],
      style: {
        fillColor: { type: 'continuous', attr: 'value', palette: 'Viridis' }
      }
    }]
  },

  // GeoJSON points with categories
  categoricalPoints: {
    center: [-122.4, 37.8],
    zoom: 12,
    layers: [{
      layerType: 'vector',
      data: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'Point', coordinates: [-122.4, 37.8] }, properties: { category: 'A' } },
          { type: 'Feature', geometry: { type: 'Point', coordinates: [-122.5, 37.7] }, properties: { category: 'B' } }
        ]
      },
      style: {
        fillColor: { type: 'categorical', attr: 'category', palette: 'Bold' }
      }
    }]
  },

  // Data from URL
  urlData: {
    layers: [{
      layerType: 'vector',
      dataUrl: 'https://example.com/data.geojson',
      style: {
        fillColor: '#3388ff',
        fillOpacity: 0.6
      }
    }]
  },

  // Multiple layers
  multiLayer: {
    center: [-122.4, 37.8],
    zoom: 10,
    layers: [
      {
        id: 'base-layer',
        layerType: 'vector',
        dataUrl: 'https://example.com/counties.geojson',
        style: { fillColor: '#cccccc', fillOpacity: 0.3 }
      },
      {
        id: 'data-layer',
        layerType: 'hex',
        data: [{ h3: '8928308280fffff', population: 50000 }],
        style: {
          fillColor: { type: 'continuous', attr: 'population', palette: 'Sunset' }
        }
      }
    ]
  }
};
```

---

## Implementation File Structure

```
fusedmaps/
├── src/
│   ├── index.ts                    # MODIFY: Add createMap(), validate(), getPalettes()
│   ├── types.ts                    # MODIFY: Add ValidationResult, SimpleMapConfig
│   │
│   ├── config/
│   │   ├── normalize.ts            # EXISTING: Minor updates
│   │   ├── defaults.ts             # NEW: Smart defaults, auto-id
│   │   ├── validate.ts             # NEW: Deep validation with paths
│   │   └── normalize-inputs.ts     # NEW: Forgiving input handling
│   │
│   ├── schema/
│   │   ├── index.ts                # NEW: Schema exports
│   │   ├── config.schema.json      # NEW: JSON Schema
│   │   ├── layer.schema.json       # NEW: JSON Schema
│   │   ├── examples.ts             # NEW: Canonical examples
│   │   └── palettes.ts             # NEW: Palette discovery
│   │
│   ├── render/
│   │   └── html.ts                 # NEW: Standalone HTML generation
│   │
│   └── ... (existing modules unchanged)
│
├── mcp-server/                     # NEW: Separate package
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts
│   │   └── tools/
│   │       ├── create-map.ts
│   │       └── get-palettes.ts
│   └── README.md
│
├── package.json                    # MODIFY: Add schema export
├── rollup.config.js                # MODIFY: Include schema in bundle
└── AI_AGENT_INTEGRATION_PLAN.md    # This file
```

---

## Implementation Priority

| Phase | Items | Effort | Impact |
|-------|-------|--------|--------|
| **Phase 1** | JSON Schema + validate() + examples | 2-3 days | Unlocks all AI frameworks |
| **Phase 2** | Smart defaults + forgiving normalization | 1-2 days | Reduces AI errors 80% |
| **Phase 3** | createMap() simplified API | 1 day | Better DX |
| **Phase 4** | MCP Server | 2-3 days | Native Claude/AI integration |
| **Phase 5** | URL render API | Depends on hosting | Full product |

---

## Success Metrics

1. **AI agents can generate valid configs 90%+ of the time** (measure with test suite)
2. **Validation errors lead to successful retry** (error messages are actionable)
3. **Time from config to rendered map < 2 seconds**
4. **MCP server works with Claude, GPT, and LangChain**

---

## Next Steps

1. Review and approve this plan
2. Start with Phase 1: JSON Schema + validation
3. Test with Claude/GPT to measure config generation accuracy
4. Iterate on schema based on AI failure modes
