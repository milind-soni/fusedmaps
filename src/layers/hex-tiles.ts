/**
 * Hex tile layers via Deck.gl TileLayer + MapboxOverlay.
 *
 * Notes:
 * - We intentionally use globals (window.deck, window.hyparquet) to match the
 *   original map_utils.py approach and keep Rollup externals working.
 * - Required globals when tile layers are present:
 *   - window.deck (deck.gl UMD)
 *   - window.hyparquet (hyparquet ESM loaded into window)
 */

import type { HexLayerConfig, LayerConfig, TileLayerConfig } from '../types';
import { toH3 } from './hex';
import { getPaletteColors } from '../color/palettes';

type DeckGlobal = any;

export interface DeckTileOverlayState {
  overlay: any; // deck.MapboxOverlay instance
  rebuild: () => void;
  pickObject: (opts: { x: number; y: number; radius?: number }) => any;
}

interface TileRuntime {
  cache: Map<string, any[]>;
  inflight: Map<string, Promise<any[] | null>>;
  tilesLoading: number;
}

const DEFAULT_MAX_REQUESTS = 10;

function getDeck(): DeckGlobal | null {
  return (window as any).deck || null;
}

function ensureTileLoader(): { setLoading: (delta: number) => void } {
  let el = document.getElementById('tile-loader');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tile-loader';
    el.innerHTML = `<div class="loader-spinner"></div><span id="loader-text">Loading tiles...</span>`;
    document.body.appendChild(el);
  }

  const textEl = document.getElementById('loader-text');
  let hideTimeout: any = null;
  let tilesCurrentlyLoading = 0;

  const setLoading = (delta: number) => {
    tilesCurrentlyLoading = Math.max(0, tilesCurrentlyLoading + delta);
    if (!el) return;
    if (tilesCurrentlyLoading > 0) {
      if (hideTimeout) clearTimeout(hideTimeout);
      el.classList.add('active');
      if (textEl) {
        textEl.textContent =
          tilesCurrentlyLoading === 1 ? 'Loading tile...' : `Loading ${tilesCurrentlyLoading} tiles...`;
      }
    } else {
      hideTimeout = setTimeout(() => el?.classList.remove('active'), 300);
    }
  };

  return { setLoading };
}

function normalizeTileData(raw: any): any[] {
  const arr: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.data)
      ? raw.data
      : Array.isArray(raw?.features)
        ? raw.features
        : [];

  const rows = arr.map((d: any) => (d?.properties ? { ...d.properties } : { ...d }));

  return rows
    .map((p: any) => {
      const hexRaw = p.hex ?? p.h3 ?? p.index ?? p.id;
      const hex = toH3(hexRaw);
      if (!hex) return null;
      const props = { ...p, hex };
      return { ...props, properties: { ...props } };
    })
    .filter(Boolean);
}

function sanitizeProperties(obj: Record<string, any>): Record<string, any> {
  // Mirrors the workbench approach: avoid BigInt leaking into Deck/tooltip.
  const out: Record<string, any> = {};
  for (const k of Object.keys(obj || {})) {
    const v = (obj as any)[k];
    if (typeof v === 'bigint') {
      const lk = String(k).toLowerCase();
      if (lk === 'hex' || lk === 'h3' || lk === 'index' || lk === 'id') {
        // Likely an H3 index stored as int64
        out[k] = v.toString(16);
      } else if (v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(Number.MIN_SAFE_INTEGER)) {
        out[k] = Number(v);
      } else {
        // Fallback: stringify to avoid breaking render/tooltip
        out[k] = v.toString();
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

function sanitizeRows(rows: any[]): any[] {
  return (rows || []).map((r: any) => {
    const p = r?.properties ? sanitizeProperties(r.properties) : sanitizeProperties(r || {});
    // Ensure both root and properties exist (Deck picks often look at object.properties)
    return { ...p, properties: { ...p } };
  });
}

function coerceKnownIdsToStrings(jsonText: string): string {
  // IMPORTANT: H3 indexes are often > 2^53 and will lose precision if parsed as JS numbers.
  // Coerce known id fields to strings before JSON.parse.
  return jsonText.replace(/\"(hex|h3|index|id)\"\s*:\s*(\d+)/gi, (_m, k, d) => `"${k}":"${d}"`);
}

function buildColorAccessor(colorCfg: any): ((obj: any) => any) | any[] | null {
  if (!colorCfg) return null;

  // Static color arrays
  if (Array.isArray(colorCfg)) return colorCfg;

  // Dynamic expression accessor
  if (typeof colorCfg === 'string' && colorCfg.startsWith('@@=')) {
    const code = colorCfg.slice(3);
    return (object: any) => {
      try {
        const fn = new Function(
          'object',
          `const properties = object?.properties || object || {}; return (${code});`
        );
        const res = fn(object);
        return res;
      } catch {
        return null;
      }
    };
  }

  // colorContinuous / colorCategories
  if (typeof colorCfg === 'object' && colorCfg['@@function']) {
    const fnType = colorCfg['@@function'];
    const attr = colorCfg.attr;
    if (!attr) return null;

    if (fnType === 'colorContinuous') {
      // Expect domain [min, max] (numbers). If omitted, just return null.
      const dom = colorCfg.domain;
      if (!Array.isArray(dom) || dom.length < 2) return null;
      const d0 = Number(dom[0]);
      const d1 = Number(dom[dom.length - 1]);
      if (!Number.isFinite(d0) || !Number.isFinite(d1) || d0 === d1) return null;

      const steps = Math.max(2, Number(colorCfg.steps ?? 7));
      const paletteName = colorCfg.colors || 'ArmyRose';
      const cols0 = getPaletteColors(paletteName, steps) || null;
      if (!cols0?.length) return null;

      const domainReversed = d0 > d1;
      const wantsReverse = !!colorCfg.reverse;
      const shouldReverse = domainReversed ? !wantsReverse : wantsReverse;
      const cols = shouldReverse ? [...cols0].reverse() : [...cols0];

      const minV = Math.min(d0, d1);
      const maxV = Math.max(d0, d1);
      const nullColor = Array.isArray(colorCfg.nullColor) ? colorCfg.nullColor : [184, 184, 184];

      return (obj: any) => {
        const p = obj?.properties || obj || {};
        const raw = p[attr];
        let v: number | null = null;
        if (typeof raw === 'number') v = raw;
        else if (typeof raw === 'string') {
          const n = parseFloat(raw);
          v = Number.isFinite(n) ? n : null;
        }
        if (v == null || !Number.isFinite(v)) return nullColor;

        const t = (v - minV) / (maxV - minV);
        const idx = Math.max(0, Math.min(cols.length - 1, Math.round(t * (cols.length - 1))));
        // Convert "#rrggbb" to [r,g,b]
        const hex = cols[idx].replace('#', '');
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return [r, g, b];
      };
    }

    if (fnType === 'colorCategories') {
      const categories: any[] = Array.isArray(colorCfg.categories)
        ? colorCfg.categories
        : Array.isArray(colorCfg.domain)
          ? colorCfg.domain
          : [];

      const paletteName = colorCfg.colors || 'Bold';
      const cols0 = getPaletteColors(paletteName, Math.max(categories.length, 3)) || null;
      const nullColor = Array.isArray(colorCfg.nullColor) ? colorCfg.nullColor : [184, 184, 184];

      const lut = new Map<string, any[]>();
      if (cols0?.length && categories.length) {
        categories.forEach((c, i) => {
          const col = cols0[i % cols0.length] || '#999999';
          const hex = String(col).replace('#', '');
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          lut.set(String(c), [r, g, b]);
        });
      }

      return (obj: any) => {
        const p = obj?.properties || obj || {};
        const v = p[attr];
        if (v == null) return nullColor;
        const hit = lut.get(String(v));
        return hit || nullColor;
      };
    }
  }

  return null;
}

function createTileRuntime(): TileRuntime {
  return {
    cache: new Map(),
    inflight: new Map(),
    tilesLoading: 0
  };
}

function getTileConfig(layer: HexLayerConfig): Required<TileLayerConfig> & { maxRequests: number; zoomOffset: number } {
  const cfg = layer.tileLayerConfig || {};
  return {
    tileSize: cfg.tileSize ?? 256,
    minZoom: cfg.minZoom ?? 0,
    maxZoom: cfg.maxZoom ?? 19,
    zoomOffset: (cfg as any).zoomOffset ?? 0,
    maxRequests: (cfg as any).maxRequests ?? DEFAULT_MAX_REQUESTS
  };
}

function buildHexTileDeckLayers(
  layers: LayerConfig[],
  visibility: Record<string, boolean>,
  runtime: TileRuntime,
  onLoadingDelta: (delta: number) => void
): any[] {
  const deck = getDeck();
  if (!deck) return [];

  const TileLayer = deck.TileLayer;
  const H3HexagonLayer = deck.H3HexagonLayer || deck?.GeoLayers?.H3HexagonLayer;
  if (!TileLayer || !H3HexagonLayer) return [];

  const tileLayers = layers
    .filter((l) => l.layerType === 'hex' && (l as any).isTileLayer && (l as any).tileUrl)
    .map((l) => l as HexLayerConfig);

  // Reverse to keep UI order consistent (top of menu renders on top)
  return tileLayers
    .slice()
    .reverse()
    .map((layer) => {
      const visible = visibility[layer.id] !== false;
      const tileUrl = layer.tileUrl!;
      const tileCfg = getTileConfig(layer);
      const rawHexCfg: any = layer.hexLayer || {};

      const getFillColor = buildColorAccessor(rawHexCfg.getFillColor);
      const getLineColor = buildColorAccessor(rawHexCfg.getLineColor);

      const stroked = rawHexCfg.stroked !== false;
      const filled = rawHexCfg.filled !== false;
      const extruded = rawHexCfg.extruded === true;
      const opacity = typeof rawHexCfg.opacity === 'number' ? rawHexCfg.opacity : 0.8;
      const lineWidthMinPixels = rawHexCfg.lineWidthMinPixels ?? 1;
      const elevationScale = rawHexCfg.elevationScale ?? 1;
      const coverage = rawHexCfg.coverage ?? 0.9;

      return new TileLayer({
        id: `${layer.id}-tiles`,
        data: tileUrl,
        tileSize: tileCfg.tileSize,
        minZoom: tileCfg.minZoom,
        maxZoom: tileCfg.maxZoom,
        zoomOffset: tileCfg.zoomOffset,
        maxRequests: tileCfg.maxRequests,
        refinementStrategy: 'best-available',
        pickable: true,
        visible,
        getTileData: async ({ index, signal }: any) => {
          const { x, y, z } = index;
          const url = tileUrl.replace('{z}', z).replace('{x}', x).replace('{y}', y);
          const cacheKey = url;

          if (runtime.cache.has(cacheKey)) return runtime.cache.get(cacheKey);
          if (runtime.inflight.has(cacheKey)) {
            try {
              const data = await runtime.inflight.get(cacheKey);
              // IMPORTANT: preserve null (abort) so the tileset doesn't think we loaded data.
              return data;
            } catch {
              return runtime.cache.get(cacheKey) || [];
            }
          }

          onLoadingDelta(1);
          const p = (async () => {
            try {
              const res = await fetch(url, { signal });
              if (signal?.aborted) return null;
              if (!res.ok) throw new Error(`tile http ${res.status}`);

              const ct = (res.headers.get('Content-Type') || '').toLowerCase();
              let data: any;

              // Parquet tiles
              if (ct.includes('application/octet-stream') || ct.includes('application/parquet') || url.endsWith('.parquet')) {
                const hp = (window as any).hyparquet;
                if (!hp?.parquetMetadataAsync || !hp?.parquetReadObjects) {
                  // Not available: return empty (caller should ensure hyparquet is loaded)
                  // IMPORTANT: don't mark tile as loaded; allow retry after hyparquet becomes available.
                  return null;
                }
                const buf = await res.arrayBuffer();
                if (signal?.aborted) return null;
                if (!buf || (buf as ArrayBuffer).byteLength === 0) return [];
                const file = {
                  byteLength: buf.byteLength,
                  async slice(start: number, end: number) {
                    return (buf as ArrayBuffer).slice(start, end);
                  }
                };
                const metadata = await hp.parquetMetadataAsync(file);
                if (signal?.aborted) return null;
                const rows = await hp.parquetReadObjects({ file, utf8: false, metadata });
                data = rows;
              } else {
                let text = await res.text();
                if (signal?.aborted) return null;
                text = coerceKnownIdsToStrings(text);
                data = JSON.parse(text);
              }

              // Normalize + sanitize
              const normalized = sanitizeRows(normalizeTileData(data));
              runtime.cache.set(cacheKey, normalized);
              return normalized;
            } catch (e) {
              if (signal?.aborted) return null;
              // IMPORTANT: do NOT cache failures; return null so the tileset may retry.
              return null;
            } finally {
              runtime.inflight.delete(cacheKey);
              onLoadingDelta(-1);
            }
          })();

          runtime.inflight.set(cacheKey, p);
          const out = await p;
          // Preserve null for abort/failure semantics (prevents "holes stuck forever")
          return out;
        },
        renderSubLayers: (props: any) => {
          const data = props.data || [];
          // If aborted/failed, props.data can be null; return nothing so parent placeholders can show
          if (!data || !data.length) return null;

          return new H3HexagonLayer({
            id: `${props.id}-h3`,
            data,
            getHexagon: (d: any) => d.hex,
            pickable: true,
            stroked,
            filled,
            extruded,
            opacity,
            coverage,
            lineWidthMinPixels,
            elevationScale,
            ...(getFillColor ? { getFillColor } : {}),
            ...(getLineColor ? { getLineColor } : {})
          });
        }
      });
    });
}

export function createHexTileOverlay(
  map: mapboxgl.Map,
  layers: LayerConfig[],
  visibility: Record<string, boolean>
): DeckTileOverlayState | null {
  const deck = getDeck();
  if (!deck?.MapboxOverlay || !deck?.TileLayer) return null;

  const runtime = createTileRuntime();
  const loader = ensureTileLoader();
  const build = () => buildHexTileDeckLayers(layers, visibility, runtime, loader.setLoading);

  const overlay = new deck.MapboxOverlay({
    interleaved: true,
    useDevicePixels: true,
    layers: build()
  });

  // Attach to map
  try {
    map.addControl(overlay);
  } catch {
    // ignore
  }

  const rebuild = () => {
    try {
      overlay.setProps({ layers: build() });
      try {
        (map as any).triggerRepaint?.();
      } catch {}
    } catch {
      // ignore
    }
  };

  const pickObject = (opts: { x: number; y: number; radius?: number }) => {
    try {
      return overlay.pickObject(opts);
    } catch {
      return null;
    }
  };

  return { overlay, rebuild, pickObject };
}


