import type { FusedMapsConfig, HexLayerConfig, LayerConfig } from '../types';
import { DuckDbSqlRuntime, rowsToHexGeoJSON } from './duckdb';
import { addStaticHexLayer } from '../layers/hex';
import { setLayerGeoJSON } from '../layers/index';
import { buildColorExpr } from '../color/expressions';
import { toRgba } from '../color/palettes';
import type { FeatureCollection } from 'geojson';

function isSqlHexLayer(l: LayerConfig): l is HexLayerConfig {
  return l.layerType === 'hex' && !(l as any).isTileLayer && (!!(l as any).parquetData || !!(l as any).parquetUrl);
}

function safeSetGeoJsonSource(map: mapboxgl.Map, sourceId: string, geojson: FeatureCollection): boolean {
  try {
    const src: any = map.getSource(sourceId) as any;
    if (src && typeof src.setData === 'function') {
      src.setData(geojson);
      return true;
    }
  } catch (_) {}
  return false;
}

function updateHexPaint(map: mapboxgl.Map, layer: HexLayerConfig): void {
  const cfg: any = layer.hexLayer || {};
  const data = layer.data || [];

  const fillColor = Array.isArray(cfg.getFillColor)
    ? toRgba(cfg.getFillColor, 0.8)
    : buildColorExpr(cfg.getFillColor, data) || 'rgba(0,144,255,0.7)';

  const lineColor = cfg.getLineColor
    ? (Array.isArray(cfg.getLineColor) ? toRgba(cfg.getLineColor, 1) : buildColorExpr(cfg.getLineColor, data))
    : 'rgba(255,255,255,0.3)';

  const layerOpacity = (typeof cfg.opacity === 'number' && isFinite(cfg.opacity))
    ? Math.max(0, Math.min(1, cfg.opacity))
    : 0.8;

  try {
    if (cfg.extruded && map.getLayer(`${layer.id}-extrusion`)) {
      map.setPaintProperty(`${layer.id}-extrusion`, 'fill-extrusion-color', fillColor as any);
      map.setPaintProperty(`${layer.id}-extrusion`, 'fill-extrusion-opacity', layerOpacity as any);
    }
  } catch (_) {}

  try {
    if (!cfg.extruded && map.getLayer(`${layer.id}-fill`)) {
      map.setPaintProperty(`${layer.id}-fill`, 'fill-color', fillColor as any);
      map.setPaintProperty(`${layer.id}-fill`, 'fill-opacity', layerOpacity as any);
    }
  } catch (_) {}

  try {
    if (map.getLayer(`${layer.id}-outline`)) {
      map.setPaintProperty(`${layer.id}-outline`, 'line-color', lineColor as any);
      map.setPaintProperty(`${layer.id}-outline`, 'line-width', (cfg.lineWidthMinPixels || 0.5) as any);
    }
  } catch (_) {}
}

function dispatchSqlStatus(layerId: string, status: string): void {
  try {
    window.dispatchEvent(new CustomEvent('fusedmaps:sql:status', { detail: { layerId, status } }));
  } catch (_) {}
}

function dispatchLegendUpdate(): void {
  try { window.dispatchEvent(new Event('fusedmaps:legend:update')); } catch (_) {}
}

export function setupDuckDbSql(
  map: mapboxgl.Map,
  config: FusedMapsConfig,
  visibilityState: Record<string, boolean>,
  onUiUpdate?: () => void
): { destroy: () => void } | null {
  const sqlLayers = (config.layers || []).filter(isSqlHexLayer);
  if (!sqlLayers.length) return null;

  const runtime = new DuckDbSqlRuntime();
  let destroyed = false;

  const runForLayer = async (layer: HexLayerConfig, sqlText: string) => {
    if (destroyed) return;
    dispatchSqlStatus(layer.id, 'initializing...');
    try {
      await runtime.init();
      if (destroyed) return;

      // If autoDomain is enabled and user has not overridden, initialize domain to dataset extent (full table)
      try {
        const fc: any = layer.hexLayer?.getFillColor;
        const attr = fc && typeof fc === 'object' && !Array.isArray(fc) ? fc.attr : null;
        const wantsAuto = fc && typeof fc === 'object' && !Array.isArray(fc) && (fc.autoDomain === true || !Array.isArray(fc.domain));
        if (attr && wantsAuto && (layer as any).fillDomainFromUser !== true) {
          const mm = await runtime.getMinMax(layer, String(attr));
          if (mm && layer.hexLayer && typeof layer.hexLayer.getFillColor === 'object' && !Array.isArray(layer.hexLayer.getFillColor)) {
            (layer.hexLayer.getFillColor as any).domain = [mm.min, mm.max];
          }
        }
      } catch (_) {}

      dispatchSqlStatus(layer.id, 'running...');
      const { rows, count } = await runtime.runSql(layer, sqlText || layer.sql || 'SELECT * FROM data');
      if (destroyed) return;

      layer.data = rows;
      // Keep the layer's config in sync so debug panel + downstream consumers see it.
      layer.sql = sqlText || layer.sql || 'SELECT * FROM data';

      const geojson = rowsToHexGeoJSON(rows);
      setLayerGeoJSON(layer.id, geojson);

      const visible = visibilityState[layer.id] !== false;
      // If the source exists, update in-place; otherwise add the layer once.
      const updated = safeSetGeoJsonSource(map, layer.id, geojson);
      if (!updated) {
        try { addStaticHexLayer(map, layer, geojson, visible); } catch (_) {}
      }
      // Always refresh paint expressions after data/domain changes.
      updateHexPaint(map, layer);

      dispatchSqlStatus(layer.id, `${count.toLocaleString()} rows`);
      dispatchLegendUpdate();
      try { onUiUpdate?.(); } catch (_) {}
    } catch (e: any) {
      dispatchSqlStatus(layer.id, `error: ${(e?.message || 'query failed').slice(0, 60)}`);
    }
  };

  // Initial run for all sql layers (non-blocking)
  (async () => {
    for (const l of sqlLayers) {
      if (destroyed) break;
      // Only run automatically if the layer provides a sql string (otherwise wait for debug input)
      const sql = (l.sql || 'SELECT * FROM data').trim();
      await runForLayer(l, sql);
    }
  })();

  const onSqlUpdate = (evt: any) => {
    const detail = evt?.detail || {};
    const layerId = String(detail.layerId || '');
    const sql = String(detail.sql || '');
    const layer = sqlLayers.find((l) => l.id === layerId);
    if (!layer) return;
    void runForLayer(layer, sql);
  };

  try { window.addEventListener('fusedmaps:sql:update', onSqlUpdate as any); } catch (_) {}

  return {
    destroy: () => {
      destroyed = true;
      try { window.removeEventListener('fusedmaps:sql:update', onSqlUpdate as any); } catch (_) {}
    }
  };
}


