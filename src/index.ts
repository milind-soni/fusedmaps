/**
 * FusedMaps - Interactive map library for Fused.io
 *
 * Renders H3 hexagon layers, GeoJSON vectors, MVT tiles, and raster tiles
 * using Mapbox GL JS and Deck.gl.
 */

import type { FusedMapsAction, FusedMapsConfig, FusedMapsInstance, FusedMapsState, LayerConfig, LayerSummary, LngLatBoundsLike } from './types';
import { initMap, applyViewState, getViewState } from './core/map';
import { addAllLayers, addSingleLayer, removeSingleLayer, setLayerVisibility, getLayerGeoJSONs, updateLayerStyleInPlace } from './layers';
import { setupLayerPanel, updateLayerPanel } from './ui/layer-panel';
import { setupLegend, updateLegend } from './ui/legend';
import { setupTooltip } from './ui/tooltip';
import { setupWidgets } from './ui/widgets';
import { setupDebugPanel } from './ui/debug';
import { setupGeocoder } from './ui/geocoder';
import { setupHighlight } from './interactions/highlight';
import { setupMessaging } from './messaging';
import { setupDuckDbSql } from './sql/setup';
import { createLayerStore, LayerStore } from './state';
import { normalizeLayerConfig, isNewFormat } from './config';
import { trackMapboxTileLoading } from './ui/tile-loader';

const VALID_LAYER_TYPES = ['hex', 'vector', 'mvt', 'raster', 'pmtiles'] as const;

function validateLayerConfig(config: any): { valid: boolean; error?: string } {
  if (!config || typeof config !== 'object') {
    return { valid: false, error: 'Layer config must be an object' };
  }
  if (!config.id || typeof config.id !== 'string') {
    return { valid: false, error: 'Layer config must have a string id' };
  }
  if (!config.layerType || !VALID_LAYER_TYPES.includes(config.layerType)) {
    return { valid: false, error: `Layer config must have a valid layerType: ${VALID_LAYER_TYPES.join(', ')}` };
  }
  return { valid: true };
}

// Re-export types
export * from './types';
// Re-export state (selectively to avoid conflicts with types.ts)
export { createLayerStore, LayerStore } from './state';
export type { LayerEvent, LayerEventType, LayerEventCallback } from './state';

/**
 * Initialize a FusedMaps instance
 */
export function init(config: FusedMapsConfig): FusedMapsInstance {
  const containerId = config.containerId || 'map';

  // Normalize layer configs (convert new format to internal format)
  const normalizedLayers = config.layers.map((layer) =>
    isNewFormat(layer) ? normalizeLayerConfig(layer) : layer
  );

  // Create normalized config for internal use
  const normalizedConfig: FusedMapsConfig = {
    ...config,
    layers: normalizedLayers,
  };

  // Initialize layer store with normalized layers
  const store = createLayerStore();
  store.init(normalizedLayers);

  // Theme (match map_utils.py: <html data-theme="dark|light">)
  try {
    const theme = config.ui?.theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (_) {}

  // Create map
  const map = initMap({
    containerId,
    mapboxToken: config.mapboxToken,
    styleUrl: config.styleUrl,
    initialViewState: config.initialViewState,
    screenshotEnabled: config.ui?.screenshot !== false
  });

  // Widget positions from config (defaults: controls/scale/basemap=bottom-left, layers=top-right, legend=bottom-right, geocoder=false)
  const widgetPos = config.widgets || {};
  const controlsPos = widgetPos.controls ?? 'bottom-left';
  const scalePos = widgetPos.scale ?? 'bottom-left';
  const basemapPos = widgetPos.basemap ?? 'bottom-left';
  const layersPos = widgetPos.layers ?? 'top-right';
  const legendPos = widgetPos.legend ?? 'bottom-right';
  const geocoderPos = widgetPos.geocoder ?? false;  // Disabled by default

  // Widgets (zoom/home + optional screenshot + cmd-drag orbit + basemap switcher)
  const widgets = setupWidgets(map, config.initialViewState, {
    screenshot: config.ui?.screenshot !== false,
    basemapSwitcher: config.ui?.basemapSwitcher !== false && basemapPos !== false,
    currentStyle: config.styleUrl || '',
    positions: {
      controls: controlsPos === false ? false : controlsPos,
      scale: scalePos === false ? false : scalePos,
      basemap: basemapPos === false ? false : basemapPos,
    }
  });

  // Sidebar panel (inspector)
  // - sidebar undefined => do not mount (no toggle)
  // - sidebar 'show'|'hide' => mount
  // Back-compat: debug=true => sidebar 'show'
  const sidebarMode = (normalizedConfig as any).sidebar || ((normalizedConfig as any).debug ? 'show' : null);
  const debugHandle = sidebarMode ? setupDebugPanel(map, normalizedConfig) : null;
  
  // Deck.gl overlay (for tile layers) - use object ref to avoid stale closures
  const overlayRef = { current: null as unknown };
  let legendUpdateHandler: (() => void) | null = null;
  let duckHandle: { destroy?: () => void } | null = null;

  // Global event handlers (stored for cleanup)
  const resizeHandler = () => map.resize();
  const visibilityHandler = () => { if (!document.hidden) setTimeout(resizeHandler, 100); };

  // Helper to get visibility state from store (for compatibility)
  const getVisibilityState = () => store.getVisibilityState();

  // Helper to get tile data from deck overlay (for RGB categorical legends)
  const getTileData = () => {
    try {
      return (overlayRef.current as any)?.__fused_hex_tiles__?.getTileData?.() || undefined;
    } catch (_) {
      return undefined;
    }
  };

  // Helper to refresh UI
  const refreshUI = () => {
    try { updateLayerPanel(store.getAllConfigs(), getVisibilityState()); } catch (_) {}
    try { updateLegend(store.getAllConfigs(), getVisibilityState(), store.getAllGeoJSONs(), getTileData()); } catch (_) {}
  };

  // Subscribe to store changes for UI updates
  const unsubscribeStore = store.on('*', (event) => {
    if (event.type === 'visibility' || event.type === 'update' || event.type === 'batch') {
      refreshUI();
    }
  });
  
  // Setup UI components
  // Geocoder (location search) - setup first so we can adjust layer panel position
  let geocoderHandle: { destroy: () => void } | null = null;
  if (geocoderPos !== false) {
    geocoderHandle = setupGeocoder(map, {
      position: geocoderPos,
      mapboxToken: config.mapboxToken
    });
    // Adjust layer panel position when geocoder is in same corner
    if (geocoderPos === layersPos) {
      // Push layer panel down when geocoder is above it
      setTimeout(() => {
        const layerPanel = document.getElementById('layer-panel');
        if (layerPanel) {
          layerPanel.style.top = '56px';  // Below geocoder (44px input + 12px gap)
        }
      }, 0);
    }
  }

  // Setup legend first so it appears to the right of layers (row-reverse order)
  if (config.ui?.legend !== false && legendPos !== false) {
    setupLegend(store.getAllConfigs(), getVisibilityState(), store.getAllGeoJSONs(), legendPos);
  }

  if (config.ui?.layerPanel !== false && layersPos !== false) {
    setupLayerPanel(store.getAllConfigs(), getVisibilityState(), (layerId, visible) => {
      handleVisibilityChange(layerId, visible, map, store, overlayRef.current);
    }, store, layersPos);
  }
  
  // Track tile loading cleanup function
  let cleanupTileLoading: (() => void) | null = null;

  // Add layers when map loads
  map.on('load', () => {
    const result = addAllLayers(map, store.getAllConfigs(), getVisibilityState(), normalizedConfig);
    overlayRef.current = result.deckOverlay;

    // Track Mapbox tile loading for MVT/raster layers (spinner)
    const tileSourceIds = store.getAllConfigs()
      .filter(l => l.layerType === 'mvt' || l.layerType === 'raster' || l.layerType === 'pmtiles')
      .map(l => l.id);
    if (tileSourceIds.length > 0) {
      cleanupTileLoading = trackMapboxTileLoading(map, tileSourceIds);
    }

    // Sync GeoJSONs from layer system to store
    const geoJSONs = getLayerGeoJSONs();
    Object.entries(geoJSONs).forEach(([id, geojson]) => {
      store.setGeoJSON(id, geojson);
    });

    // Update UI
    refreshUI();

    // Allow tile autoDomain to trigger legend refresh without tight coupling
    legendUpdateHandler = () => {
      updateLegend(store.getAllConfigs(), getVisibilityState(), store.getAllGeoJSONs(), getTileData());
    };
    try {
      window.addEventListener('fusedmaps:legend:update', legendUpdateHandler);
    } catch (_) {}

    // Setup tooltip (needs deckOverlay for tile layers)
    if (config.ui?.tooltip !== false) {
      setupTooltip(map, store.getAllConfigs(), getVisibilityState(), overlayRef.current);
    }

    // Setup interactions
    if (config.highlightOnClick !== false) {
      setupHighlight(map, store.getAllConfigs(), getVisibilityState(), overlayRef.current);
    }
    
    // Setup messaging (pass deck overlay for hex tile click picking)
    if (config.messaging) {
      setupMessaging(map, config.messaging, store.getAllConfigs(), overlayRef.current);
    }

    // DuckDB-WASM SQL layers (non-tile Parquet-backed hex layers)
    duckHandle = setupDuckDbSql(
      map,
      normalizedConfig,
      getVisibilityState(),
      () => {
        // Sync GeoJSONs after SQL update
        const geoJSONs = getLayerGeoJSONs();
        Object.entries(geoJSONs).forEach(([id, geojson]) => {
          store.setGeoJSON(id, geojson);
        });
        refreshUI();
      }
    );
    
    // Auto-fit to bounds if no custom view
    if (!config.hasCustomView) {
      autoFitBounds(map, store.getAllConfigs(), store);
      // Update home (⌂) target to the auto-fit result (esp. raster-only maps).
      try {
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

    // Handle basemap style changes - re-add all layers after style switch
    // Note: This handler is set up AFTER initial load, so every style.load is a basemap switch
    map.on('style.load', () => {
      // Re-add all layers after basemap change
      try {
        const result = addAllLayers(map, store.getAllConfigs(), getVisibilityState(), normalizedConfig);
        overlayRef.current = result.deckOverlay;

        // Sync GeoJSONs from layer system to store
        const geoJSONs = getLayerGeoJSONs();
        Object.entries(geoJSONs).forEach(([id, geojson]) => {
          store.setGeoJSON(id, geojson);
        });

        // Re-trigger DuckDB SQL layers (they load async and need sources re-created)
        const layerConfigs = store.getAllConfigs();
        layerConfigs.forEach((layer: any) => {
          // Check if it's a DuckDB SQL layer (hex with parquetUrl, not a tile layer)
          if (layer.layerType === 'hex' && !layer.isTileLayer && (layer.parquetUrl || layer.parquetData)) {
            try {
              window.dispatchEvent(new CustomEvent('fusedmaps:sql:update', {
                detail: { layerId: layer.id, sql: layer.sql || 'SELECT * FROM data' }
              }));
            } catch (_) {}
          }
        });

        // Refresh UI
        refreshUI();
      } catch (e) {
        console.warn('[style.load] Error re-adding layers:', e);
      }
    });
  });
  
  // Handle resize - store handlers for cleanup
  map.on('load', () => {
    [100, 500, 1000].forEach(t => setTimeout(resizeHandler, t));
  });
  window.addEventListener('resize', resizeHandler);
  document.addEventListener('visibilitychange', visibilityHandler);
  
  // Return instance with control methods
  const getState = (): FusedMapsState => {
    const viewState = getViewState(map);
    let bounds: LngLatBoundsLike | undefined = undefined;
    try {
      const b = map.getBounds();
      bounds = {
        west: b.getWest(),
        south: b.getSouth(),
        east: b.getEast(),
        north: b.getNorth()
      };
    } catch (_) {}

    // Best-effort property keys from computed GeoJSONs (non-tile)
    const geojsons = store.getAllGeoJSONs();
    const layers: LayerSummary[] = store.getAll().map((s) => {
      const cfg = s.config as any;
      const tooltipColumns: string[] | undefined =
        (Array.isArray(cfg.tooltipColumns) ? cfg.tooltipColumns :
         Array.isArray(cfg.hexLayer?.tooltipColumns) ? cfg.hexLayer.tooltipColumns :
         Array.isArray(cfg.hexLayer?.tooltipAttrs) ? cfg.hexLayer.tooltipAttrs :
         Array.isArray(cfg.vectorLayer?.tooltipColumns) ? cfg.vectorLayer.tooltipColumns :
         Array.isArray(cfg.vectorLayer?.tooltipAttrs) ? cfg.vectorLayer.tooltipAttrs :
         undefined);

      let propertyKeys: string[] | undefined = undefined;
      try {
        const gj: any = geojsons[s.config.id];
        const f0 = gj?.features?.[0];
        const props = f0?.properties;
        if (props && typeof props === 'object') {
          propertyKeys = Object.keys(props).slice(0, 200);
        }
      } catch (_) {}

      return {
        id: s.config.id,
        name: s.config.name,
        layerType: s.config.layerType,
        visible: s.visible,
        order: s.order,
        ...(propertyKeys ? { propertyKeys } : {}),
        ...(tooltipColumns ? { tooltipColumns } : {})
      };
    });

    return { viewState, ...(bounds ? { bounds } : {}), layers };
  };

  const dispatch = (actionOrActions: FusedMapsAction | FusedMapsAction[]): FusedMapsState => {
    const actions = Array.isArray(actionOrActions) ? actionOrActions : [actionOrActions];
    for (const action of actions) {
      if (!action || typeof action !== 'object') continue;

      switch (action.type) {
        case 'setViewState': {
          const vs = (action as any).viewState || {};
          const duration = Number.isFinite((action as any).options?.duration) ? (action as any).options.duration : null;
          if (duration && duration > 0) {
            try {
              map.easeTo({ ...vs, duration });
              break;
            } catch (_) {}
          }
          applyViewState(map, vs);
          break;
        }
        case 'fitBounds': {
          const b = (action as any).bounds;
          if (Array.isArray(b) && b.length === 4) {
            const [west, south, east, north] = b;
            const opts = (action as any).options || {};
            try {
              map.fitBounds([[west, south], [east, north]] as any, {
                padding: Number.isFinite(opts.padding) ? opts.padding : 50,
                maxZoom: Number.isFinite(opts.maxZoom) ? opts.maxZoom : 15,
                duration: Number.isFinite(opts.duration) ? opts.duration : 500
              } as any);
            } catch (_) {}
          }
          break;
        }
        case 'setLayerVisibility': {
          handleVisibilityChange((action as any).layerId, !!(action as any).visible, map, store, overlayRef.current);
          break;
        }
        case 'updateLayer': {
          const layerId = (action as any).layerId;
          const changes = (action as any).changes || {};
          try { (instance as any).updateLayer(layerId, changes); } catch (_) {}
          break;
        }
        case 'addLayer': {
          try { (instance as any).addLayer((action as any).layer, (action as any).options); } catch (_) {}
          break;
        }
        case 'removeLayer': {
          try { (instance as any).removeLayer((action as any).layerId); } catch (_) {}
          break;
        }
        case 'moveLayerUp': {
          try { (instance as any).moveLayerUp((action as any).layerId); } catch (_) {}
          break;
        }
        case 'moveLayerDown': {
          try { (instance as any).moveLayerDown((action as any).layerId); } catch (_) {}
          break;
        }
        case 'updateLegend': {
          try { updateLegend(store.getAllConfigs(), getVisibilityState(), store.getAllGeoJSONs(), getTileData()); } catch (_) {}
          break;
        }
        default:
          break;
      }
    }
    return getState();
  };

  const instance: FusedMapsInstance = {
    map,
    get deckOverlay() { return overlayRef.current; },

    // Layer store access
    store,

    // AI/tool-calling API
    getState,
    dispatch,
    
    // Legacy API
    setLayerVisibility: (layerId: string, visible: boolean) => {
      handleVisibilityChange(layerId, visible, map, store, overlayRef.current);
    },
    updateLegend: () => {
      updateLegend(store.getAllConfigs(), getVisibilityState(), store.getAllGeoJSONs(), getTileData());
    },
    
    // New Layer Management API
    addLayer: (layerConfig: LayerConfig, options?: { order?: number }) => {
      const validation = validateLayerConfig(layerConfig);
      if (!validation.valid) {
        console.warn('[FusedMaps] addLayer:', validation.error);
        return null;
      }
      // Normalize if using new format
      const normalizedLayerConfig = isNewFormat(layerConfig)
        ? normalizeLayerConfig(layerConfig)
        : layerConfig;
      const state = store.add(normalizedLayerConfig, options);
      // Incremental render
      try {
        addSingleLayer(map, state.config, state.visible, normalizedConfig);
      } catch {
        // Fallback to full rebuild if incremental add fails
        const result = addAllLayers(map, store.getAllConfigs(), getVisibilityState(), normalizedConfig);
        overlayRef.current = result.deckOverlay;
      }
      refreshUI();
      return state;
    },
    
    removeLayer: (layerId: string) => {
      if (!layerId || typeof layerId !== 'string') {
        console.warn('[FusedMaps] removeLayer: layerId must be a non-empty string');
        return false;
      }
      const layer = store.get(layerId)?.config;
      const removed = store.remove(layerId);
      if (removed) {
        try {
          if (layer) removeSingleLayer(map, layer);
        } catch {
          const result = addAllLayers(map, store.getAllConfigs(), getVisibilityState(), normalizedConfig);
          overlayRef.current = result.deckOverlay;
        }
        refreshUI();
      }
      return removed;
    },
    
    updateLayer: (layerId: string, changes: Partial<LayerConfig>) => {
      if (!layerId || typeof layerId !== 'string') {
        console.warn('[FusedMaps] updateLayer: layerId must be a non-empty string');
        return null;
      }
      if (!changes || typeof changes !== 'object') {
        console.warn('[FusedMaps] updateLayer: changes must be an object');
        return null;
      }
      const before = store.get(layerId)?.config;
      const state = store.update(layerId, changes);
      if (state) {
        const onlyVisible =
          Object.keys(changes).length === 1 &&
          Object.prototype.hasOwnProperty.call(changes, 'visible');
        if (!onlyVisible && before) {
          // Prefer paint/layout updates in place (no flicker)
          const applied = updateLayerStyleInPlace(map, before, state.config, state.visible);
          if (!applied) {
            // Fallback: recreate just this layer
            try {
              removeSingleLayer(map, before);
              addSingleLayer(map, state.config, state.visible, normalizedConfig);
            } catch {
              const result = addAllLayers(map, store.getAllConfigs(), getVisibilityState(), normalizedConfig);
              overlayRef.current = result.deckOverlay;
            }
          }
        }
        refreshUI();
      }
      return state;
    },
    
    getLayer: (layerId: string) => store.get(layerId),
    getLayers: () => store.getAll(),
    
    moveLayerUp: (layerId: string) => {
      store.moveUp(layerId);
      // Re-render to update z-order (safe fallback for now)
      const result = addAllLayers(map, store.getAllConfigs(), getVisibilityState(), normalizedConfig);
      overlayRef.current = result.deckOverlay;
    },

    moveLayerDown: (layerId: string) => {
      store.moveDown(layerId);
      const result = addAllLayers(map, store.getAllConfigs(), getVisibilityState(), normalizedConfig);
      overlayRef.current = result.deckOverlay;
    },
    
    destroy: () => {
      // Cleanup global event handlers
      try { window.removeEventListener('resize', resizeHandler); } catch {}
      try { document.removeEventListener('visibilitychange', visibilityHandler); } catch {}
      try { if (legendUpdateHandler) window.removeEventListener('fusedmaps:legend:update', legendUpdateHandler); } catch {}

      // Cleanup components
      try { unsubscribeStore(); } catch {}
      try { (overlayRef.current as any)?.__fused_hex_tiles__?.destroy?.(); } catch {}
      try { widgets?.destroy?.(); } catch {}
      try { debugHandle?.destroy?.(); } catch {}
      try { duckHandle?.destroy?.(); } catch {}
      try { geocoderHandle?.destroy?.(); } catch {}
      try { cleanupTileLoading?.(); } catch {}

      map.remove?.();
    }
  };

  return instance;
}

function handleVisibilityChange(
  layerId: string,
  visible: boolean,
  map: mapboxgl.Map,
  store: LayerStore,
  deckOverlay: unknown
) {
  store.setVisible(layerId, visible);

  // Pass current visibility state to avoid stale closure in Deck.gl overlay
  const visibilityState = store.getVisibilityState();
  setLayerVisibility(map, layerId, visible, store.getAllConfigs(), deckOverlay, visibilityState);

  // Get tile data for RGB categorical legends
  let tileData: Map<string, any[]> | undefined;
  try {
    tileData = (deckOverlay as any)?.__fused_hex_tiles__?.getTileData?.() || undefined;
  } catch (_) {}

  updateLayerPanel(store.getAllConfigs(), visibilityState);
  updateLegend(store.getAllConfigs(), visibilityState, store.getAllGeoJSONs(), tileData);
}

function autoFitBounds(map: mapboxgl.Map, layers: LayerConfig[], store: LayerStore) {
  const bounds = new mapboxgl.LngLatBounds();
  const geojsons = store.getAllGeoJSONs();
  
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
