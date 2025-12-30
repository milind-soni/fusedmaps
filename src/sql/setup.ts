import type { FusedMapsConfig, HexLayerConfig, LayerConfig } from '../types';
import { DuckDbSqlRuntime } from './duckdb';
import { addStaticHexLayer } from '../layers/hex';
import { setLayerGeoJSON } from '../layers/index';
import { buildColorExpr } from '../color/expressions';
import { toRgba } from '../color/palettes';
import type { FeatureCollection } from 'geojson';

let sqlLoader: { setStatus: (layerId: string, status: string) => void } | null = null;
let sqlLayerNames: Record<string, string> = {};

function isSqlHexLayer(l: LayerConfig): l is HexLayerConfig {
  return l.layerType === 'hex' && !(l as any).isTileLayer && (!!(l as any).parquetData || !!(l as any).parquetUrl);
}

function ensureSqlLoader(): { setStatus: (layerId: string, status: string) => void } {
  let el = document.getElementById('sql-loader');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sql-loader';
    el.innerHTML = `<div class="loader-spinner"></div><span id="sql-loader-text">DuckDB…</span>`;
    document.body.appendChild(el);
  }

  const textEl = document.getElementById('sql-loader-text');
  let hideTimeout: any = null;
  const statusByLayer = new Map<string, string>();

  const isBusy = (s: string) => {
    const t = (s || '').toLowerCase();
    if (!t) return false;
    if (t.startsWith('error:')) return false;
    if (t.includes(' rows')) return false;
    return t.includes('initializ') || t.includes('running') || t.includes('loading') || t.includes('fetch');
  };

  const refresh = () => {
    if (!el) return;
    const busy = [...statusByLayer.entries()].filter(([, s]) => isBusy(s));
    if (busy.length) {
      if (hideTimeout) clearTimeout(hideTimeout);
      el.classList.add('active');

      const [layerId, st] = busy[0];
      const name = sqlLayerNames[layerId] || layerId;
      const label = busy.length > 1 ? `DuckDB: ${st} (${busy.length} layers)` : `DuckDB: ${st} (${name})`;
      if (textEl) textEl.textContent = label;
      return;
    }

    // If there are no busy layers, show the most recent error briefly (if any).
    const errors = [...statusByLayer.entries()].filter(([, s]) => String(s || '').toLowerCase().startsWith('error:'));
    if (errors.length) {
      const [layerId, st] = errors[0];
      const name = sqlLayerNames[layerId] || layerId;
      if (hideTimeout) clearTimeout(hideTimeout);
      el.classList.add('active');
      if (textEl) textEl.textContent = `DuckDB: ${st} (${name})`;
      hideTimeout = setTimeout(() => el?.classList.remove('active'), 1800);
      return;
    }

    hideTimeout = setTimeout(() => el?.classList.remove('active'), 300);
  };

  const setStatus = (layerId: string, status: string) => {
    statusByLayer.set(layerId, String(status || ''));
    refresh();
  };

  return { setStatus };
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
  try {
    if (!sqlLoader) sqlLoader = ensureSqlLoader();
    sqlLoader?.setStatus(layerId, status);
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

  // For the global DuckDB loader label.
  try {
    sqlLayerNames = {};
    for (const l of sqlLayers) sqlLayerNames[l.id] = l.name || l.id;
  } catch (_) {}
  try {
    if (!sqlLoader) sqlLoader = ensureSqlLoader();
  } catch (_) {}

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

      // Keep the layer's config in sync so debug panel + downstream consumers see it.
      layer.sql = sqlText || layer.sql || 'SELECT * FROM data';

      // Live domain/legend stats: compute min/max in DuckDB on the filtered query
      // (avoids an O(N) JS scan + handles numeric types consistently).
      try {
        const sqlForStats = layer.sql || 'SELECT * FROM data';
        const domainFromUser = (layer as any).fillDomainFromUser === true;

        const fc: any = layer.hexLayer?.getFillColor;
        if (!domainFromUser && fc && typeof fc === 'object' && !Array.isArray(fc) && fc['@@function'] === 'colorContinuous') {
          const attr = String(fc.attr || '');
          if (attr && fc.autoDomain === true) {
            const mm = await runtime.getMinMaxFromQuery(layer, attr, sqlForStats);
            if (mm) fc.domain = [mm.min, mm.max];
          }
        }

        const lc: any = layer.hexLayer?.getLineColor;
        if (!domainFromUser && lc && typeof lc === 'object' && !Array.isArray(lc) && lc['@@function'] === 'colorContinuous') {
          const attr = String(lc.attr || '');
          if (attr && lc.autoDomain === true) {
            const mm = await runtime.getMinMaxFromQuery(layer, attr, sqlForStats);
            if (mm) lc.domain = [mm.min, mm.max];
          }
        }
      } catch (_) {}

      // Geometry is generated in DuckDB (spatial + h3 extensions). We intentionally
      // do NOT fall back to JS h3-js geometry to keep the code simpler.
      dispatchSqlStatus(layer.id, 'running...');
      const gj = await runtime.runSqlGeoJSON(layer, layer.sql || 'SELECT * FROM data');
      if (destroyed) return;
      if (!gj?.geojson) {
        throw new Error('DuckDB GeoJSON path unavailable (requires spatial + h3 extensions and compatible columns).');
      }
      const geojson: FeatureCollection = gj.geojson as any;
      setLayerGeoJSON(layer.id, geojson);

      const visible = visibilityState[layer.id] !== false;
      // If the source exists, update in-place; otherwise add the layer once.
      const updated = safeSetGeoJsonSource(map, layer.id, geojson);
      if (!updated) {
        try { addStaticHexLayer(map, layer, geojson, visible); } catch (_) {}
      }
      // Always refresh paint expressions after data/domain changes.
      updateHexPaint(map, layer);

      dispatchSqlStatus(layer.id, `${(gj.count || 0).toLocaleString()} rows`);
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


