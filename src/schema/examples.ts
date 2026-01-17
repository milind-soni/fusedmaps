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
  opacity?: number; // For raster layers
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
export const minimalExamples: Record<string, MapExample> = {
  hexLayer: {
    name: 'Simple Hex Layer',
    description: 'H3 hexagons with continuous color scale',
    config: {
      layers: [{
        layerType: 'hex',
        data: [
          { h3: '8928308280fffff', value: 100 },
          { h3: '8928308281fffff', value: 200 },
          { h3: '8928308283fffff', value: 150 }
        ],
        style: {
          fillColor: { type: 'continuous', attr: 'value', palette: 'Viridis' }
        }
      }]
    }
  },

  vectorPoints: {
    name: 'GeoJSON Points',
    description: 'Point markers from GeoJSON with categorical colors',
    config: {
      center: [-122.4, 37.8],
      zoom: 12,
      layers: [{
        layerType: 'vector',
        data: {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', geometry: { type: 'Point', coordinates: [-122.41, 37.78] }, properties: { name: 'Location A', category: 'retail' } },
            { type: 'Feature', geometry: { type: 'Point', coordinates: [-122.42, 37.79] }, properties: { name: 'Location B', category: 'office' } },
            { type: 'Feature', geometry: { type: 'Point', coordinates: [-122.40, 37.77] }, properties: { name: 'Location C', category: 'retail' } }
          ]
        },
        style: {
          fillColor: { type: 'categorical', attr: 'category', palette: 'Bold' },
          pointRadius: 8
        }
      }]
    }
  },

  vectorPolygons: {
    name: 'GeoJSON Polygons',
    description: 'Polygon regions with continuous color scale',
    config: {
      layers: [{
        layerType: 'vector',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [[[-122.5, 37.7], [-122.5, 37.8], [-122.4, 37.8], [-122.4, 37.7], [-122.5, 37.7]]]
              },
              properties: { name: 'Region A', population: 50000 }
            }
          ]
        },
        style: {
          fillColor: { type: 'continuous', attr: 'population', palette: 'Sunset' },
          opacity: 0.7
        }
      }]
    }
  },

  staticColor: {
    name: 'Static Color Layer',
    description: 'Layer with a single static color (no data mapping)',
    config: {
      center: [-122.4, 37.8],
      zoom: 10,
      layers: [{
        layerType: 'vector',
        data: {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', geometry: { type: 'Point', coordinates: [-122.4, 37.8] }, properties: { name: 'My Point' } }
          ]
        },
        style: {
          fillColor: '#3388ff',
          opacity: 0.8,
          pointRadius: 10
        }
      }]
    }
  }
};

/**
 * Advanced examples - more complex configurations
 */
export const advancedExamples: Record<string, MapExample> = {
  multiLayer: {
    name: 'Multiple Layers',
    description: 'Map with multiple overlapping layers',
    config: {
      center: [-122.4, 37.8],
      zoom: 10,
      layers: [
        {
          id: 'background',
          name: 'Background Region',
          layerType: 'vector',
          data: {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [[[-122.6, 37.6], [-122.6, 38.0], [-122.2, 38.0], [-122.2, 37.6], [-122.6, 37.6]]]
              },
              properties: {}
            }]
          },
          style: {
            fillColor: '#cccccc',
            opacity: 0.3
          }
        },
        {
          id: 'data-layer',
          name: 'Data Points',
          layerType: 'hex',
          data: [
            { h3: '8928308280fffff', metric: 100 },
            { h3: '8928308281fffff', metric: 250 }
          ],
          style: {
            fillColor: { type: 'continuous', attr: 'metric', palette: 'Magenta' }
          }
        }
      ]
    }
  },

  extruded3D: {
    name: '3D Extruded Hexagons',
    description: 'Hexagons with height based on data values',
    config: {
      center: [-122.4, 37.8],
      zoom: 11,
      layers: [{
        layerType: 'hex',
        data: [
          { h3: '8a28308280fffff', value: 100, height: 500 },
          { h3: '8a28308281fffff', value: 200, height: 1000 },
          { h3: '8a28308283fffff', value: 150, height: 750 }
        ],
        style: {
          fillColor: { type: 'continuous', attr: 'value', palette: 'Sunset' },
          extruded: true,
          elevationAttr: 'height',
          elevationScale: 1
        }
      }]
    }
  },

  dataFromUrl: {
    name: 'Data from URL',
    description: 'Load GeoJSON from external URL',
    config: {
      layers: [{
        layerType: 'vector',
        dataUrl: 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson',
        style: {
          fillColor: '#3388ff',
          opacity: 0.5,
          stroked: true,
          lineColor: '#ffffff',
          lineWidth: 1
        }
      }]
    }
  },

  rasterTiles: {
    name: 'Raster Tile Layer',
    description: 'XYZ raster tile overlay',
    config: {
      center: [0, 20],
      zoom: 2,
      layers: [{
        layerType: 'raster',
        tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        opacity: 0.7
      }]
    }
  },

  withTooltip: {
    name: 'Layer with Tooltip',
    description: 'Configure which properties show in hover tooltip',
    config: {
      center: [-122.4, 37.8],
      zoom: 12,
      layers: [{
        layerType: 'vector',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [-122.4, 37.8] },
              properties: { name: 'Store #1', revenue: 125000, employees: 12, category: 'retail' }
            }
          ]
        },
        tooltip: ['name', 'revenue', 'category'],
        style: {
          fillColor: { type: 'categorical', attr: 'category', palette: 'Bold' },
          pointRadius: 10
        }
      }]
    }
  }
};

/**
 * All examples combined
 */
export const examples = {
  ...minimalExamples,
  ...advancedExamples
};

/**
 * Get example by name
 */
export function getExample(name: string): MapExample | undefined {
  return examples[name];
}

/**
 * List all available example names
 */
export function listExamples(): string[] {
  return Object.keys(examples);
}

/**
 * Get examples filtered by layer type
 */
export function getExamplesByLayerType(layerType: string): MapExample[] {
  return Object.values(examples).filter(ex =>
    ex.config.layers.some(l => l.layerType === layerType)
  );
}
