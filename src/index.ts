/**
 * FusedMaps - Interactive map library for Fused.io
 * 
 * Renders H3 hexagon layers, GeoJSON vectors, MVT tiles, and raster tiles
 * using Mapbox GL JS and Deck.gl.
 */

import type { FusedMapsConfig, FusedMapsInstance, LayerConfig } from './types';
import { initMap, applyViewState } from './core/map';
import { addAllLayers, setLayerVisibility, getLayerGeoJSONs } from './layers';
import { setupLayerPanel, updateLayerPanel } from './ui/layer-panel';
import { setupLegend, updateLegend } from './ui/legend';
import { setupTooltip } from './ui/tooltip';
import { setupHighlight } from './interactions/highlight';
import { setupMessaging } from './messaging';

// Re-export types
export * from './types';

// Track layer visibility state
const layerVisibilityState: Record<string, boolean> = {};

/**
 * Initialize a FusedMaps instance
 */
export function init(config: FusedMapsConfig): FusedMapsInstance {
  const containerId = config.containerId || 'map';
  
  // Initialize visibility state
  config.layers.forEach(layer => {
    layerVisibilityState[layer.id] = layer.visible !== false;
  });
  
  // Create map
  const map = initMap({
    containerId,
    mapboxToken: config.mapboxToken,
    styleUrl: config.styleUrl,
    initialViewState: config.initialViewState
  });
  
  // Deck.gl overlay (for tile layers)
  let deckOverlay: unknown = null;
  
  // Setup UI components
  if (config.ui?.layerPanel !== false) {
    setupLayerPanel(config.layers, layerVisibilityState, (layerId, visible) => {
      handleVisibilityChange(layerId, visible, map, config, deckOverlay);
    });
  }
  
  if (config.ui?.legend !== false) {
    setupLegend(config.layers, layerVisibilityState, getLayerGeoJSONs());
  }
  
  // Add layers when map loads
  map.on('load', () => {
    const result = addAllLayers(map, config.layers, layerVisibilityState, config);
    deckOverlay = result.deckOverlay;
    
    // Update UI
    updateLayerPanel(config.layers, layerVisibilityState);
    updateLegend(config.layers, layerVisibilityState, getLayerGeoJSONs());

    // Setup tooltip (needs deckOverlay for tile layers)
    if (config.ui?.tooltip !== false) {
      setupTooltip(map, config.layers, layerVisibilityState, deckOverlay);
    }
    
    // Setup interactions
    if (config.highlightOnClick !== false) {
      setupHighlight(map, config.layers, layerVisibilityState, deckOverlay);
    }
    
    // Setup messaging
    if (config.messaging) {
      setupMessaging(map, config.messaging, config.layers);
    }
    
    // Auto-fit to bounds if no custom view
    if (!config.hasCustomView) {
      autoFitBounds(map, config.layers);
    }
  });
  
  // Handle resize
  map.on('load', () => {
    [100, 500, 1000].forEach(t => setTimeout(() => map.resize(), t));
  });
  window.addEventListener('resize', () => map.resize());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(() => map.resize(), 100);
  });
  
  // Return instance with control methods
  return {
    map,
    deckOverlay,
    setLayerVisibility: (layerId: string, visible: boolean) => {
      handleVisibilityChange(layerId, visible, map, config, deckOverlay);
    },
    updateLegend: () => {
      updateLegend(config.layers, layerVisibilityState, getLayerGeoJSONs());
    },
    destroy: () => {
      // Cleanup
      map.remove?.();
    }
  };
}

function handleVisibilityChange(
  layerId: string,
  visible: boolean,
  map: mapboxgl.Map,
  config: FusedMapsConfig,
  deckOverlay: unknown
) {
  layerVisibilityState[layerId] = visible;
  setLayerVisibility(map, layerId, visible, config.layers, deckOverlay);
  updateLayerPanel(config.layers, layerVisibilityState);
  updateLegend(config.layers, layerVisibilityState, getLayerGeoJSONs());
}

function autoFitBounds(map: mapboxgl.Map, layers: LayerConfig[]) {
  const bounds = new mapboxgl.LngLatBounds();
  const geojsons = getLayerGeoJSONs();
  
  layers.forEach(layer => {
    if ((layer as any).isTileLayer) return;
    const geojson = geojsons[layer.id];
    if (!geojson?.features?.length) return;
    
    geojson.features.forEach((f: any) => {
      if (f.geometry?.type === 'Point') {
        bounds.extend(f.geometry.coordinates);
      } else if (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon') {
        const coords = f.geometry.type === 'Polygon' 
          ? [f.geometry.coordinates] 
          : f.geometry.coordinates;
        coords.forEach((poly: any) => poly[0]?.forEach((c: any) => bounds.extend(c)));
      } else if (f.geometry?.type === 'LineString') {
        f.geometry.coordinates.forEach((c: any) => bounds.extend(c));
      }
    });
  });
  
  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 500 });
  }
}

// Expose on window for UMD usage
if (typeof window !== 'undefined') {
  (window as any).FusedMaps = { init };
}

export default { init };

