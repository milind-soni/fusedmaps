/**
 * Click-to-highlight interaction
 */

import type { LayerConfig, HexLayerConfig } from '../types';
import { toH3 } from '../layers/hex';
import { getQueryableLayerIds } from '../utils';

const HIGHLIGHT_FILL = 'rgba(255,255,0,0.3)';
const HIGHLIGHT_LINE = 'rgba(255,255,0,1)';
const HIGHLIGHT_LINE_WIDTH = 3;

let highlightLayerAdded = false;
let selectedFeature: any = null;
let currentMap: mapboxgl.Map | null = null;
let currentLayers: LayerConfig[] = [];

/**
 * Setup click-to-highlight for all layers
 */
export function setupHighlight(
  map: mapboxgl.Map,
  layers: LayerConfig[],
  visibilityState: Record<string, boolean>,
  deckOverlay: unknown
): void {
  currentMap = map;
  currentLayers = layers;

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
    // Otherwise use the feature's actual geometry (for vectors)
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
  // Use common ID fields to match
  const idFields = ['Field Name', 'field_name', 'name', 'id', 'ID', 'fid', 'FID', 'OBJECTID'];

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



