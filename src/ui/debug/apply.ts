/**
 * Debug panel "apply UI -> layer config + map style updates"
 *
 * Writes to `layer.style.*` in the clean config format (no legacy properties).
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

  layer.style = layer.style || {};
  const style: any = layer.style;

  const op = parseFloat(els.opacityEl.value);
  const opClamped = Number.isFinite(op) ? clamp(op, 0, 1) : 1;

  style.filled = !!els.filledEl.checked;
  style.stroked = !!els.strokedEl.checked;
  style.opacity = opClamped;

  if (isHex) {
    style.extruded = !!els.extrudedEl.checked;
    try {
      if (els.extrusionControls) els.extrusionControls.style.display = style.extruded ? 'block' : 'none';
      const s = parseFloat(els.elevScaleEl?.value || '1');
      style.elevationScale = Number.isFinite(s) ? s : 1;
      const ep = String(els.elevAttrEl?.value || '').trim();
      if (ep) style.elevationAttr = ep;
      else delete style.elevationAttr;
    } catch (_) {}
  }

  // Fill color
  if (els.fillFnEl.value === 'static') {
    const c = els.fillStaticEl.value || '#0090ff';
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    style.fillColor = [r, g, b];
  } else if (els.fillFnEl.value !== 'expression') {
    const attr = els.fillAttrEl.value || (isHex ? 'data_avg' : 'value');
    const palette = els.fillPaletteEl.value || 'Earth';
    const reverse = !!els.fillReverseEl.checked;
    const d0 = parseFloat(els.fillDomainMinEl.value);
    const d1 = parseFloat(els.fillDomainMaxEl.value);
    const steps = parseInt(els.fillStepsEl.value || '7', 10);
    const nc = els.fillNullEl.value || '#b8b8b8';
    const nr = parseInt(nc.slice(1, 3), 16);
    const ng = parseInt(nc.slice(3, 5), 16);
    const nb = parseInt(nc.slice(5, 7), 16);
    const prevFc = style.fillColor;
    const hadAutoDomain = (prevFc && typeof prevFc === 'object' && !Array.isArray(prevFc))
      ? (prevFc.autoDomain !== false) : true;
    style.fillColor = {
      type: 'continuous',
      attr,
      domain: [Number.isFinite(d0) ? d0 : 0, Number.isFinite(d1) ? d1 : 1],
      palette,
      reverse,
      steps: Number.isFinite(steps) ? steps : 7,
      nullColor: [nr, ng, nb],
      autoDomain: hadAutoDomain,
    };
  }

  // Line color
  if (els.lineFnEl.value === 'static') {
    const c = els.lineStaticEl.value || '#ffffff';
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    style.lineColor = [r, g, b];
  } else if (els.lineFnEl.value !== 'expression') {
    const attr = els.lineAttrEl.value || (isHex ? 'data_avg' : 'value');
    const palette = els.linePaletteEl.value || 'Earth';
    const reverse = !!els.lineReverseEl.checked;
    const d0 = parseFloat(els.lineDomainMinEl.value);
    const d1 = parseFloat(els.lineDomainMaxEl.value);
    const prevLc = style.lineColor;
    const hadAutoDomain = (prevLc && typeof prevLc === 'object' && !Array.isArray(prevLc))
      ? (prevLc.autoDomain !== false) : true;
    style.lineColor = {
      type: 'continuous',
      attr,
      domain: [Number.isFinite(d0) ? d0 : 0, Number.isFinite(d1) ? d1 : 1],
      palette,
      reverse,
      steps: parseInt(els.fillStepsEl.value || '7', 10) || 7,
      autoDomain: hadAutoDomain,
    };
  }

  // Line width & point radius
  const lw = parseFloat(els.lineWidthEl.value);
  const lwClamped = Number.isFinite(lw) ? clamp(lw, 0, 10) : 1;
  style.lineWidth = lwClamped;

  if (isVector || isPmtiles) {
    const pr = parseFloat(els.pointRadiusEl?.value || '6');
    style.pointRadius = Number.isFinite(pr) ? clamp(pr, 1, 100) : 6;
  }

  updateLayerOutput();
  findDeckOverlayOnMap();
  rebuildDeck();

  // Non-tile hex layers use Mapbox GL layers; rebuild so edits apply
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

  // Vector layers - update Mapbox GL paint properties directly
  try {
    if (isVector) {
      const vecData = layer.geojson?.features?.map((f: any) => f?.properties || {}) || [];
      const fc = style.fillColor;
      const lc = style.lineColor;
      const fillExpr = (fc && typeof fc === 'object' && !Array.isArray(fc) && (fc.type || fc['@@function']))
        ? buildColorExpr(fc, vecData) : (Array.isArray(fc) ? `rgb(${fc[0]},${fc[1]},${fc[2]})` : (fc || '#0090ff'));
      const lineExpr = (lc && typeof lc === 'object' && !Array.isArray(lc) && (lc.type || lc['@@function']))
        ? buildColorExpr(lc, vecData) : (Array.isArray(lc) ? `rgb(${lc[0]},${lc[1]},${lc[2]})` : (lc || '#ffffff'));
      const fillOpacity = (style.filled === false) ? 0 : opClamped;
      const lineOpacity = (style.stroked === false) ? 0 : 1;

      setPaintBatch(map, `${layer.id}-`, {
        'fill-color': fillExpr, 'fill-opacity': fillOpacity,
        'line-color': lineExpr, 'line-width': lwClamped, 'line-opacity': lineOpacity,
      });
      const prVal = style.pointRadius ?? 6;
      setPaintSafe(map, `${layer.id}-circle`, 'circle-radius', prVal);
      setPaintSafe(map, `${layer.id}-circle`, 'circle-color', fillExpr);
      setPaintSafe(map, `${layer.id}-circle`, 'circle-opacity', fillOpacity);
      setPaintSafe(map, `${layer.id}-circle`, 'circle-stroke-color', lineExpr);
      setPaintSafe(map, `${layer.id}-circle`, 'circle-stroke-width', lwClamped);
    }
  } catch {}

  // PMTiles layers - update Mapbox GL paint properties
  try {
    if (isPmtiles) {
      const fc = style.fillColor;
      const lc = style.lineColor;
      const fillOpacity = (style.filled === false) ? 0 : opClamped;
      const lineOpacity = (style.stroked === false) ? 0 : 1;
      const attr = (fc && typeof fc === 'object' && !Array.isArray(fc)) ? (fc.attr || 'value') : 'value';
      const fillExpr = (fc && typeof fc === 'object' && !Array.isArray(fc) && (fc.type || fc['@@function']))
        ? buildPMTilesColorExpression(fc, attr, '#ff8c00') : (Array.isArray(fc) ? `rgb(${fc[0]},${fc[1]},${fc[2]})` : (fc || '#ff8c00'));
      const lineExpr = (lc && typeof lc === 'object' && !Array.isArray(lc) && (lc.type || lc['@@function']))
        ? buildPMTilesColorExpression(lc, attr, '#ffffff') : (Array.isArray(lc) ? `rgb(${lc[0]},${lc[1]},${lc[2]})` : (lc || '#ffffff'));
      const effectiveLw = (style.stroked === false) ? 0 : lwClamped;

      setPaintBatch(map, `${layer.id}-`, {
        'fill-color': fillExpr, 'fill-opacity': fillOpacity,
        'line-color': lineExpr, 'line-width': effectiveLw, 'line-opacity': lineOpacity,
        'circle-color': fillExpr, 'circle-opacity': fillOpacity,
        'circle-stroke-color': lineExpr, 'circle-stroke-width': effectiveLw,
      });
    }
  } catch (e) {
    console.warn('[FusedMaps] PMTiles update error:', e);
  }
}
