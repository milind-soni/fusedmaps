# FusedMaps

Interactive map library for Fused.io - renders H3 hexagon layers, GeoJSON vectors, MVT tiles, and raster tiles using Mapbox GL JS and Deck.gl.

## Features

- **H3 Hexagon Layers** - Static data or tile-based loading
- **Vector Layers** - GeoJSON polygons, lines, and points
- **MVT Layers** - Mapbox Vector Tiles support
- **Raster Layers** - XYZ tile support
- **Color Scales** - CartoColor palettes with continuous and categorical coloring
- **Interactive UI** - Layer panel, legend, tooltips
- **Click Highlighting** - Click to highlight features
- **Messaging** - Cross-component communication (broadcast, sync)

## Installation

### Via CDN (recommended for Fused UDFs)

```html
<link href="https://api.mapbox.com/mapbox-gl-js/v3.2.0/mapbox-gl.css" rel="stylesheet"/>
<script src="https://api.mapbox.com/mapbox-gl-js/v3.2.0/mapbox-gl.js"></script>
<script src="https://unpkg.com/h3-js@4.1.0/dist/h3-js.umd.js"></script>
<script type="module">
  import * as cartocolor from 'https://esm.sh/cartocolor@5.0.2';
  window.cartocolor = cartocolor;
</script>
<script src="https://cdn.jsdelivr.net/gh/milind-soni/fusedmaps@main/dist/fusedmaps.umd.js"></script>
```

### Via npm

```bash
npm install fusedmaps
```

## Usage

```html
<div id="map" style="width: 100%; height: 100%;"></div>

<script>
const map = FusedMaps.init({
  containerId: 'map',
  mapboxToken: 'YOUR_MAPBOX_TOKEN',
  styleUrl: 'mapbox://styles/mapbox/dark-v11',
  initialViewState: {
    longitude: -122.4,
    latitude: 37.8,
    zoom: 10
  },
  layers: [
    {
      id: 'hex-layer',
      name: 'My Hexagons',
      layerType: 'hex',
      data: [...], // Array of objects with hex field
      hexLayer: {
        filled: true,
        opacity: 0.8,
        getFillColor: {
          '@@function': 'colorContinuous',
          attr: 'value',
          domain: [0, 100],
          colors: 'Mint'
        }
      },
      tooltipColumns: ['value', 'name']
    }
  ],
  ui: {
    legend: true,
    layerPanel: true,
    tooltip: true
  },
  highlightOnClick: true
});
</script>
```

## Configuration

### FusedMapsConfig

| Property | Type | Description |
|----------|------|-------------|
| `containerId` | string | ID of the container element (default: 'map') |
| `mapboxToken` | string | Mapbox access token |
| `styleUrl` | string | Mapbox style URL |
| `initialViewState` | ViewState | Initial map position |
| `layers` | LayerConfig[] | Array of layer configurations |
| `ui` | UIConfig | UI component toggles |
| `messaging` | MessagingConfig | Cross-component messaging |
| `highlightOnClick` | boolean | Enable click-to-highlight |
| `debug` | boolean | Show debug panel |

### Layer Types

#### Hex Layer

```javascript
{
  layerType: 'hex',
  data: [{ hex: '8a283082a5fffff', value: 42 }, ...],
  hexLayer: {
    filled: true,
    stroked: true,
    extruded: false,
    opacity: 0.8,
    getFillColor: { '@@function': 'colorContinuous', attr: 'value', domain: [0, 100], colors: 'Mint' },
    getLineColor: [255, 255, 255],
    lineWidthMinPixels: 1
  }
}
```

#### Vector Layer

```javascript
{
  layerType: 'vector',
  geojson: { type: 'FeatureCollection', features: [...] },
  vectorLayer: {
    filled: true,
    stroked: true,
    getFillColor: { '@@function': 'colorCategories', attr: 'category', colors: 'Bold' },
    pointRadiusMinPixels: 6
  }
}
```

#### Raster Layer

```javascript
{
  layerType: 'raster',
  tileUrl: 'https://example.com/tiles/{z}/{x}/{y}.png',
  opacity: 0.7
}
```

### Color Functions

#### colorContinuous

```javascript
{
  '@@function': 'colorContinuous',
  attr: 'value',           // Data attribute
  domain: [0, 100],        // Min/max values
  colors: 'Mint',          // CartoColor palette name
  steps: 7,                // Number of color steps
  nullColor: [128, 128, 128, 128]
}
```

#### colorCategories

```javascript
{
  '@@function': 'colorCategories',
  attr: 'category',        // Data attribute
  colors: 'Bold',          // CartoColor palette name
  categories: ['A', 'B', 'C'], // Optional: explicit categories
  nullColor: [128, 128, 128, 128]
}
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev
```

## License

MIT

