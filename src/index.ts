/**
 * FusedMaps - Interactive map library for Fused.io
 * 
 * Renders H3 hexagon layers, GeoJSON vectors, MVT tiles, and raster tiles
 * using Mapbox GL JS and Deck.gl.
 */

import type { FusedMapsConfig, FusedMapsInstance, LayerConfig } from './types';
import { initMap, applyViewState, getViewState } from './core/map';
import { addAllLayers, setLayerVisibility, getLayerGeoJSONs } from './layers';
import { setupLayerPanel, updateLayerPanel } from './ui/layer-panel';
import { setupLegend, updateLegend } from './ui/legend';
import { setupTooltip } from './ui/tooltip';
import { setupWidgets } from './ui/widgets';
import { setupDebugPanel } from './ui/debug';
import { setupDrawing } from './ui/drawing';
import { setupHighlight } from './interactions/highlight';
import { setupMessaging } from './messaging';
import { setupDuckDbSql } from './sql/setup';

// Re-export types
export * from './types';

// Track layer visibility state
const layerVisibilityState: Record<string, boolean> = {};

/**
 * Initialize a FusedMaps instance
 */
export function init(config: FusedMapsConfig): FusedMapsInstance {
  const containerId = config.containerId || 'map';

  // Theme (match map_utils.py: <html data-theme="dark|light">)
  try {
    const theme = config.ui?.theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (_) {}
  
  // If drawing is enabled, inject a "drawing layer" entry so it behaves like another layer
  // in the layer panel (toggle visibility).
  if (config.drawing?.enabled) {
    const layerId = config.drawing.layerId || 'drawings';
    const exists = config.layers.some(l => l.id === layerId);
    if (!exists) {
      (config.layers as any).push({
        id: layerId,
        name: config.drawing.layerName || 'Drawings',
        layerType: 'drawing',
        visible: true,
      } as any);
    }
  }

  // Initialize visibility state
  config.layers.forEach(layer => {
    layerVisibilityState[layer.id] = layer.visible !== false;
  });
  // Expose visibility state to internal helpers (used by drawing module)
  (config as any).__visibilityState = layerVisibilityState;
  
  // Create map
  const map = initMap({
    containerId,
    mapboxToken: config.mapboxToken,
    styleUrl: config.styleUrl,
    initialViewState: config.initialViewState,
    screenshotEnabled: config.ui?.screenshot !== false
  });

  // Widgets (zoom/home + optional screenshot + cmd-drag orbit)
  const widgets = setupWidgets(map, config.initialViewState, config.ui?.screenshot !== false);

  // Sidebar panel (inspector)
  // - sidebar undefined => do not mount (no toggle)
  // - sidebar 'show'|'hide' => mount
  // Back-compat: debug=true => sidebar 'show'
  const sidebarMode = (config as any).sidebar || ((config as any).debug ? 'show' : null);
  const debugHandle = sidebarMode ? setupDebugPanel(map, config) : null;
  
  // Deck.gl overlay (for tile layers)
  let deckOverlay: unknown = null;
  let legendUpdateHandler: any = null;
  let duckHandle: any = null;
  let drawingHandle: any = null;
  
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

    // Allow tile autoDomain to trigger legend refresh without tight coupling
    legendUpdateHandler = () => {
      updateLegend(config.layers, layerVisibilityState, getLayerGeoJSONs());
    };
    try {
      window.addEventListener('fusedmaps:legend:update', legendUpdateHandler);
    } catch (_) {}

    // Setup tooltip (needs deckOverlay for tile layers)
    if (config.ui?.tooltip !== false) {
      setupTooltip(map, config.layers, layerVisibilityState, deckOverlay);
    }

    // Drawing (experimental)
    if (config.drawing?.enabled) {
      setupDrawing(map, config).then((h) => {
        drawingHandle = h;
        try { (config as any).__drawingHandle = h; } catch (_) {}
        // Apply current visibility
        try {
          const lid = config.drawing?.layerId || 'drawings';
          const vis = layerVisibilityState[lid] !== false;
          drawingHandle?.setVisible?.(vis);
        } catch (_) {}
      }).catch((e) => {
        console.error('[FusedMaps] Failed to setup drawing:', e);
      });
    }
    
    // Setup interactions
    if (config.highlightOnClick !== false) {
      setupHighlight(map, config.layers, layerVisibilityState, deckOverlay);
    }
    
    // Setup messaging
    if (config.messaging) {
      setupMessaging(map, config.messaging, config.layers);
    }

    // DuckDB-WASM SQL layers (non-tile Parquet-backed hex layers)
    duckHandle = setupDuckDbSql(
      map,
      config,
      layerVisibilityState,
      () => {
        try { updateLayerPanel(config.layers, layerVisibilityState); } catch (_) {}
        try { updateLegend(config.layers, layerVisibilityState, getLayerGeoJSONs()); } catch (_) {}
      }
    );
    
    // Auto-fit to bounds if no custom view
    if (!config.hasCustomView) {
      autoFitBounds(map, config.layers);
      // Update home (⌂) target to the auto-fit result (esp. raster-only maps).
      try {
        // mapbox-gl typings in this repo don't include `.once`, so use `.on` + remove.
        const handler = () => {
          try {
            const vs = getViewState(map);
            widgets?.setHomeViewState?.(vs);
          } catch (_) {}
          try { map.off('moveend', handler as any); } catch (_) {}
        };
        map.on('moveend', handler as any);
      } catch (_) {}
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
      try {
        // remove any overlay-specific listeners
        (deckOverlay as any)?.__fused_hex_tiles__?.destroy?.();
      } catch (_) {}
      try {
        widgets?.destroy?.();
      } catch (_) {}
      try {
        debugHandle?.destroy?.();
      } catch (_) {}
      try {
        duckHandle?.destroy?.();
      } catch (_) {}
      try {
        drawingHandle?.destroy?.();
      } catch (_) {}
      try {
        if (legendUpdateHandler) {
          window.removeEventListener('fusedmaps:legend:update', legendUpdateHandler);
        }
      } catch (_) {}
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
  // Drawing layer is handled by drawing module (it manages its own Mapbox layers)
  const layer = config.layers.find(l => l.id === layerId);
  if ((layer as any)?.layerType === 'drawing') {
    try {
      // drawing module reads from map style; simplest is to toggle by prefix.
      // it installed a global helper on config in setupDrawing.
      const dbg = (config as any).__drawingHandle;
      dbg?.setVisible?.(visible);
    } catch (_) {}
  } else {
    setLayerVisibility(map, layerId, visible, config.layers, deckOverlay);
  }
  updateLayerPanel(config.layers, layerVisibilityState);
  updateLegend(config.layers, layerVisibilityState, getLayerGeoJSONs());
}

function autoFitBounds(map: mapboxgl.Map, layers: LayerConfig[]) {
  const bounds = new mapboxgl.LngLatBounds();
  const geojsons = getLayerGeoJSONs();
  
  layers.forEach(layer => {
    // Hex tile layers are handled by Deck; don't auto-fit on their data.
    if ((layer as any).isTileLayer) return;

    // Raster static overlays can provide explicit bounds.
    if ((layer as any).layerType === 'raster') {
      const b = (layer as any).imageBounds;
      if (Array.isArray(b) && b.length === 4) {
        const [west, south, east, north] = b;
        if ([west, south, east, north].every((x) => typeof x === 'number' && Number.isFinite(x))) {
          bounds.extend([west, south]);
          bounds.extend([east, north]);
        }
      }
      return;
    }

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

