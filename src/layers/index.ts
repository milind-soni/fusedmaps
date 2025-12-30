/**
 * Layer management - add, remove, toggle visibility
 */

import type { LayerConfig, HexLayerConfig, VectorLayerConfig, MVTLayerConfig, RasterLayerConfig, FusedMapsConfig } from '../types';
import { hexToGeoJSON, addStaticHexLayer, setHexLayerVisibility } from './hex';
import { addVectorLayer, addMVTLayer, setVectorLayerVisibility } from './vector';
import { addRasterLayer, setRasterLayerVisibility } from './raster';
import { createHexTileOverlay } from './hex-tiles';

// Store computed GeoJSONs for legend/tooltip access
const layerGeoJSONs: Record<string, GeoJSON.FeatureCollection> = {};

/**
 * Get all computed layer GeoJSONs
 */
export function getLayerGeoJSONs(): Record<string, GeoJSON.FeatureCollection> {
  return layerGeoJSONs;
}

/**
 * Update (or create) a computed GeoJSON for a layer.
 * Useful for dynamic sources (e.g. DuckDB SQL filtered layers) without rebuilding all layers.
 */
export function setLayerGeoJSON(layerId: string, geojson: GeoJSON.FeatureCollection): void {
  layerGeoJSONs[layerId] = geojson;
}

/**
 * Add all layers to the map
 */
export function addAllLayers(
  map: mapboxgl.Map,
  layers: LayerConfig[],
  visibilityState: Record<string, boolean>,
  config: FusedMapsConfig
): { deckOverlay: unknown } {
  // Clear existing layers
  removeAllLayers(map, layers);
  
  // Process layers in reverse order (top of menu renders on top)
  const renderOrder = [...layers].reverse();
  
  renderOrder.forEach(layer => {
    const visible = visibilityState[layer.id] !== false;
    
    switch (layer.layerType) {
      case 'hex': {
        const hexLayer = layer as HexLayerConfig;
        if (hexLayer.isTileLayer) {
          // Tile layers are handled by Deck.gl overlay
          // Skip here - they'll be set up separately
        } else if (hexLayer.data?.length) {
          // Convert hex data to GeoJSON
          const geojson = hexToGeoJSON(hexLayer.data);
          layerGeoJSONs[layer.id] = geojson;
          addStaticHexLayer(map, hexLayer, geojson, visible);
        }
        break;
      }
      
      case 'vector': {
        const vectorLayer = layer as VectorLayerConfig;
        if (vectorLayer.geojson) {
          layerGeoJSONs[layer.id] = vectorLayer.geojson;
          addVectorLayer(map, vectorLayer, visible);
        }
        break;
      }
      
      case 'mvt': {
        const mvtLayer = layer as MVTLayerConfig;
        addMVTLayer(map, mvtLayer, visible);
        break;
      }
      
      case 'raster': {
        const rasterLayer = layer as RasterLayerConfig;
        addRasterLayer(map, rasterLayer, visible);
        break;
      }
    }
  });
  
  // Set up Deck.gl overlay for hex tile layers (if any)
  const hasHexTileLayers = layers.some(l => l.layerType === 'hex' && (l as any).isTileLayer && (l as any).tileUrl);
  let deckOverlay: unknown = null;
  if (hasHexTileLayers) {
    const state = createHexTileOverlay(map, layers, visibilityState);
    deckOverlay = state?.overlay || null;
    if (deckOverlay && state) {
      // Attach a small shim so visibility toggles can rebuild the overlay layers.
      (deckOverlay as any).__fused_hex_tiles__ = state;
    }
  }
  
  return { deckOverlay };
}

/**
 * Remove all layers from the map
 */
function removeAllLayers(map: mapboxgl.Map, layers: LayerConfig[]): void {
  layers.forEach(layer => {
    const layerIds = [
      `${layer.id}-fill`,
      `${layer.id}-extrusion`,
      `${layer.id}-outline`,
      `${layer.id}-circle`,
      `${layer.id}-line`,
      `${layer.id}-raster`
    ];
    
    layerIds.forEach(id => {
      try {
        if (map.getLayer(id)) map.removeLayer(id);
      } catch (e) {}
    });
    
    try {
      if (map.getSource(layer.id)) map.removeSource(layer.id);
    } catch (e) {}
  });
}

/**
 * Set visibility for a single layer
 */
export function setLayerVisibility(
  map: mapboxgl.Map,
  layerId: string,
  visible: boolean,
  layers: LayerConfig[],
  deckOverlay: unknown
): void {
  const layer = layers.find(l => l.id === layerId);
  if (!layer) return;
  
  switch (layer.layerType) {
    case 'hex': {
      const hexLayer = layer as HexLayerConfig;
      if (hexLayer.isTileLayer) {
        // Rebuild deck overlay layers so visibility takes effect
        const state = (deckOverlay as any)?.__fused_hex_tiles__;
        try {
          state?.rebuild?.();
        } catch (e) {}
      } else {
        setHexLayerVisibility(map, layerId, visible, hexLayer.hexLayer?.extruded === true);
      }
      break;
    }
    
    case 'vector':
    case 'mvt':
      setVectorLayerVisibility(map, layerId, visible);
      break;
    
    case 'raster':
      setRasterLayerVisibility(map, layerId, visible);
      break;
  }
}

// Re-export layer utilities
export * from './hex';
export * from './vector';
export * from './raster';

