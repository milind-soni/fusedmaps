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
  
  const src: any = { type: 'geojson', data: geojson };
  const opts = layer.source;
  if (opts && typeof opts === 'object') {
    if (typeof opts.tolerance === 'number') src.tolerance = opts.tolerance;
    if (typeof opts.buffer === 'number') src.buffer = opts.buffer;
    if (typeof opts.maxzoom === 'number') src.maxzoom = opts.maxzoom;
  }
  map.addSource(layer.id, src);

  registerOriginalGeoJSON(layer.id, geojson);
  
  const style = layer.style || {};
  const vecData = geojson.features.map((f: any) => f.properties || {});
  
  const fillColorExpr = (style.fillColor && typeof style.fillColor === 'object' && !Array.isArray(style.fillColor))
    ? buildColorExpr(style.fillColor, vecData)
    : (style.fillColor
        ? (Array.isArray(style.fillColor) ? toRgba(style.fillColor as number[], 0.6) : (style.fillColor as string))
        : 'rgba(0,144,255,0.6)');
  
  const lineColorExpr = (style.lineColor && typeof style.lineColor === 'object' && !Array.isArray(style.lineColor))
    ? buildColorExpr(style.lineColor, vecData)
    : (style.lineColor
        ? (Array.isArray(style.lineColor) ? toRgba(style.lineColor as number[], 0.8) : (style.lineColor as string))
        : 'rgba(100,100,100,0.8)');
  
  const lineW = (typeof style.lineWidth === 'number' && isFinite(style.lineWidth))
    ? style.lineWidth : 1;
  
  const layerOpacity = (typeof style.opacity === 'number' && isFinite(style.opacity))
    ? Math.max(0, Math.min(1, style.opacity)) : 0.8;
  
  let hasPoly = false, hasPoint = false, hasLine = false;
  for (const f of geojson.features) {
    const t = f.geometry?.type;
    if (t === 'Point' || t === 'MultiPoint') hasPoint = true;
    if (t === 'Polygon' || t === 'MultiPolygon') hasPoly = true;
    if (t === 'LineString' || t === 'MultiLineString') hasLine = true;
  }
  
  if (hasPoly) {
    const fillOpacity = style.filled === false ? 0 : layerOpacity;
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

    if (style.stroked !== false) {
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
  
  if (hasPoint) {
    map.addLayer({
      id: `${layer.id}-circle`,
      type: 'circle',
      source: layer.id,
      paint: {
        'circle-radius': Math.max(style.pointRadius || 6, 1),
        'circle-color': fillColorExpr as any,
        'circle-stroke-color': lineColorExpr as any,
        'circle-stroke-width': style.stroked !== false ? lineW : 0,
        'circle-opacity': layerOpacity
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
  const style = layer.style || {};
  const tile = layer.tile || {};
  
  map.addSource(layer.id, {
    type: 'vector',
    tiles: [layer.tileUrl],
    minzoom: tile.minZoom || 0,
    maxzoom: tile.maxZoom || 22
  });
  
  const fillColorExpr = (style.fillColor && typeof style.fillColor === 'object' && !Array.isArray(style.fillColor))
    ? (buildColorExpr(style.fillColor as any, undefined) as any)
    : (style.fillColor
        ? (Array.isArray(style.fillColor) ? toRgba(style.fillColor as number[], 0.8) : (style.fillColor as string))
        : '#FFF5CC');
  const lineColorExpr = (style.lineColor && typeof style.lineColor === 'object' && !Array.isArray(style.lineColor))
    ? (buildColorExpr(style.lineColor as any, undefined) as any)
    : (style.lineColor
        ? (Array.isArray(style.lineColor) ? toRgba(style.lineColor as number[], 1) : (style.lineColor as string))
        : '#FFFFFF');

  const fillOpacity = style.opacity ?? 0.8;
  const lineWidth = style.lineWidth ?? 1;
  
  if (style.filled !== false) {
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
  
  const pointRadius = Math.max(style.pointRadius || style.pointRadiusMinPixels || 5, 1);
  map.addLayer({
    id: `${layer.id}-circle`,
    type: 'circle',
    source: layer.id,
    'source-layer': sourceLayer,
    paint: {
      'circle-radius': pointRadius,
      'circle-color': fillColorExpr as any,
      'circle-stroke-color': lineColorExpr as any,
      'circle-stroke-width': style.stroked !== false ? lineWidth : 0,
      'circle-opacity': fillOpacity
    },
    layout: { visibility: visible ? 'visible' : 'none' }
  });

  if (style.extruded) {
    map.addLayer({
      id: `${layer.id}-extrusion`,
      type: 'fill-extrusion',
      source: layer.id,
      'source-layer': sourceLayer,
      paint: {
        'fill-extrusion-color': fillColorExpr as any,
        'fill-extrusion-height': ['*', ['get', style.elevationAttr || 'height'], style.elevationScale || 1],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.9
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
    } catch (e) {}
  });
}
