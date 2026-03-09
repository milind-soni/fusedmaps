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
      if (/^\d+$/.test(s)) {
        return BigInt(s).toString(16);
      }
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
      coords.push(coords[0]);
      
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
  const style = layer.style || {};
  const data = layer.data || [];
  
  try {
    const src: any = map.getSource(layer.id) as any;
    if (src && typeof src.setData === 'function') {
      src.setData(geojson);
    } else if (!src) {
      map.addSource(layer.id, { type: 'geojson', data: geojson, tolerance: 0 } as any);
    }
  } catch (_) {}
  
  const fillColor = Array.isArray(style.fillColor)
    ? toRgba(style.fillColor as number[], 0.8)
    : buildColorExpr(style.fillColor, data) || 'rgba(0,144,255,0.7)';
  
  const lineColor = style.lineColor
    ? (Array.isArray(style.lineColor)
        ? toRgba(style.lineColor as number[], 1)
        : buildColorExpr(style.lineColor, data))
    : 'rgba(255,255,255,0.3)';
  
  const layerOpacity = (typeof style.opacity === 'number' && isFinite(style.opacity))
    ? Math.max(0, Math.min(1, style.opacity))
    : 0.8;
  
  if (style.extruded) {
    const elevScale = style.elevationScale || 1;
    const elevProp =
      style.elevationAttr ||
      (style.fillColor && typeof style.fillColor === 'object' && !Array.isArray(style.fillColor)
        ? (style.fillColor as any).attr : null);
    map.addLayer({
      id: `${layer.id}-extrusion`,
      type: 'fill-extrusion',
      source: layer.id,
      paint: {
        'fill-extrusion-color': fillColor,
        'fill-extrusion-height': elevProp
          ? ['*', ['to-number', ['get', elevProp], 0], elevScale]
          : 100,
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': layerOpacity
      },
      layout: { visibility: visible ? 'visible' : 'none' }
    });
  } else {
    if (style.filled !== false) {
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
  
  if (style.stroked !== false) {
    map.addLayer({
      id: `${layer.id}-outline`,
      type: 'line',
      source: layer.id,
      paint: {
        'line-color': lineColor,
        'line-width': style.lineWidth || 0.5
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
    } catch (e) {}
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
 */
export function updateStaticHexLayer(
  map: mapboxgl.Map,
  layer: HexLayerConfig,
  geojson: GeoJSON.FeatureCollection,
  visible: boolean
): void {
  try {
    const src: any = map.getSource(layer.id) as any;
    if (src && typeof src.setData === 'function') {
      src.setData(geojson);
    } else {
      map.addSource(layer.id, { type: 'geojson', data: geojson, tolerance: 0 } as any);
    }
  } catch (_) {}

  removeStaticHexSublayers(map, layer.id);
  addStaticHexLayer(map, layer, geojson, visible);
}
