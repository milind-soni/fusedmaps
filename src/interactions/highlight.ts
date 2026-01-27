/**
 * Click-to-highlight interaction
 */

import type { LayerConfig, HexLayerConfig } from '../types';
import { toH3 } from '../layers/hex';
import { getQueryableLayerIds } from '../utils';

const HIGHLIGHT_FILL = 'rgba(255,255,0,0.3)';
const HIGHLIGHT_LINE = 'rgba(255,255,0,1)';
const HIGHLIGHT_LINE_WIDTH = 3;

// Default ID fields for feature matching - expanded to include common geo fields
const DEFAULT_ID_FIELDS = [
  // Common generic ID fields
  'id', 'ID', 'Id', 'fid', 'FID', 'OBJECTID', 'objectid',
  // Name fields
  'name', 'Name', 'NAME', 'Field Name', 'field_name',
  // Geographic ID fields
  'GEOID', 'geoid', 'GeoID', 'geo_id',
  'FIPS', 'fips', 'STATEFP', 'COUNTYFP',
  // Tile/feature IDs
  'tile_id', 'tileId', 'feature_id', 'featureId', 'index',
  // H3 hex fields
  'hex', 'h3', 'h3_index', 'cell_id', 'h3_cell'
];

let highlightLayerAdded = false;
let selectedFeature: any = null;
let currentMap: mapboxgl.Map | null = null;
let currentLayers: LayerConfig[] = [];
let configuredIdFields: string[] = DEFAULT_ID_FIELDS;

// Store original GeoJSON data for each vector layer to get full (non-clipped) geometries
const originalGeoJSONStore: Map<string, GeoJSON.FeatureCollection> = new Map();

export interface HighlightConfig {
  idFields?: string[];  // Custom ID fields for feature matching
}

/**
 * Register original GeoJSON data for a layer (called from vector.ts)
 * This allows highlight to use full geometries instead of tile-clipped fragments
 */
export function registerOriginalGeoJSON(layerId: string, geojson: GeoJSON.FeatureCollection): void {
  originalGeoJSONStore.set(layerId, geojson);
}

/**
 * Find a feature in the original GeoJSON by matching properties
 */
function findOriginalFeature(layerId: string, props: Record<string, any>): GeoJSON.Feature | null {
  const geojson = originalGeoJSONStore.get(layerId);
  if (!geojson?.features) return null;

  // Try to match by ID fields first
  for (const feature of geojson.features) {
    const featureProps = feature.properties || {};

    // Check each configured ID field
    for (const field of configuredIdFields) {
      if (props[field] !== undefined && featureProps[field] !== undefined) {
        if (String(props[field]) === String(featureProps[field])) {
          return feature;
        }
      }
    }
  }

  // Fallback: try to match all properties
  for (const feature of geojson.features) {
    const featureProps = feature.properties || {};
    let allMatch = true;
    let hasMatch = false;

    for (const [key, value] of Object.entries(props)) {
      if (featureProps[key] !== undefined) {
        hasMatch = true;
        if (String(featureProps[key]) !== String(value)) {
          allMatch = false;
          break;
        }
      }
    }

    if (allMatch && hasMatch) {
      return feature;
    }
  }

  return null;
}

/**
 * Setup click-to-highlight for all layers
 */
export function setupHighlight(
  map: mapboxgl.Map,
  layers: LayerConfig[],
  visibilityState: Record<string, boolean>,
  deckOverlay: unknown,
  config?: HighlightConfig
): void {
  currentMap = map;
  currentLayers = layers;

  // Set configured ID fields (merge custom with defaults, custom takes priority)
  if (config?.idFields && Array.isArray(config.idFields) && config.idFields.length > 0) {
    // Put custom fields first, then defaults (deduped)
    const customSet = new Set(config.idFields);
    configuredIdFields = [
      ...config.idFields,
      ...DEFAULT_ID_FIELDS.filter(f => !customSet.has(f))
    ];
  } else {
    configuredIdFields = DEFAULT_ID_FIELDS;
  }

  // Expose highlight function globally for location-listener
  (window as any).__fusedHighlightByProperties = (props: Record<string, any>) => {
    highlightByProperties(map, layers, props);
  };
  (window as any).__fusedHighlightClear = () => {
    highlightFeature(map, null);
  };
  map.on('click', (e: any) => {
    const queryLayers = getQueryableLayers(map, layers);
    if (!queryLayers.length) return;

    let features: any[] = [];
    try {
      features = map.queryRenderedFeatures(e.point, { layers: queryLayers }) || [];
    } catch (err) {
      // Ignore errors
    }

    if (features.length > 0) {
      highlightFeature(map, features[0]);
    } else if (deckOverlay) {
      // Try Deck.gl overlay
      const info = (deckOverlay as any)?.pickObject?.({ x: e.point.x, y: e.point.y, radius: 4 });
      if (info?.object) {
        highlightFeature(map, {
          properties: info.object.properties || info.object,
          geometry: null
        });
      } else if (selectedFeature) {
        highlightFeature(map, null);
      }
    } else if (selectedFeature) {
      highlightFeature(map, null);
    }
  });
}

/**
 * Get queryable layer IDs for click using centralized utility
 */
function getQueryableLayers(map: mapboxgl.Map, layers: LayerConfig[]): string[] {
  const result: string[] = [];

  layers.forEach(layer => {
    const ids = getQueryableLayerIds(layer);
    ids.forEach(id => {
      try {
        if (map.getLayer(id)) result.push(id);
      } catch (e) {
        // Layer doesn't exist, skip
      }
    });
  });

  // Also check for legacy layer IDs (backwards compatibility)
  ['gdf-fill', 'gdf-circle', 'hex-fill'].forEach(id => {
    try {
      if (map.getLayer(id)) result.push(id);
    } catch (e) {
      // Layer doesn't exist, skip
    }
  });

  return result;
}

/**
 * Highlight a feature on the map
 */
function highlightFeature(map: mapboxgl.Map, feature: any): void {
  let geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

  if (feature) {
    const props = feature.properties || {};
    const hexId = props.hex || props.h3;

    // If it's a hex, use H3 to get boundary
    if (hexId && window.h3) {
      try {
        const id = toH3(hexId);
        if (id && window.h3.isValidCell(id)) {
          const boundary = window.h3.cellToBoundary(id).map(([lat, lng]: [number, number]) => [lng, lat]);
          boundary.push(boundary[0]);
          geojson.features.push({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [boundary] },
            properties: props
          });
        }
      } catch (e) {}
    }
    // For vector features, look up the FULL geometry from original GeoJSON
    // (queryRenderedFeatures returns tile-clipped geometry which causes cut-off highlights)
    else if (feature.source && originalGeoJSONStore.has(feature.source)) {
      const originalFeature = findOriginalFeature(feature.source, props);
      if (originalFeature?.geometry) {
        geojson.features.push({
          type: 'Feature',
          geometry: originalFeature.geometry,
          properties: props
        });
      } else if (feature.geometry) {
        // Fallback to clipped geometry if original not found
        geojson.features.push({
          type: 'Feature',
          geometry: feature.geometry,
          properties: props
        });
      }
    }
    // Fallback: use the feature's geometry directly (may be clipped for tiled sources)
    else if (feature.geometry) {
      geojson.features.push({
        type: 'Feature',
        geometry: feature.geometry,
        properties: props
      });
    }
  }
  
  if (!highlightLayerAdded) {
    map.addSource('feature-hl', { type: 'geojson', data: geojson });
    map.addLayer({
      id: 'feature-hl-fill',
      type: 'fill',
      source: 'feature-hl',
      paint: {
        'fill-color': HIGHLIGHT_FILL,
        'fill-opacity': 1
      }
    });
    map.addLayer({
      id: 'feature-hl-line',
      type: 'line',
      source: 'feature-hl',
      paint: {
        'line-color': HIGHLIGHT_LINE,
        'line-width': HIGHLIGHT_LINE_WIDTH
      }
    });
    highlightLayerAdded = true;
  } else {
    (map.getSource('feature-hl') as any).setData(geojson);
  }
  
  selectedFeature = feature;
}

/**
 * Highlight a feature by matching properties (for external click events)
 */
function highlightByProperties(
  map: mapboxgl.Map,
  layers: LayerConfig[],
  props: Record<string, any>
): void {
  if (!props || Object.keys(props).length === 0) return;

  // Get all queryable layer IDs
  const queryLayers = getQueryableLayers(map, layers);
  if (!queryLayers.length) return;

  // Query all rendered features in current viewport
  let allFeatures: any[] = [];
  try {
    // Cast to any to avoid TS issues with overloaded signature
    allFeatures = (map as any).queryRenderedFeatures(undefined, { layers: queryLayers }) || [];
  } catch (err) {
    return;
  }

  // Find a feature that matches the incoming properties
  // Use configured ID fields (custom + defaults)
  const idFields = configuredIdFields;

  for (const feature of allFeatures) {
    const featureProps = feature.properties || {};

    // Check if any ID field matches
    for (const field of idFields) {
      if (props[field] !== undefined && featureProps[field] !== undefined) {
        if (String(props[field]) === String(featureProps[field])) {
          highlightFeature(map, feature);
          return;
        }
      }
    }

    // Fallback: check if all incoming props match
    let allMatch = true;
    for (const [key, value] of Object.entries(props)) {
      if (featureProps[key] !== undefined && String(featureProps[key]) !== String(value)) {
        allMatch = false;
        break;
      }
    }
    if (allMatch && Object.keys(props).length > 0) {
      // Verify at least one prop actually matched
      const hasMatch = Object.keys(props).some(k => featureProps[k] !== undefined);
      if (hasMatch) {
        highlightFeature(map, feature);
        return;
      }
    }
  }
}



