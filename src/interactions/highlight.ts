/**
 * Click-to-highlight interaction
 */

import type { LayerConfig, HexLayerConfig } from '../types';
import { toH3 } from '../layers/hex';

const HIGHLIGHT_FILL = 'rgba(255,255,0,0.3)';
const HIGHLIGHT_LINE = 'rgba(255,255,0,1)';
const HIGHLIGHT_LINE_WIDTH = 3;

let highlightLayerAdded = false;
let selectedFeature: any = null;

/**
 * Setup click-to-highlight for all layers
 */
export function setupHighlight(
  map: mapboxgl.Map,
  layers: LayerConfig[],
  visibilityState: Record<string, boolean>,
  deckOverlay: unknown
): void {
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
 * Get queryable layer IDs for click
 */
function getQueryableLayers(map: mapboxgl.Map, layers: LayerConfig[]): string[] {
  const result: string[] = [];
  
  layers.forEach(layer => {
    if ((layer as any).isTileLayer) return;
    
    const layerType = layer.layerType;
    let ids: string[] = [];
    
    if (layerType === 'vector') {
      ids = [`${layer.id}-fill`, `${layer.id}-circle`, `${layer.id}-line`];
    } else if (layerType === 'hex') {
      const hexLayer = layer as HexLayerConfig;
      ids = [hexLayer.hexLayer?.extruded ? `${layer.id}-extrusion` : `${layer.id}-fill`];
    }
    
    ids.forEach(id => {
      try {
        if (map.getLayer(id)) result.push(id);
      } catch (e) {}
    });
  });
  
  // Also check for legacy layer IDs
  ['gdf-fill', 'gdf-circle', 'hex-fill'].forEach(id => {
    try {
      if (map.getLayer(id)) result.push(id);
    } catch (e) {}
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

