/**
 * H3 Hexagon layer rendering
 * 
 * Supports both static data (converted to GeoJSON) and tile-based loading via Deck.gl
 */

import type { HexLayerConfig, FusedMapsConfig } from '../types';
import { buildColorExpr } from '../color/expressions';
import { toRgba } from '../color/palettes';

/**
 * Convert H3 hex ID to canonical string format
 */
export function toH3(hex: unknown): string | null {
  if (hex == null) return null;
  
  try {
    if (typeof hex === 'string') {
      const s = hex.startsWith('0x') ? hex.slice(2) : hex;
      // If it's all digits, convert from BigInt
      if (/^\d+$/.test(s)) {
        return BigInt(s).toString(16);
      }
      // Check if it contains hex letters
      return /[a-f]/i.test(s) ? s.toLowerCase() : s.toLowerCase();
    }
    
    if (typeof hex === 'number') {
      return BigInt(Math.trunc(hex)).toString(16);
    }
    
    if (typeof hex === 'bigint') {
      return hex.toString(16);
    }
  } catch (e) {
    // Ignore conversion errors
  }
  
  return null;
}

/**
 * Convert H3 hex data array to GeoJSON FeatureCollection
 */
export function hexToGeoJSON(data: Array<Record<string, unknown>>): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  
  for (const d of data) {
    const hexId = toH3(d.hex ?? d.h3 ?? d.index ?? d.id);
    if (!hexId || !window.h3?.isValidCell(hexId)) continue;
    
    try {
      const boundary = window.h3.cellToBoundary(hexId);
      const coords = boundary.map(([lat, lng]) => [lng, lat]);
      coords.push(coords[0]); // Close the polygon
      
      features.push({
        type: 'Feature',
        properties: { ...d, hex: hexId },
        geometry: {
          type: 'Polygon',
          coordinates: [coords]
        }
      });
    } catch (e) {
      // Skip invalid hexagons
    }
  }
  
  return { type: 'FeatureCollection', features };
}

/**
 * Add a static hex layer to the map (using Mapbox GL)
 */
export function addStaticHexLayer(
  map: mapboxgl.Map,
  layer: HexLayerConfig,
  geojson: GeoJSON.FeatureCollection,
  visible: boolean
): void {
  const cfg = layer.hexLayer || {};
  const data = layer.data || [];
  
  // Add source
  map.addSource(layer.id, { type: 'geojson', data: geojson });
  
  // Build fill color expression
  const fillColor = Array.isArray(cfg.getFillColor)
    ? toRgba(cfg.getFillColor, 0.8)
    : buildColorExpr(cfg.getFillColor, data) || 'rgba(0,144,255,0.7)';
  
  // Build line color expression
  const lineColor = cfg.getLineColor
    ? (Array.isArray(cfg.getLineColor) 
        ? toRgba(cfg.getLineColor, 1) 
        : buildColorExpr(cfg.getLineColor, data))
    : 'rgba(255,255,255,0.3)';
  
  // Layer opacity
  const layerOpacity = (typeof cfg.opacity === 'number' && isFinite(cfg.opacity))
    ? Math.max(0, Math.min(1, cfg.opacity))
    : 0.8;
  
  // Handle extruded (3D) vs flat rendering
  if (cfg.extruded) {
    const elevScale = cfg.elevationScale || 1;
    map.addLayer({
      id: `${layer.id}-extrusion`,
      type: 'fill-extrusion',
      source: layer.id,
      paint: {
        'fill-extrusion-color': fillColor,
        'fill-extrusion-height': (cfg.getFillColor as any)?.attr
          ? ['*', ['get', (cfg.getFillColor as any).attr], elevScale]
          : 100,
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': layerOpacity
      },
      layout: { visibility: visible ? 'visible' : 'none' }
    });
  } else {
    // Flat fill layer
    if (cfg.filled !== false) {
      map.addLayer({
        id: `${layer.id}-fill`,
        type: 'fill',
        source: layer.id,
        paint: {
          'fill-color': fillColor,
          'fill-opacity': layerOpacity
        },
        layout: { visibility: visible ? 'visible' : 'none' }
      });
    }
  }
  
  // Outline layer (honor stroked flag)
  if (cfg.stroked !== false) {
    map.addLayer({
      id: `${layer.id}-outline`,
      type: 'line',
      source: layer.id,
      paint: {
        'line-color': lineColor,
        'line-width': cfg.lineWidthMinPixels || 0.5
      },
      layout: { visibility: visible ? 'visible' : 'none' }
    });
  }
}

/**
 * Toggle visibility of hex layer
 */
export function setHexLayerVisibility(
  map: mapboxgl.Map,
  layerId: string,
  visible: boolean,
  isExtruded: boolean
): void {
  const layerIds = isExtruded
    ? [`${layerId}-extrusion`, `${layerId}-outline`]
    : [`${layerId}-fill`, `${layerId}-outline`];
  
  layerIds.forEach(id => {
    try {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      }
    } catch (e) {
      // Ignore errors
    }
  });
}

function removeStaticHexSublayers(map: mapboxgl.Map, layerId: string): void {
  const ids = [`${layerId}-fill`, `${layerId}-extrusion`, `${layerId}-outline`];
  for (const id of ids) {
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch (_) {}
  }
}

/**
 * Re-apply a static hex layer's structure + style (Mapbox GL).
 * This is used by the debug panel (filled/stroked/extruded toggles, color changes).
 */
export function updateStaticHexLayer(
  map: mapboxgl.Map,
  layer: HexLayerConfig,
  geojson: GeoJSON.FeatureCollection,
  visible: boolean
): void {
  // Ensure source exists and data is current
  try {
    const src: any = map.getSource(layer.id) as any;
    if (src && typeof src.setData === 'function') {
      src.setData(geojson);
    } else {
      map.addSource(layer.id, { type: 'geojson', data: geojson });
    }
  } catch (_) {
    // If addSource fails due to race, we still try to proceed with layer rebuild.
  }

  // Rebuild sublayers so structural toggles (extruded/filled/stroked) take effect
  removeStaticHexSublayers(map, layer.id);
  addStaticHexLayer(map, layer, geojson, visible);
}

