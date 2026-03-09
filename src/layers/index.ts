/**
 * Layer management - add, remove, toggle visibility
 *
 * This module handles the actual Mapbox GL layer operations.
 * State is managed by LayerStore in state/layer-store.ts.
 */

import type { LayerConfig, HexLayerConfig, VectorLayerConfig, MVTLayerConfig, RasterLayerConfig, PMTilesLayerConfig, FusedMapsConfig } from '../types';
import { hexToGeoJSON, addStaticHexLayer, setHexLayerVisibility } from './hex';
import { addVectorLayer, addMVTLayer, setVectorLayerVisibility } from './vector';
import { addRasterLayer, setRasterLayerVisibility } from './raster';
import { createHexTileOverlay } from './hex-tiles';
import { addPMTilesLayers, updatePMTilesVisibility, removePMTilesLayers, buildPMTilesColorExpression } from './pmtiles';
import { buildColorExpr } from '../color/expressions';
import { toRgba } from '../color/palettes';
import { getFirstMapboxLayerId, getRemovableLayerIds } from '../utils';

// Store computed GeoJSONs for legend/tooltip access (legacy, now synced to LayerStore)
const layerGeoJSONs: Record<string, GeoJSON.FeatureCollection> = {};

/**
 * Get all computed layer GeoJSONs
 */
export function getLayerGeoJSONs(): Record<string, GeoJSON.FeatureCollection> {
  return layerGeoJSONs;
}

/**
 * Update (or create) a computed GeoJSON for a layer.
 * Also syncs to LayerStore if available.
 */
export function setLayerGeoJSON(layerId: string, geojson: GeoJSON.FeatureCollection): void {
  layerGeoJSONs[layerId] = geojson;
}

/**
 * Clear a layer's GeoJSON from cache
 */
export function clearLayerGeoJSON(layerId: string): void {
  delete layerGeoJSONs[layerId];
}

// Note: getFirstMapboxLayerId is now imported from ../utils

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
        } else if (hexLayer.data?.length) {
          if (!(window as any).deck) {
            const geojson = hexToGeoJSON(hexLayer.data as any[]);
            setLayerGeoJSON(layer.id, geojson);
            addStaticHexLayer(map, hexLayer, geojson, visible);
          }
        }
        break;
      }

      case 'vector': {
        const vecLayer = layer as VectorLayerConfig;
        if (vecLayer.geojson) {
          setLayerGeoJSON(layer.id, vecLayer.geojson);
          addVectorLayer(map, vecLayer, visible);
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

      case 'pmtiles': {
        // PMTiles layers are handled separately after all sync layers
        break;
      }
    }
  });

  // Build beforeId map for hex tile layers
  // For each hex tile layer, find the first Mapbox layer that should render ABOVE it
  const hexTileBeforeIds: Record<string, string | undefined> = {};
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (layer.layerType === 'hex' && (layer as any).isTileLayer) {
      // Find the first non-tile layer at a lower index (visually above this layer)
      for (let j = i - 1; j >= 0; j--) {
        const aboveLayer = layers[j];
        // Skip other tile layers
        if (aboveLayer.layerType === 'hex' && (aboveLayer as any).isTileLayer) continue;
        // Get the first Mapbox layer ID for this layer
        const beforeId = getFirstMapboxLayerId(aboveLayer);
        if (beforeId) {
          hexTileBeforeIds[layer.id] = beforeId;
          break;
        }
      }
    }
  }

  // Set up Deck.gl overlay for hex layers (tile or inline data)
  const hasAnyDeckHexLayers = layers.some(l =>
    l.layerType === 'hex' && ((l as any).isTileLayer && (l as any).tileUrl || (Array.isArray((l as any).data) && (l as any).data.length > 0))
  );
  let deckOverlay: unknown = null;
  if (hasAnyDeckHexLayers) {
    const state = createHexTileOverlay(map, layers, visibilityState, hexTileBeforeIds);
    deckOverlay = state?.overlay || null;
    if (deckOverlay && state) {
      // Attach a small shim so visibility toggles can rebuild the overlay layers.
      (deckOverlay as any).__fused_hex_tiles__ = state;
    }
  }
  
  // Set up PMTiles layers (async - uses native Mapbox vector sources)
  const pmtilesLayers = layers.filter(l => l.layerType === 'pmtiles') as PMTilesLayerConfig[];
  if (pmtilesLayers.length > 0) {
    // Add PMTiles layers asynchronously
    addPMTilesLayers(map, pmtilesLayers, visibilityState, config?.hasCustomView === true).catch(e => {
      console.error('[FusedMaps] Failed to add PMTiles layers:', e);
    });
  }
  
  return { deckOverlay };
}

/**
 * Add a single layer to the map
 */
export function addSingleLayer(
  map: mapboxgl.Map,
  layer: LayerConfig,
  visible: boolean,
  config?: FusedMapsConfig
): void {
  switch (layer.layerType) {
    case 'hex': {
      const hexLayer = layer as HexLayerConfig;
      if (!hexLayer.isTileLayer && hexLayer.data?.length && !(window as any).deck) {
        const geojson = hexToGeoJSON(hexLayer.data);
        setLayerGeoJSON(layer.id, geojson);
        addStaticHexLayer(map, hexLayer, geojson, visible);
      }
      break;
    }
    
    case 'vector': {
      const vectorLayer = layer as VectorLayerConfig;
      if (vectorLayer.geojson) {
        setLayerGeoJSON(layer.id, vectorLayer.geojson);
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
    
    case 'pmtiles': {
      const pmLayer = layer as PMTilesLayerConfig;
      addPMTilesLayers(map, [pmLayer], { [layer.id]: visible }, config?.hasCustomView === true).catch(e => {
        console.error('[FusedMaps] Failed to add PMTiles layer:', e);
      });
      break;
    }
  }
}

/**
 * Remove a single layer from the map
 */
export function removeSingleLayer(map: mapboxgl.Map, layer: LayerConfig): void {
  // Handle PMTiles layers specially
  if (layer.layerType === 'pmtiles') {
    removePMTilesLayers(map, layer.id);
    clearLayerGeoJSON(layer.id);
    return;
  }

  // Use centralized utility for layer IDs
  const layerIds = getRemovableLayerIds(layer);

  layerIds.forEach(id => {
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch (e) {
      // Layer doesn't exist, skip
    }
  });
  
  try {
    if (map.getSource(layer.id)) map.removeSource(layer.id);
    if (map.getSource(`${layer.id}-source`)) map.removeSource(`${layer.id}-source`);
  } catch (e) {}
  
  clearLayerGeoJSON(layer.id);
}

function setPaintSafe(map: mapboxgl.Map, layerId: string, prop: string, value: any) {
  if (map.getLayer(layerId)) {
    map.setPaintProperty(layerId, prop as any, value as any);
  }
}

function setLayoutSafe(map: mapboxgl.Map, layerId: string, prop: string, value: any) {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, prop as any, value as any);
  }
}

function setGeoJSONSourceData(map: mapboxgl.Map, sourceId: string, geojson: any): boolean {
  const src: any = map.getSource(sourceId) as any;
  if (src && typeof src.setData === 'function') {
    src.setData(geojson);
    return true;
  }
  return false;
}

/**
 * Attempt an in-place style update for a layer.
 * Returns true if update was applied without needing remove+add.
 *
 * We only do this for "style-ish" changes. For structural changes
 * (URL/source changes, geometry toggles, etc.), return false.
 */
export function updateLayerStyleInPlace(
  map: mapboxgl.Map,
  before: LayerConfig,
  after: LayerConfig,
  visible: boolean
): boolean {
  if (!before || !after) return false;
  if (before.id !== after.id) return false;
  if (before.layerType !== after.layerType) return false;

  const id = after.id;

  // ------------------------------------------------------------------
  // Raster: opacity + visibility can be updated in place
  // ------------------------------------------------------------------
  if (after.layerType === 'raster') {
    const b = before as RasterLayerConfig;
    const a = after as RasterLayerConfig;

    // Structural changes => rebuild
    const structural =
      b.tileUrl !== a.tileUrl ||
      b.imageUrl !== a.imageUrl ||
      JSON.stringify(b.imageBounds) !== JSON.stringify(a.imageBounds);
    if (structural) return false;

    const opacity = a.opacity ?? 1.0;
    setPaintSafe(map, `${id}-raster`, 'raster-opacity', Math.max(0, Math.min(1, opacity)));
    setRasterLayerVisibility(map, id, visible);
    return true;
  }

  // ------------------------------------------------------------------
  // Vector (GeoJSON): paint props + source data updates
  // ------------------------------------------------------------------
  if (after.layerType === 'vector') {
    const b = before as VectorLayerConfig;
    const a = after as VectorLayerConfig;

    const structural =
      (b.style?.filled !== a.style?.filled) ||
      (b.style?.stroked !== a.style?.stroked);
    if (structural) return false;

    if (a.geojson) {
      const ok = setGeoJSONSourceData(map, id, a.geojson as any);
      if (!ok && !map.getSource(id)) return false;
    }

    const aStyle = a.style || {};
    const geojson = a.geojson;
    const vecData = geojson?.features?.map((f: any) => f.properties || {}) || [];

    const fillColorExpr = (aStyle.fillColor && typeof aStyle.fillColor === 'object' && !Array.isArray(aStyle.fillColor))
      ? buildColorExpr(aStyle.fillColor, vecData)
      : (aStyle.fillColor || 'rgba(0,144,255,0.6)');

    const lineColorExpr = (aStyle.lineColor && typeof aStyle.lineColor === 'object' && !Array.isArray(aStyle.lineColor))
      ? buildColorExpr(aStyle.lineColor, vecData)
      : (aStyle.lineColor || 'rgba(100,100,100,0.8)');

    const lineW = (typeof aStyle.lineWidth === 'number' && isFinite(aStyle.lineWidth)) ? aStyle.lineWidth : 1;
    const layerOpacity = (typeof aStyle.opacity === 'number' && isFinite(aStyle.opacity))
      ? Math.max(0, Math.min(1, aStyle.opacity)) : 0.8;
    const pointRadius = (typeof aStyle.pointRadius === 'number' && isFinite(aStyle.pointRadius))
      ? aStyle.pointRadius : 6;

    setPaintSafe(map, `${id}-fill`, 'fill-color', fillColorExpr as any);
    setPaintSafe(map, `${id}-fill`, 'fill-opacity', layerOpacity);
    setPaintSafe(map, `${id}-outline`, 'line-color', lineColorExpr as any);
    setPaintSafe(map, `${id}-outline`, 'line-width', lineW);
    setPaintSafe(map, `${id}-line`, 'line-color', lineColorExpr as any);
    setPaintSafe(map, `${id}-line`, 'line-width', lineW);
    setPaintSafe(map, `${id}-line`, 'line-opacity', 1);
    setPaintSafe(map, `${id}-circle`, 'circle-radius', pointRadius);
    setPaintSafe(map, `${id}-circle`, 'circle-color', fillColorExpr as any);
    setPaintSafe(map, `${id}-circle`, 'circle-opacity', 0.9);
    setPaintSafe(map, `${id}-circle`, 'circle-stroke-color', lineColorExpr as any);
    setPaintSafe(map, `${id}-circle`, 'circle-stroke-width', 1);

    setVectorLayerVisibility(map, id, visible);
    return true;
  }

  // ------------------------------------------------------------------
  // Hex (static Mapbox): paint props + source data updates
  // ------------------------------------------------------------------
  if (after.layerType === 'hex') {
    const b = before as HexLayerConfig;
    const a = after as HexLayerConfig;

    // Tile-mode hex is Deck; not handled here
    if ((a as any).isTileLayer) return false;

    const structural =
      (b.style?.extruded !== a.style?.extruded) ||
      (b.style?.filled !== a.style?.filled) ||
      (b.style?.stroked !== a.style?.stroked);
    if (structural) return false;

    const geojson = (a.data && Array.isArray(a.data)) ? hexToGeoJSON(a.data as any[]) : null;
    if (geojson) {
      const ok = setGeoJSONSourceData(map, id, geojson as any);
      if (!ok && !map.getSource(id)) return false;
    }

    const aStyle = a.style || {};
    const data = a.data || [];

    const fillColor = Array.isArray(aStyle.fillColor)
      ? toRgba(aStyle.fillColor as number[], 0.8)
      : (buildColorExpr(aStyle.fillColor, data as any[]) || 'rgba(0,144,255,0.7)');

    const lineColor = aStyle.lineColor
      ? (Array.isArray(aStyle.lineColor) ? toRgba(aStyle.lineColor as number[], 1) : buildColorExpr(aStyle.lineColor, data as any[]))
      : 'rgba(255,255,255,0.3)';

    const layerOpacity = (typeof aStyle.opacity === 'number' && isFinite(aStyle.opacity))
      ? Math.max(0, Math.min(1, aStyle.opacity)) : 0.8;

    setPaintSafe(map, `${id}-fill`, 'fill-color', fillColor);
    setPaintSafe(map, `${id}-fill`, 'fill-opacity', layerOpacity);
    setPaintSafe(map, `${id}-outline`, 'line-color', lineColor);
    setPaintSafe(map, `${id}-outline`, 'line-width', aStyle.lineWidth || 0.5);

    const elevScale = aStyle.elevationScale || 1;
    const elevProp = aStyle.elevationAttr ||
      (aStyle.fillColor && typeof aStyle.fillColor === 'object' && !Array.isArray(aStyle.fillColor) ? (aStyle.fillColor as any).attr : null);
    setPaintSafe(map, `${id}-extrusion`, 'fill-extrusion-color', fillColor);
    setPaintSafe(map, `${id}-extrusion`, 'fill-extrusion-height',
      elevProp ? ['*', ['to-number', ['get', elevProp], 0], elevScale] : 100);
    setPaintSafe(map, `${id}-extrusion`, 'fill-extrusion-opacity', layerOpacity);

    setHexLayerVisibility(map, id, visible, aStyle.extruded === true);
    return true;
  }

  // ------------------------------------------------------------------
  // MVT: update paint props only (source is stable)
  // ------------------------------------------------------------------
  if (after.layerType === 'mvt') {
    const b = before as MVTLayerConfig;
    const a = after as MVTLayerConfig;

    const aStyle = a.style || {};
    const bStyle = b.style || {};
    const structural =
      b.tileUrl !== a.tileUrl ||
      b.sourceLayer !== a.sourceLayer ||
      bStyle.extruded !== aStyle.extruded ||
      bStyle.filled !== aStyle.filled;
    if (structural) return false;

    const fillColorExpr = (aStyle.fillColor && typeof aStyle.fillColor === 'object' && !Array.isArray(aStyle.fillColor))
      ? (buildColorExpr(aStyle.fillColor as any, undefined) as any)
      : (aStyle.fillColor || '#FFF5CC');
    const lineColorExpr = (aStyle.lineColor && typeof aStyle.lineColor === 'object' && !Array.isArray(aStyle.lineColor))
      ? (buildColorExpr(aStyle.lineColor as any, undefined) as any)
      : (aStyle.lineColor || '#FFFFFF');

    const fillOpacity = aStyle.opacity ?? 0.8;
    const lineWidth = aStyle.lineWidth ?? 1;

    setPaintSafe(map, `${id}-fill`, 'fill-color', fillColorExpr);
    setPaintSafe(map, `${id}-fill`, 'fill-opacity', fillOpacity);
    setPaintSafe(map, `${id}-line`, 'line-color', lineColorExpr);
    setPaintSafe(map, `${id}-line`, 'line-width', lineWidth);

    if (map.getLayer(`${id}-extrusion`)) {
      setPaintSafe(map, `${id}-extrusion`, 'fill-extrusion-color', fillColorExpr);
      setPaintSafe(map, `${id}-extrusion`, 'fill-extrusion-height',
        ['*', ['get', aStyle.elevationAttr || 'height'], aStyle.elevationScale || 1]);
      setPaintSafe(map, `${id}-extrusion`, 'fill-extrusion-opacity', 0.9);
    }

    setVectorLayerVisibility(map, id, visible);
    return true;
  }

  // ------------------------------------------------------------------
  // PMTiles: update paint props for all prefix-based layers
  // ------------------------------------------------------------------
  if (after.layerType === 'pmtiles') {
    const b = before as PMTilesLayerConfig;
    const a = after as PMTilesLayerConfig;

    const structural =
      b.pmtilesUrl !== a.pmtilesUrl ||
      b.pmtilesPath !== a.pmtilesPath ||
      JSON.stringify(b.excludeSourceLayers || []) !== JSON.stringify(a.excludeSourceLayers || []) ||
      b.sourceLayer !== a.sourceLayer;
    if (structural) return false;

    const aStyle = a.style || {};
    const opacity = aStyle.opacity ?? 0.8;
    const baseLineWidth = aStyle.lineWidth ?? 1;
    const pointRadius = aStyle.pointRadius ?? 4;

    const isFilled = aStyle.filled !== false;
    const isStroked = aStyle.stroked !== false;
    const effectiveLineWidth = isStroked ? baseLineWidth : 0;
    const effectiveFillOpacity = isFilled ? opacity : 0;

    const attr = (aStyle.fillColor && typeof aStyle.fillColor === 'object' && !Array.isArray(aStyle.fillColor))
      ? (aStyle.fillColor as any).attr || 'value' : 'value';
    const fillColorExpr = buildPMTilesColorExpression(aStyle.fillColor, attr, '#ff8c00');
    const lineColorExpr = buildPMTilesColorExpression(aStyle.lineColor, attr, '#ffffff');

    const prefix = `${id}-`;
    const styleLayers = (map.getStyle()?.layers || []) as any[];

    for (const l of styleLayers) {
      const lid = l?.id as string | undefined;
      if (!lid || !lid.startsWith(prefix)) continue;

      if (lid.endsWith('-fill')) {
        setPaintSafe(map, lid, 'fill-color', fillColorExpr);
        setPaintSafe(map, lid, 'fill-opacity', effectiveFillOpacity);
      } else if (lid.endsWith('-line')) {
        setPaintSafe(map, lid, 'line-color', lineColorExpr);
        setPaintSafe(map, lid, 'line-width', effectiveLineWidth);
        setPaintSafe(map, lid, 'line-opacity', opacity);
      } else if (lid.endsWith('-circles')) {
        // Mirror the zoom expression from addPMTilesLayers
        const radiusExpr: any = [
          'interpolate', ['exponential', 2], ['zoom'],
          0, pointRadius * 0.5,
          10, pointRadius,
          15, pointRadius * 4,
          20, pointRadius * 20,
        ];
        setPaintSafe(map, lid, 'circle-radius', radiusExpr);
        setPaintSafe(map, lid, 'circle-color', fillColorExpr);
        setPaintSafe(map, lid, 'circle-opacity', effectiveFillOpacity);
        setPaintSafe(map, lid, 'circle-stroke-color', lineColorExpr);
        setPaintSafe(map, lid, 'circle-stroke-width', effectiveLineWidth);
      }

      // Keep visibility in sync too
      setLayoutSafe(map, lid, 'visibility', visible ? 'visible' : 'none');
    }

    return true;
  }

  return false;
}

/**
 * Remove all layers from the map
 */
function removeAllLayers(map: mapboxgl.Map, layers: LayerConfig[]): void {
  layers.forEach(layer => {
    removeSingleLayer(map, layer);
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
  deckOverlay: unknown,
  visibilityState?: Record<string, boolean>
): void {
  const layer = layers.find(l => l.id === layerId);
  if (!layer) return;

  switch (layer.layerType) {
    case 'hex': {
      const hexLayer = layer as HexLayerConfig;
      const isInlineDeck = !hexLayer.isTileLayer
        && Array.isArray((hexLayer as any).data)
        && (hexLayer as any).data.length > 0;
      if (hexLayer.isTileLayer || isInlineDeck) {
        const state = (deckOverlay as any)?.__fused_hex_tiles__;
        try {
          state?.rebuild?.(visibilityState);
        } catch (e) {}
      } else {
        setHexLayerVisibility(map, layerId, visible, hexLayer.style?.extruded === true);
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
    
    case 'pmtiles':
      updatePMTilesVisibility(map, layerId, visible);
      break;
  }
}

/**
 * Set opacity for a single layer across all its sublayers
 */
export function setLayerOpacity(
  map: mapboxgl.Map,
  layerId: string,
  opacity: number,
  layers: LayerConfig[],
  deckOverlay: unknown,
  visibilityState?: Record<string, boolean>
): void {
  const layer = layers.find(l => l.id === layerId);
  if (!layer) return;
  const o = Math.max(0, Math.min(1, opacity));

  switch (layer.layerType) {
    case 'hex': {
      const hexLayer = layer as HexLayerConfig;
      if (hexLayer.style) hexLayer.style.opacity = o;

      // Mapbox GL sublayers (static hex)
      setPaintSafe(map, `${layerId}-fill`, 'fill-opacity', o);
      setPaintSafe(map, `${layerId}-extrusion`, 'fill-extrusion-opacity', o);
      setPaintSafe(map, `${layerId}-outline`, 'line-opacity', o);

      // Deck.gl overlay (tiled / inline hex) – rebuild with updated config
      const isInlineDeck = !hexLayer.isTileLayer
        && Array.isArray((hexLayer as any).data)
        && (hexLayer as any).data.length > 0;
      if (hexLayer.isTileLayer || isInlineDeck) {
        const state = (deckOverlay as any)?.__fused_hex_tiles__;
        try { state?.rebuild?.(visibilityState); } catch {}
      }
      break;
    }

    case 'vector':
    case 'mvt':
      setPaintSafe(map, `${layerId}-fill`, 'fill-opacity', o);
      setPaintSafe(map, `${layerId}-outline`, 'line-opacity', o);
      setPaintSafe(map, `${layerId}-line`, 'line-opacity', o);
      setPaintSafe(map, `${layerId}-circle`, 'circle-opacity', o);
      setPaintSafe(map, `${layerId}-circle`, 'circle-stroke-opacity', o);
      break;

    case 'raster':
      setPaintSafe(map, `${layerId}-raster`, 'raster-opacity', o);
      break;

    case 'pmtiles': {
      const prefix = `${layerId}-`;
      const styleLayers = (map.getStyle()?.layers || []) as any[];
      for (const l of styleLayers) {
        const lid = l?.id as string | undefined;
        if (!lid || !lid.startsWith(prefix)) continue;
        if (lid.endsWith('-fill')) setPaintSafe(map, lid, 'fill-opacity', o);
        else if (lid.endsWith('-line')) setPaintSafe(map, lid, 'line-opacity', o);
        else if (lid.endsWith('-circles')) setPaintSafe(map, lid, 'circle-opacity', o);
      }
      break;
    }
  }
}

// Re-export layer utilities
export * from './hex';
export * from './vector';
export * from './raster';
export * from './pmtiles';
