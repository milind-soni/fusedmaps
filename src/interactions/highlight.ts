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

// Module-level: shared across instances (keyed by layerId, which are unique per layer)
const originalGeoJSONStore: Map<string, GeoJSON.FeatureCollection> = new Map();

// Priority order for ID fields - unique IDs first, then specific names, then general names
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

interface CategoryPair {
  value: string | number;
  label: string;
}

/**
 * Find a feature in the original GeoJSON by matching properties.
 * Uses a scoring system: features matching more (and higher-priority) ID fields win.
 */
function findOriginalFeature(
  layerId: string,
  props: Record<string, any>,
  configuredIdFields: string[]
): GeoJSON.Feature | null {
  const geojson = originalGeoJSONStore.get(layerId);
  if (!geojson?.features) return null;

  let bestMatch: GeoJSON.Feature | null = null;
  let bestScore = 0;
  let bestPriority = Infinity;

  for (const feature of geojson.features) {
    const featureProps = feature.properties || {};
    let score = 0;
    let highestPriority = Infinity;

    for (let i = 0; i < PRIORITY_ID_FIELDS.length; i++) {
      const field = PRIORITY_ID_FIELDS[i];
      if (props[field] !== undefined && featureProps[field] !== undefined) {
        if (String(props[field]) === String(featureProps[field])) {
          score++;
          if (i < highestPriority) highestPriority = i;
        }
      }
    }

    for (const field of configuredIdFields) {
      if (!PRIORITY_ID_FIELDS.includes(field)) {
        if (props[field] !== undefined && featureProps[field] !== undefined) {
          if (String(props[field]) === String(featureProps[field])) score++;
        }
      }
    }

    if (score > bestScore || (score === bestScore && highestPriority < bestPriority)) {
      bestScore = score;
      bestPriority = highestPriority;
      bestMatch = feature;
    }
  }

  if (bestMatch) return bestMatch;

  // Fallback: match all properties
  for (const feature of geojson.features) {
    const featureProps = feature.properties || {};
    let allMatch = true;
    let hasMatch = false;

    for (const [key, value] of Object.entries(props)) {
      if (featureProps[key] !== undefined) {
        hasMatch = true;
        if (String(featureProps[key]) !== String(value)) { allMatch = false; break; }
      }
    }

    if (allMatch && hasMatch) return feature;
  }

  return null;
}

/**
 * Find all matching features from original GeoJSON store
 */
function findAllOriginalFeatures(
  props: Record<string, any>,
  configuredIdFields: string[]
): GeoJSON.Feature[] {
  const results: GeoJSON.Feature[] = [];
  const matchedIds = new Set<string>();

  for (const geojson of originalGeoJSONStore.values()) {
    if (!geojson?.features) continue;

    for (const feature of geojson.features) {
      const featureProps = feature.properties || {};

      for (const field of configuredIdFields) {
        if (props[field] !== undefined && featureProps[field] !== undefined) {
          if (String(props[field]) === String(featureProps[field])) {
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
 * Get queryable layer IDs for click using centralized utility
 */
function getQueryableLayers(map: mapboxgl.Map, layers: LayerConfig[]): string[] {
  const result: string[] = [];

  layers.forEach(layer => {
    const ids = getQueryableLayerIds(layer);
    ids.forEach(id => {
      try {
        if (map.getLayer(id)) result.push(id);
      } catch (e) {}
    });
  });

  // Also check for legacy layer IDs (backwards compatibility)
  ['gdf-fill', 'gdf-circle', 'hex-fill'].forEach(id => {
    try {
      if (map.getLayer(id)) result.push(id);
    } catch (e) {}
  });

  return result;
}

/**
 * Setup click-to-highlight for all layers.
 *
 * Each call creates isolated closure state and namespaced Mapbox source/layer IDs,
 * so multiple map instances on the same page work independently.
 */
export function setupHighlight(
  map: mapboxgl.Map,
  layers: LayerConfig[],
  visibilityState: Record<string, boolean>,
  deckOverlay: unknown,
  config?: HighlightConfig
): void {
  // Derive a stable per-instance prefix from the map container ID
  const containerId = (map as any).getContainer?.()?.id || `map-${Math.random().toString(36).substr(2, 6)}`;
  const HL_SOURCE = `feature-hl-${containerId}`;
  const HL_FILL_LAYER = `feature-hl-fill-${containerId}`;
  const HL_LINE_LAYER = `feature-hl-line-${containerId}`;

  // Per-instance mutable state
  let highlightLayerAdded = false;
  let selectedFeature: any = null;

  let configuredIdFields = DEFAULT_ID_FIELDS;
  if (config?.idFields?.length) {
    const customSet = new Set(config.idFields);
    configuredIdFields = [
      ...config.idFields,
      ...DEFAULT_ID_FIELDS.filter(f => !customSet.has(f))
    ];
  }

  // ----------------------------------------------------------------
  // Core highlight renderers
  // ----------------------------------------------------------------

  function ensureHighlightLayers(geojson: GeoJSON.FeatureCollection): void {
    if (!highlightLayerAdded) {
      map.addSource(HL_SOURCE, { type: 'geojson', data: geojson });
      map.addLayer({
        id: HL_FILL_LAYER,
        type: 'fill',
        source: HL_SOURCE,
        paint: { 'fill-color': HIGHLIGHT_FILL, 'fill-opacity': 1 }
      });
      map.addLayer({
        id: HL_LINE_LAYER,
        type: 'line',
        source: HL_SOURCE,
        paint: { 'line-color': HIGHLIGHT_LINE, 'line-width': HIGHLIGHT_LINE_WIDTH }
      });
      highlightLayerAdded = true;
    } else {
      (map.getSource(HL_SOURCE) as any).setData(geojson);
    }
  }

  function featureToGeoJSONFeature(feature: any): GeoJSON.Feature | null {
    const props = feature.properties || {};
    const hexId = props.hex || props.h3;

    if (hexId && window.h3) {
      try {
        const id = toH3(hexId);
        if (id && window.h3.isValidCell(id)) {
          const boundary = window.h3.cellToBoundary(id).map(([lat, lng]: [number, number]) => [lng, lat]);
          boundary.push(boundary[0]);
          return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [boundary] }, properties: props };
        }
      } catch (e) {}
    }

    if (feature.source && originalGeoJSONStore.has(feature.source)) {
      const original = findOriginalFeature(feature.source, props, configuredIdFields);
      if (original?.geometry) return { type: 'Feature', geometry: original.geometry, properties: props };
    }

    if (feature.geometry) return { type: 'Feature', geometry: feature.geometry, properties: props };

    return null;
  }

  function highlightFeature(feature: any): void {
    const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    if (feature) {
      const f = featureToGeoJSONFeature(feature);
      if (f) geojson.features.push(f);
    }
    ensureHighlightLayers(geojson);
    selectedFeature = feature;
  }

  function highlightMultipleFeatures(features: any[]): void {
    const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    for (const feature of features) {
      if (!feature) continue;
      const f = featureToGeoJSONFeature(feature);
      if (f) geojson.features.push(f);
    }
    ensureHighlightLayers(geojson);
    selectedFeature = features.length > 0 ? features[0] : null;
  }

  function highlightOriginalFeatures(features: GeoJSON.Feature[]): void {
    const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    for (const feature of features) {
      if (!feature?.geometry) continue;
      geojson.features.push({ type: 'Feature', geometry: feature.geometry, properties: feature.properties || {} });
    }
    ensureHighlightLayers(geojson);
    selectedFeature = features.length > 0 ? features[0] : null;
  }

  // ----------------------------------------------------------------
  // Property-based highlight (for external location listener)
  // ----------------------------------------------------------------

  function highlightByProperties(props: Record<string, any>, matchAll: boolean = false): void {
    if (!props || Object.keys(props).length === 0) return;

    if (matchAll) {
      const originalFeatures = findAllOriginalFeatures(props, configuredIdFields);
      if (originalFeatures.length > 0) { highlightOriginalFeatures(originalFeatures); return; }
    }

    const queryLayers = getQueryableLayers(map, layers);
    if (!queryLayers.length) return;

    let allFeatures: any[] = [];
    try {
      allFeatures = (map as any).queryRenderedFeatures(undefined, { layers: queryLayers }) || [];
    } catch (err) { return; }

    const matchingFeatures: any[] = [];
    const matchedIds = new Set<string>();

    for (const feature of allFeatures) {
      const featureProps = feature.properties || {};
      let matched = false;

      for (const field of configuredIdFields) {
        if (props[field] !== undefined && featureProps[field] !== undefined) {
          if (String(props[field]) === String(featureProps[field])) {
            const featureId = featureProps.id || featureProps.name || featureProps['Field Name'] ||
              JSON.stringify(feature.geometry?.coordinates?.[0]?.[0] || Math.random());
            if (!matchedIds.has(String(featureId))) {
              matchedIds.add(String(featureId));
              matchingFeatures.push(feature);
            }
            matched = true;
            if (!matchAll) { highlightFeature(feature); return; }
            break;
          }
        }
      }

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
            if (!matchAll) { highlightFeature(feature); return; }
          }
        }
      }
    }

    if (matchingFeatures.length === 0) {
      const originalFeatures = findAllOriginalFeatures(props, configuredIdFields);
      if (originalFeatures.length > 0) {
        highlightOriginalFeatures(matchAll ? originalFeatures : [originalFeatures[0]]);
        return;
      }
    }

    if (matchAll && matchingFeatures.length > 0) {
      highlightMultipleFeatures(matchingFeatures);
    }
  }

  // ----------------------------------------------------------------
  // Expose functions globally for location-listener integration
  // ----------------------------------------------------------------
  (window as any).__fusedHighlightByProperties = (props: Record<string, any>, matchAll?: boolean) => {
    highlightByProperties(props, matchAll);
  };
  (window as any).__fusedHighlightClear = () => {
    highlightFeature(null);
  };

  // ----------------------------------------------------------------
  // Click handler
  // ----------------------------------------------------------------
  map.on('click', (e: any) => {
    const queryLayers = getQueryableLayers(map, layers);
    if (!queryLayers.length) return;

    let features: any[] = [];
    try {
      features = map.queryRenderedFeatures(e.point, { layers: queryLayers }) || [];
    } catch (err) {}

    if (features.length > 0) {
      highlightFeature(features[0]);
    } else if (deckOverlay) {
      const info = (deckOverlay as any)?.pickObject?.({ x: e.point.x, y: e.point.y, radius: 4 });
      if (info?.object) {
        highlightFeature({ properties: info.object.properties || info.object, geometry: null });
      } else if (selectedFeature) {
        highlightFeature(null);
      }
    } else if (selectedFeature) {
      highlightFeature(null);
    }
  });
}
