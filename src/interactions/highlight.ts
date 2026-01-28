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
  // Name fields (field and farm)
  'name', 'Name', 'NAME', 'Field Name', 'field_name',
  'Farm Name', 'farm_name', 'Farm', 'farm',
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
  console.log('[Highlight] Registering original GeoJSON for source:', layerId, 'with', geojson?.features?.length, 'features');
  originalGeoJSONStore.set(layerId, geojson);
}

// Priority order for ID fields - unique IDs first, then specific names, then general names
// Higher priority fields should be matched preferentially
const PRIORITY_ID_FIELDS = [
  // Truly unique IDs - highest priority
  'id', 'ID', 'Id', 'fid', 'FID', 'OBJECTID', 'objectid', 'index',
  // Specific name fields - high priority
  'Field Name', 'field_name', 'name', 'Name', 'NAME',
  // Geographic/hex IDs
  'GEOID', 'geoid', 'GeoID', 'geo_id', 'FIPS', 'fips',
  'tile_id', 'tileId', 'feature_id', 'featureId',
  'hex', 'h3', 'h3_index', 'cell_id', 'h3_cell',
  // Farm-level fields - lower priority (multiple fields per farm)
  'Farm Name', 'farm_name', 'Farm', 'farm',
  'STATEFP', 'COUNTYFP'
];

/**
 * Find a feature in the original GeoJSON by matching properties
 * Uses a scoring system: features matching more (and higher-priority) ID fields win
 */
function findOriginalFeature(layerId: string, props: Record<string, any>): GeoJSON.Feature | null {
  const geojson = originalGeoJSONStore.get(layerId);
  if (!geojson?.features) return null;

  let bestMatch: GeoJSON.Feature | null = null;
  let bestScore = 0;
  let bestPriority = Infinity;  // Lower is better

  for (const feature of geojson.features) {
    const featureProps = feature.properties || {};
    let score = 0;
    let highestPriority = Infinity;

    // Count how many ID fields match and track highest priority match
    for (let i = 0; i < PRIORITY_ID_FIELDS.length; i++) {
      const field = PRIORITY_ID_FIELDS[i];
      if (props[field] !== undefined && featureProps[field] !== undefined) {
        if (String(props[field]) === String(featureProps[field])) {
          score++;
          if (i < highestPriority) {
            highestPriority = i;
          }
        }
      }
    }

    // Also check configuredIdFields that might not be in PRIORITY_ID_FIELDS
    for (const field of configuredIdFields) {
      if (!PRIORITY_ID_FIELDS.includes(field)) {
        if (props[field] !== undefined && featureProps[field] !== undefined) {
          if (String(props[field]) === String(featureProps[field])) {
            score++;
          }
        }
      }
    }

    // Prefer features with:
    // 1. Higher score (more matching fields)
    // 2. If tied, higher priority match (lower priority index)
    if (score > bestScore || (score === bestScore && highestPriority < bestPriority)) {
      bestScore = score;
      bestPriority = highestPriority;
      bestMatch = feature;
    }
  }

  if (bestMatch) {
    const matchedName = (bestMatch.properties as any)?.['Field Name'] ||
                        (bestMatch.properties as any)?.field_name ||
                        (bestMatch.properties as any)?.name || 'unknown';
    const searchedName = props['Field Name'] || props.field_name || props.name || 'unknown';
    console.log('[Highlight] findOriginalFeature: searched for', searchedName, '-> matched', matchedName,
                '(score:', bestScore, 'priority:', bestPriority, ')');
    return bestMatch;
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

  // Expose highlight functions globally for location-listener
  (window as any).__fusedHighlightByProperties = (props: Record<string, any>, matchAll?: boolean) => {
    console.log('[Highlight] __fusedHighlightByProperties called with:', props);
    highlightByProperties(map, layers, props, matchAll);
  };
  (window as any).__fusedHighlightClear = () => {
    highlightFeature(map, null);
  };
  map.on('click', (e: any) => {
    const queryLayers = getQueryableLayers(map, layers);
    console.log('[Highlight] Click - queryLayers:', queryLayers);
    if (!queryLayers.length) {
      console.log('[Highlight] No queryable layers, skipping');
      return;
    }

    let features: any[] = [];
    try {
      features = map.queryRenderedFeatures(e.point, { layers: queryLayers }) || [];
      console.log('[Highlight] queryRenderedFeatures returned:', features.length, 'features');
      if (features.length > 0) {
        console.log('[Highlight] First feature:', features[0].layer?.id, features[0].properties);
      }
    } catch (err) {
      console.warn('[Highlight] queryRenderedFeatures error:', err);
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
  console.log('[Highlight] highlightFeature called with:', feature ? {
    layer: feature.layer?.id,
    source: feature.source,
    hasGeometry: !!feature.geometry,
    props: feature.properties
  } : 'null (clearing)');

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
      console.log('[Highlight] Looking up original geometry for source:', feature.source);
      const originalFeature = findOriginalFeature(feature.source, props);
      if (originalFeature?.geometry) {
        console.log('[Highlight] Found original geometry');
        geojson.features.push({
          type: 'Feature',
          geometry: originalFeature.geometry,
          properties: props
        });
      } else if (feature.geometry) {
        console.log('[Highlight] Original not found, using clipped geometry');
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

  console.log('[Highlight] Set highlight data with', geojson.features.length, 'features');
  selectedFeature = feature;
}

/**
 * Highlight multiple features on the map
 */
function highlightFeatures(map: mapboxgl.Map, features: any[]): void {
  const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

  for (const feature of features) {
    if (!feature) continue;
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
    else if (feature.source && originalGeoJSONStore.has(feature.source)) {
      const originalFeature = findOriginalFeature(feature.source, props);
      if (originalFeature?.geometry) {
        geojson.features.push({
          type: 'Feature',
          geometry: originalFeature.geometry,
          properties: props
        });
      } else if (feature.geometry) {
        geojson.features.push({
          type: 'Feature',
          geometry: feature.geometry,
          properties: props
        });
      }
    }
    // Fallback: use the feature's geometry directly
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

  selectedFeature = features.length > 0 ? features[0] : null;
}

/**
 * Find all matching features from original GeoJSON store
 * This searches the FULL data, not just rendered features
 */
function findAllOriginalFeatures(props: Record<string, any>): GeoJSON.Feature[] {
  const results: GeoJSON.Feature[] = [];
  const matchedIds = new Set<string>();

  for (const [layerId, geojson] of originalGeoJSONStore.entries()) {
    if (!geojson?.features) continue;

    for (const feature of geojson.features) {
      const featureProps = feature.properties || {};

      // Check if any configured ID field matches
      for (const field of configuredIdFields) {
        if (props[field] !== undefined && featureProps[field] !== undefined) {
          if (String(props[field]) === String(featureProps[field])) {
            // Dedupe by unique identifier
            const featureId = featureProps.id || featureProps['Field Name'] || featureProps.name ||
              JSON.stringify(feature.geometry?.type === 'Polygon' ?
                (feature.geometry as any).coordinates?.[0]?.[0] : Math.random());
            if (!matchedIds.has(String(featureId))) {
              matchedIds.add(String(featureId));
              results.push(feature);
            }
            break;
          }
        }
      }
    }
  }

  return results;
}

/**
 * Highlight a feature by matching properties (for external click events)
 * @param matchAll - if true, highlight ALL matching features (for farm selection)
 */
function highlightByProperties(
  map: mapboxgl.Map,
  layers: LayerConfig[],
  props: Record<string, any>,
  matchAll: boolean = false
): void {
  if (!props || Object.keys(props).length === 0) return;

  // For matchAll mode (farm selection), search the FULL original GeoJSON
  // This ensures we find all fields even if they're outside the current viewport
  if (matchAll) {
    const originalFeatures = findAllOriginalFeatures(props);
    if (originalFeatures.length > 0) {
      highlightOriginalFeatures(map, originalFeatures);
      return;
    }
  }

  // For single feature selection, query rendered features first (faster)
  const queryLayers = getQueryableLayers(map, layers);
  if (!queryLayers.length) return;

  let allFeatures: any[] = [];
  try {
    allFeatures = (map as any).queryRenderedFeatures(undefined, { layers: queryLayers }) || [];
  } catch (err) {
    return;
  }

  const idFields = configuredIdFields;
  const matchingFeatures: any[] = [];
  const matchedIds = new Set<string>();

  for (const feature of allFeatures) {
    const featureProps = feature.properties || {};

    // Check if any ID field matches
    let matched = false;
    for (const field of idFields) {
      if (props[field] !== undefined && featureProps[field] !== undefined) {
        if (String(props[field]) === String(featureProps[field])) {
          const featureId = featureProps.id || featureProps.name || featureProps['Field Name'] ||
            JSON.stringify(feature.geometry?.coordinates?.[0]?.[0] || Math.random());
          if (!matchedIds.has(String(featureId))) {
            matchedIds.add(String(featureId));
            matchingFeatures.push(feature);
          }
          matched = true;
          if (!matchAll) {
            highlightFeature(map, feature);
            return;
          }
          break;
        }
      }
    }

    // Fallback: check if all incoming props match
    if (!matched) {
      let allMatch = true;
      for (const [key, value] of Object.entries(props)) {
        if (featureProps[key] !== undefined && String(featureProps[key]) !== String(value)) {
          allMatch = false;
          break;
        }
      }
      if (allMatch && Object.keys(props).length > 0) {
        const hasMatch = Object.keys(props).some(k => featureProps[k] !== undefined);
        if (hasMatch) {
          const featureId = featureProps.id || featureProps.name || featureProps['Field Name'] ||
            JSON.stringify(feature.geometry?.coordinates?.[0]?.[0] || Math.random());
          if (!matchedIds.has(String(featureId))) {
            matchedIds.add(String(featureId));
            matchingFeatures.push(feature);
          }
          if (!matchAll) {
            highlightFeature(map, feature);
            return;
          }
        }
      }
    }
  }

  // Fallback: if no rendered features matched, try original GeoJSON
  if (matchingFeatures.length === 0) {
    const originalFeatures = findAllOriginalFeatures(props);
    if (originalFeatures.length > 0) {
      if (matchAll) {
        highlightOriginalFeatures(map, originalFeatures);
      } else {
        highlightOriginalFeatures(map, [originalFeatures[0]]);
      }
      return;
    }
  }

  if (matchAll && matchingFeatures.length > 0) {
    highlightFeatures(map, matchingFeatures);
  }
}

/**
 * Highlight features directly from original GeoJSON (already has full geometry)
 */
function highlightOriginalFeatures(map: mapboxgl.Map, features: GeoJSON.Feature[]): void {
  const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

  for (const feature of features) {
    if (!feature?.geometry) continue;
    geojson.features.push({
      type: 'Feature',
      geometry: feature.geometry,
      properties: feature.properties || {}
    });
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

  selectedFeature = features.length > 0 ? features[0] : null;
}



