/**
 * Debug panel "apply UI -> layer config + map style updates"
 *
 * Extracted from `ui/debug.ts` to reduce file size and make behavior testable in isolation.
 * This module mutates the in-memory layer config objects (same as legacy behavior).
 */

import type { HexLayerConfig } from '../../types';
import { hexToGeoJSON, updateStaticHexLayer } from '../../layers/hex';
import { getLayerGeoJSONs } from '../../layers';
import { buildColorExpr } from '../../color/expressions';
import { buildPMTilesColorExpression } from '../../layers/pmtiles';
import { clamp, parseHexColor } from '../../utils';

function getCurrentLayerVisibility(map: mapboxgl.Map, layerId: string): boolean {
  try {
    const style: any = map.getStyle?.();
    const layers: any[] = style?.layers || [];
    const ids = [`${layerId}-fill`, `${layerId}-extrusion`, `${layerId}-outline`];
    for (const id of ids) {
      const l = layers.find((x: any) => x && x.id === id);
      if (!l) continue;
      return l.layout?.visibility !== 'none';
    }
  } catch {}
  return true;
}

function setPaintSafe(map: mapboxgl.Map, layerId: string, prop: string, value: any) {
  try {
    if (map.getLayer(layerId)) map.setPaintProperty(layerId, prop as any, value as any);
  } catch {}
}

function setPaintBatch(map: mapboxgl.Map, prefix: string, props: Record<string, any>) {
  try {
    const layers: any[] = (map.getStyle?.()?.layers || []) as any[];
    for (const l of layers) {
      const id = l?.id as string | undefined;
      if (id && id.startsWith(prefix) && map.getLayer(id)) {
        for (const [prop, value] of Object.entries(props)) {
          try { map.setPaintProperty(id, prop as any, value as any); } catch {}
        }
      }
    }
  } catch {}
}

export interface DebugApplyElements {
  filledEl: HTMLInputElement;
  strokedEl: HTMLInputElement;
  extrudedEl: HTMLInputElement;
  extrusionControls: HTMLElement;
  elevAttrEl: HTMLSelectElement;
  elevScaleEl: HTMLInputElement;
  opacityEl: HTMLInputElement;

  fillFnEl: HTMLSelectElement;
  fillAttrEl: HTMLSelectElement;
  fillPaletteEl: HTMLSelectElement;
  fillReverseEl: HTMLInputElement;
  fillDomainMinEl: HTMLInputElement;
  fillDomainMaxEl: HTMLInputElement;
  fillStepsEl: HTMLInputElement;
  fillNullEl: HTMLInputElement;
  fillStaticEl: HTMLInputElement;

  lineFnEl: HTMLSelectElement;
  lineAttrEl: HTMLSelectElement;
  linePaletteEl: HTMLSelectElement;
  lineReverseEl: HTMLInputElement;
  lineDomainMinEl: HTMLInputElement;
  lineDomainMaxEl: HTMLInputElement;
  lineStaticEl: HTMLInputElement;
  lineWidthEl: HTMLInputElement;
  pointRadiusEl: HTMLInputElement;
}

export interface ApplyDebugUIOpts {
  map: mapboxgl.Map;
  layer: any;
  els: DebugApplyElements;
  updateLayerOutput: () => void;
  findDeckOverlayOnMap: () => void;
  rebuildDeck: () => void;
}

export function applyDebugUIToLayer(opts: ApplyDebugUIOpts): void {
  const { map, layer, els, updateLayerOutput, findDeckOverlayOnMap, rebuildDeck } = opts;
  if (!layer) return;

  const isHex = layer.layerType === 'hex';
  const isVector = layer.layerType === 'vector';
  const isPmtiles = layer.layerType === 'pmtiles';

  if (isHex) {
    layer.hexLayer = layer.hexLayer || {};
  }
  const hexCfg: any = isHex ? layer.hexLayer : {};

  const op = parseFloat(els.opacityEl.value);
  const opClamped = Number.isFinite(op) ? clamp(op, 0, 1) : 1;

  if (isHex) {
    hexCfg.filled = !!els.filledEl.checked;
    hexCfg.stroked = !!els.strokedEl.checked;
    hexCfg.extruded = !!els.extrudedEl.checked;
    hexCfg.opacity = opClamped;

    // Extrusion controls (hex only)
    try {
      if (els.extrusionControls) els.extrusionControls.style.display = hexCfg.extruded ? 'block' : 'none';
      const s = parseFloat(els.elevScaleEl?.value || '1');
      hexCfg.elevationScale = Number.isFinite(s) ? s : 1;
      const ep = String(els.elevAttrEl?.value || '').trim();
      if (ep) hexCfg.elevationProperty = ep;
      else delete hexCfg.elevationProperty;
    } catch (_) {}
  } else if (isVector || isPmtiles) {
    layer.isFilled = !!els.filledEl.checked;
    layer.isStroked = !!els.strokedEl.checked;
    layer.opacity = opClamped;
    try {
      layer.vectorLayer = { ...(layer.vectorLayer || {}), filled: !!els.filledEl.checked, stroked: !!els.strokedEl.checked, opacity: opClamped };
    } catch (_) {}
  }

  // Fill
  if (isHex) {
    if (els.fillFnEl.value === 'static') {
      const c = els.fillStaticEl.value || '#0090ff';
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      hexCfg.getFillColor = [r, g, b];
    } else {
      const attr = els.fillAttrEl.value || 'data_avg';
      const colors = els.fillPaletteEl.value || 'Earth';
      const reverse = !!els.fillReverseEl.checked;
      const d0 = parseFloat(els.fillDomainMinEl.value);
      const d1 = parseFloat(els.fillDomainMaxEl.value);
      const steps = parseInt(els.fillStepsEl.value || '7', 10);
      const nc = els.fillNullEl.value || '#b8b8b8';
      const nr = parseInt(nc.slice(1, 3), 16);
      const ng = parseInt(nc.slice(3, 5), 16);
      const nb = parseInt(nc.slice(5, 7), 16);
      hexCfg.getFillColor = {
        '@@function': 'colorContinuous',
        attr,
        domain: [Number.isFinite(d0) ? d0 : 0, Number.isFinite(d1) ? d1 : 1],
        colors,
        reverse,
        steps: Number.isFinite(steps) ? steps : 7,
        nullColor: [nr, ng, nb],
        // Default to autoDomain unless user explicitly overrides the domain.
        autoDomain: (hexCfg.getFillColor?.autoDomain !== false)
      };
    }
  } else if (isVector || isPmtiles) {
    if (els.fillFnEl.value === 'static') {
      const c = els.fillStaticEl.value || '#0090ff';
      layer.fillColorConfig = null;
      layer.fillColorRgba = c;
      try {
        const arr = parseHexColor(c, 200) || parseHexColor(c);
        if (layer.vectorLayer) layer.vectorLayer.getFillColor = arr || c;
      } catch {}
    } else {
      const attr = els.fillAttrEl.value || 'value';
      const colors = els.fillPaletteEl.value || 'ArmyRose';
      const reverse = !!els.fillReverseEl.checked;
      const d0 = parseFloat(els.fillDomainMinEl.value);
      const d1 = parseFloat(els.fillDomainMaxEl.value);
      const steps = parseInt(els.fillStepsEl.value || '7', 10);
      const nc = els.fillNullEl.value || '#b8b8b8';
      const nr = parseInt(nc.slice(1, 3), 16);
      const ng = parseInt(nc.slice(3, 5), 16);
      const nb = parseInt(nc.slice(5, 7), 16);
      layer.fillColorRgba = null;
      const cfgObj = {
        '@@function': 'colorContinuous',
        attr,
        domain: [Number.isFinite(d0) ? d0 : 0, Number.isFinite(d1) ? d1 : 1],
        colors,
        reverse,
        steps: Number.isFinite(steps) ? steps : 7,
        nullColor: [nr, ng, nb],
      };
      layer.fillColorConfig = cfgObj;
      if (isPmtiles) layer.colorAttribute = attr;
      try {
        if (layer.vectorLayer) layer.vectorLayer.getFillColor = cfgObj;
      } catch (_) {}
    }
  }

  // Line
  if (isHex) {
    if (els.lineFnEl.value === 'static') {
      const c = els.lineStaticEl.value || '#ffffff';
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      hexCfg.getLineColor = [r, g, b];
    } else {
      const attr = els.lineAttrEl.value || 'data_avg';
      const colors = els.linePaletteEl.value || 'Earth';
      const reverse = !!els.lineReverseEl.checked;
      const d0 = parseFloat(els.lineDomainMinEl.value);
      const d1 = parseFloat(els.lineDomainMaxEl.value);
      hexCfg.getLineColor = {
        '@@function': 'colorContinuous',
        attr,
        domain: [Number.isFinite(d0) ? d0 : 0, Number.isFinite(d1) ? d1 : 1],
        colors,
        reverse,
        steps: parseInt(els.fillStepsEl.value || '7', 10) || 7,
        autoDomain: (hexCfg.getLineColor?.autoDomain !== false)
      };
    }
  } else if (isVector || isPmtiles) {
    if (els.lineFnEl.value === 'static') {
      const c = els.lineStaticEl.value || '#ffffff';
      layer.lineColorConfig = null;
      layer.lineColorRgba = c;
      try {
        const arr = parseHexColor(c, 255) || parseHexColor(c);
        if (layer.vectorLayer) layer.vectorLayer.getLineColor = arr || c;
      } catch {}
    } else {
      const attr = els.lineAttrEl.value || 'value';
      const colors = els.linePaletteEl.value || 'ArmyRose';
      const reverse = !!els.lineReverseEl.checked;
      const d0 = parseFloat(els.lineDomainMinEl.value);
      const d1 = parseFloat(els.lineDomainMaxEl.value);
      layer.lineColorRgba = null;
      const cfgObj = {
        '@@function': 'colorContinuous',
        attr,
        domain: [Number.isFinite(d0) ? d0 : 0, Number.isFinite(d1) ? d1 : 1],
        colors,
        reverse,
        steps: parseInt(els.fillStepsEl.value || '7', 10) || 7,
      };
      layer.lineColorConfig = cfgObj;
      try {
        if (layer.vectorLayer) layer.vectorLayer.getLineColor = cfgObj;
      } catch (_) {}
    }
  }

  const lw = parseFloat(els.lineWidthEl.value);
  const lwClamped = Number.isFinite(lw) ? clamp(lw, 0, 10) : 1;
  if (isHex) {
    hexCfg.lineWidthMinPixels = lwClamped;
  } else if (isVector || isPmtiles) {
    layer.lineWidth = lwClamped;
    const pr = parseFloat(els.pointRadiusEl?.value || '6');
    const prClamped = Number.isFinite(pr) ? clamp(pr, 1, 100) : 6;
    layer.pointRadius = prClamped;
    try {
      if (layer.vectorLayer) {
        layer.vectorLayer.lineWidthMinPixels = lwClamped;
        layer.vectorLayer.pointRadiusMinPixels = prClamped;
      }
    } catch (_) {}
  }

  updateLayerOutput();
  findDeckOverlayOnMap();
  rebuildDeck();

  // Non-tile hex layers are Mapbox GL layers, not Deck.gl. Rebuild them so UI edits apply.
  try {
    const isStaticHex = layer.layerType === 'hex' && !layer.isTileLayer;
    if (isStaticHex) {
      const isSql = !!layer.parquetData || !!layer.parquetUrl;
      const g = isSql
        ? (getLayerGeoJSONs()?.[layer.id] || ({ type: 'FeatureCollection', features: [] } as any))
        : hexToGeoJSON(layer.data || []);
      const visible = getCurrentLayerVisibility(map, layer.id);
      updateStaticHexLayer(map, layer as HexLayerConfig, g, visible);
    }
  } catch (_) {}

  // Vector layers are Mapbox GL layers. Update paint properties directly so edits apply instantly.
  try {
    if (isVector) {
      const v: any = layer;
      const vecData = v.geojson?.features?.map((f: any) => f?.properties || {}) || [];
      const fillExpr = (v.fillColorConfig as any)?.['@@function']
        ? buildColorExpr(v.fillColorConfig, vecData) : (v.fillColorRgba || '#0090ff');
      const lineExpr = (v.lineColorConfig as any)?.['@@function']
        ? buildColorExpr(v.lineColorConfig, vecData) : (v.lineColorRgba || '#ffffff');
      const fillOpacity = (v.isFilled === false) ? 0 : opClamped;
      const lineOpacity = (v.isStroked === false) ? 0 : 1;

      setPaintBatch(map, `${v.id}-`, {
        'fill-color': fillExpr, 'fill-opacity': fillOpacity,
        'line-color': lineExpr, 'line-width': lwClamped, 'line-opacity': lineOpacity,
      });
      const pr = parseFloat(els.pointRadiusEl?.value || '6');
      const prVal = Number.isFinite(pr) ? clamp(pr, 1, 100) : 6;
      setPaintSafe(map, `${v.id}-circle`, 'circle-radius', prVal);
      setPaintSafe(map, `${v.id}-circle`, 'circle-color', fillExpr);
      setPaintSafe(map, `${v.id}-circle`, 'circle-opacity', fillOpacity);
      setPaintSafe(map, `${v.id}-circle`, 'circle-stroke-color', lineExpr);
      setPaintSafe(map, `${v.id}-circle`, 'circle-stroke-width', lwClamped);
    }
  } catch {}

  // PMTiles layers use Mapbox GL vector layers. Build color expressions and update paint.
  try {
    if (isPmtiles) {
      const v: any = layer;
      const fillOpacity = (v.isFilled === false) ? 0 : opClamped;
      const lineOpacity = (v.isStroked === false) ? 0 : 1;
      const attr = v.colorAttribute || 'value';
      const fillExpr = v.fillColorConfig
        ? buildPMTilesColorExpression(v.fillColorConfig, attr, '#ff8c00') : (v.fillColorRgba || '#ff8c00');
      const lineExpr = v.lineColorConfig
        ? buildPMTilesColorExpression(v.lineColorConfig, attr, '#ffffff') : (v.lineColorRgba || '#ffffff');
      const lw = (v.isStroked === false) ? 0 : lwClamped;

      setPaintBatch(map, `${v.id}-`, {
        'fill-color': fillExpr, 'fill-opacity': fillOpacity,
        'line-color': lineExpr, 'line-width': lw, 'line-opacity': lineOpacity,
        'circle-color': fillExpr, 'circle-opacity': fillOpacity,
        'circle-stroke-color': lineExpr, 'circle-stroke-width': lw,
      });
    }
  } catch (e) {
    console.warn('[FusedMaps] PMTiles update error:', e);
  }
}


