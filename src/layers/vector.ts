/**
 * Vector layer rendering (GeoJSON and MVT)
 */

import type { VectorLayerConfig, MVTLayerConfig } from '../types';
import { buildColorExpr } from '../color/expressions';
import { toRgba } from '../color/palettes';
import { registerOriginalGeoJSON } from '../interactions/highlight';

/**
 * Add a GeoJSON vector layer to the map
 */
export function addVectorLayer(
  map: mapboxgl.Map,
  layer: VectorLayerConfig,
  visible: boolean
): void {
  const geojson = layer.geojson;
  if (!geojson?.features?.length) return;
  
  // Add source
  const src: any = { type: 'geojson', data: geojson };
  // Optional: control geojson-vt tiling/simplification.
  // For very small polygons (e.g., H3 res11), default tolerance can simplify them away at low zoom.
  const opts = (layer as any).geojsonSource;
  if (opts && typeof opts === 'object') {
    if (typeof opts.tolerance === 'number') src.tolerance = opts.tolerance;
    if (typeof opts.buffer === 'number') src.buffer = opts.buffer;
    if (typeof opts.maxzoom === 'number') src.maxzoom = opts.maxzoom;
  }
  map.addSource(layer.id, src);

  // Register original GeoJSON for highlight lookup (avoids tile-clipped geometries)
  registerOriginalGeoJSON(layer.id, geojson);
  
  // Extract layer properties
  const vecData = geojson.features.map((f: any) => f.properties || {});
  
  // Build color expressions
  const fillColorExpr = (layer.fillColorConfig as any)?.['@@function']
    ? buildColorExpr(layer.fillColorConfig, vecData)
    : (layer.fillColorRgba || 'rgba(0,144,255,0.6)');
  
  const lineColorExpr = (layer.lineColorConfig as any)?.['@@function']
    ? buildColorExpr(layer.lineColorConfig, vecData)
    : (layer.lineColorRgba || 'rgba(100,100,100,0.8)');
  
  const lineW = (typeof layer.lineWidth === 'number' && isFinite(layer.lineWidth))
    ? layer.lineWidth
    : 1;
  
  const layerOpacity = (typeof layer.opacity === 'number' && isFinite(layer.opacity))
    ? Math.max(0, Math.min(1, layer.opacity))
    : 0.8;
  
  // Detect geometry types
  let hasPoly = false, hasPoint = false, hasLine = false;
  for (const f of geojson.features) {
    const t = f.geometry?.type;
    if (t === 'Point' || t === 'MultiPoint') hasPoint = true;
    if (t === 'Polygon' || t === 'MultiPolygon') hasPoly = true;
    if (t === 'LineString' || t === 'MultiLineString') hasLine = true;
  }
  
  // Add polygon layers
  if (hasPoly) {
    // Always create fill layer so it can be toggled from debug panel
    // Use opacity 0 when not filled
    const fillOpacity = layer.isFilled === false ? 0 : layerOpacity;
    map.addLayer({
      id: `${layer.id}-fill`,
      type: 'fill',
      source: layer.id,
      paint: {
        'fill-color': fillColorExpr as any,
        'fill-opacity': fillOpacity
      },
      filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
      layout: { visibility: visible ? 'visible' : 'none' }
    });

    if (layer.isStroked !== false) {
      map.addLayer({
        id: `${layer.id}-outline`,
        type: 'line',
        source: layer.id,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
          visibility: visible ? 'visible' : 'none'
        },
        paint: {
          'line-color': lineColorExpr as any,
          'line-width': lineW
        },
        filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']]
      });
    }
  }
  
  // Add line layers
  if (hasLine) {
    map.addLayer({
      id: `${layer.id}-line`,
      type: 'line',
      source: layer.id,
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
        visibility: visible ? 'visible' : 'none'
      },
      paint: {
        'line-color': lineColorExpr as any,
        'line-width': lineW,
        'line-opacity': 1
      },
      filter: ['any', ['==', ['geometry-type'], 'LineString'], ['==', ['geometry-type'], 'MultiLineString']]
    });
  }
  
  // Add point layers
  if (hasPoint) {
    map.addLayer({
      id: `${layer.id}-circle`,
      type: 'circle',
      source: layer.id,
      paint: {
        'circle-radius': layer.pointRadius || 6,
        'circle-color': fillColorExpr as any,
        'circle-stroke-color': 'rgba(0,0,0,0.5)',
        'circle-stroke-width': 1,
        'circle-opacity': 0.9
      },
      filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
      layout: { visibility: visible ? 'visible' : 'none' }
    });
  }
}

/**
 * Add an MVT vector tile layer to the map
 */
export function addMVTLayer(
  map: mapboxgl.Map,
  layer: MVTLayerConfig,
  visible: boolean
): void {
  const sourceLayer = layer.sourceLayer || 'udf';
  
  // Add vector tile source
  map.addSource(layer.id, {
    type: 'vector',
    tiles: [layer.tileUrl],
    minzoom: layer.minzoom || 0,
    maxzoom: layer.maxzoom || 22
  });
  
  // Dynamic color expressions are supported for MVT since Mapbox evaluates them per-feature.
  const fillColorExpr = (layer.fillColorConfig as any)?.['@@function']
    ? (buildColorExpr(layer.fillColorConfig as any, undefined) as any)
    : (layer.fillColor || '#FFF5CC');
  const lineColorExpr = (layer.lineColorConfig as any)?.['@@function']
    ? (buildColorExpr(layer.lineColorConfig as any, undefined) as any)
    : (layer.lineColor || '#FFFFFF');

  const fillOpacity = layer.fillOpacity ?? 0.8;
  const lineWidth = layer.lineWidth ?? 1;
  
  // Fill layer
  if (layer.isFilled !== false) {
    map.addLayer({
      id: `${layer.id}-fill`,
      type: 'fill',
      source: layer.id,
      'source-layer': sourceLayer,
      paint: {
        'fill-color': fillColorExpr as any,
        'fill-opacity': fillOpacity
      },
      layout: { visibility: visible ? 'visible' : 'none' }
    });
  }
  
  // Line layer
  map.addLayer({
    id: `${layer.id}-line`,
    type: 'line',
    source: layer.id,
    'source-layer': sourceLayer,
    paint: {
      'line-color': lineColorExpr as any,
      'line-width': lineWidth
    },
    layout: { visibility: visible ? 'visible' : 'none' }
  });
  
  // Extrusion layer (if enabled)
  if (layer.isExtruded) {
    map.addLayer({
      id: `${layer.id}-extrusion`,
      type: 'fill-extrusion',
      source: layer.id,
      'source-layer': sourceLayer,
      paint: {
        'fill-extrusion-color': fillColorExpr as any,
        'fill-extrusion-height': ['*', ['get', layer.heightProperty || 'height'], layer.heightMultiplier || 1],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': layer.extrusionOpacity ?? 0.9
      },
      layout: { visibility: visible ? 'visible' : 'none' }
    });
  }
}

/**
 * Toggle visibility of vector layer
 */
export function setVectorLayerVisibility(
  map: mapboxgl.Map,
  layerId: string,
  visible: boolean
): void {
  const layerIds = [
    `${layerId}-fill`,
    `${layerId}-outline`,
    `${layerId}-line`,
    `${layerId}-circle`,
    `${layerId}-extrusion`
  ];
  
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




