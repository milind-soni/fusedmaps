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
  destroy: () => void;
}

interface TileRuntime {
  cache: Map<string, any[]>;
  inflight: Map<string, Promise<any[] | null>>;
  tilesLoading: number;
  tileStore: Record<string, Record<string, any[]>>; // layerId -> "z/x/y" -> rows
  tileStats: Record<string, Record<string, { min: number; max: number }>>; // layerId -> "z/x/y" -> min/max
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
    tilesLoading: 0,
    tileStore: {},
    tileStats: {}
  };
}

// --- AutoDomain (ported from map_utils.py; simplified to v1) ---
const AUTO_DOMAIN_MAX_SAMPLES = 5000;
const AUTO_DOMAIN_MIN_ZOOM = 10;
const AUTO_DOMAIN_MIN_COUNT = 30;
const AUTO_DOMAIN_PCT_LOW = 0.02;
const AUTO_DOMAIN_PCT_HIGH = 0.98;
const AUTO_DOMAIN_ZOOM_TOLERANCE = 1;
const AUTO_DOMAIN_REBUILD_REL_TOL = 0.05;

function tileToBounds(x: number, y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  const west = (x / Math.pow(2, z)) * 360 - 180;
  const north = (180 / Math.PI) * Math.atan(Math.sinh(n));

  const n2 = Math.PI - (2 * Math.PI * (y + 1)) / Math.pow(2, z);
  const east = ((x + 1) / Math.pow(2, z)) * 360 - 180;
  const south = (180 / Math.PI) * Math.atan(Math.sinh(n2));

  return { west, south, east, north };
}

function boundsIntersect(a: any, b: any) {
  return !(a.east < b.west || a.west > b.east || a.north < b.south || a.south > b.north);
}

function wantsAutoDomain(layer: HexLayerConfig): { enabled: boolean; attr: string | null } {
  const fc: any = (layer.hexLayer as any)?.getFillColor;
  if (!fc || typeof fc !== 'object' || Array.isArray(fc)) return { enabled: false, attr: null };
  if (fc['@@function'] !== 'colorContinuous') return { enabled: false, attr: null };
  const attr = fc.attr || null;
  if (!attr) return { enabled: false, attr: null };
  const hasDomain = Array.isArray(fc.domain) && fc.domain.length >= 2;
  const enabled = fc.autoDomain === true || !hasDomain;
  return { enabled, attr };
}

function parseMaybeNumber(v: any): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'bigint') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function extractParquetMinMaxFromMetadata(metadata: any, columnName: string): { min: number; max: number } | null {
  // Hyparquet metadata shape varies across builds; be defensive:
  const rowGroups = metadata?.row_groups || metadata?.rowGroups || metadata?.row_groups_list || null;
  if (!Array.isArray(rowGroups) || rowGroups.length === 0) return null;

  let minAll = Number.POSITIVE_INFINITY;
  let maxAll = Number.NEGATIVE_INFINITY;
  let found = false;

  for (const rg of rowGroups) {
    const cols = rg?.columns || rg?.columns_list || null;
    if (!Array.isArray(cols)) continue;

    for (const c of cols) {
      const md = c?.meta_data || c?.metaData || c?.metadata || null;
      const path = md?.path_in_schema || md?.pathInSchema || md?.path || null;
      const leaf = Array.isArray(path) ? String(path[path.length - 1]) : (typeof path === 'string' ? path : null);
      if (!leaf || leaf !== columnName) continue;

      const stats = md?.statistics || md?.stats || c?.statistics || null;
      if (!stats) continue;

      const mn = parseMaybeNumber(stats.min_value ?? stats.min ?? stats.minimum ?? stats.minValue);
      const mx = parseMaybeNumber(stats.max_value ?? stats.max ?? stats.maximum ?? stats.maxValue);
      if (mn == null || mx == null) continue;

      found = true;
      if (mn < minAll) minAll = mn;
      if (mx > maxAll) maxAll = mx;
    }
  }

  if (!found || !Number.isFinite(minAll) || !Number.isFinite(maxAll)) return null;
  if (minAll === maxAll) return { min: minAll - 1, max: maxAll + 1 };
  return { min: minAll, max: maxAll };
}

function calculateDomainFromTileStats(
  map: mapboxgl.Map,
  runtime: TileRuntime,
  layer: HexLayerConfig,
  expectedZ: number
): [number, number] | null {
  if (map.getZoom() < AUTO_DOMAIN_MIN_ZOOM) return null;

  const store = runtime.tileStats[layer.id];
  if (!store) return null;

  const b = map.getBounds();
  const viewportBounds = {
    west: b.getWest(),
    east: b.getEast(),
    south: b.getSouth(),
    north: b.getNorth()
  };

  let minAll = Number.POSITIVE_INFINITY;
  let maxAll = Number.NEGATIVE_INFINITY;
  let count = 0;

  for (const [tileKey, st] of Object.entries(store)) {
    const [z, x, y] = tileKey.split('/').map(Number);
    if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (Math.abs(z - expectedZ) > AUTO_DOMAIN_ZOOM_TOLERANCE) continue;
    const tb = tileToBounds(x, y, z);
    if (!boundsIntersect(tb, viewportBounds)) continue;

    if (Number.isFinite(st.min)) {
      minAll = Math.min(minAll, st.min);
      count++;
    }
    if (Number.isFinite(st.max)) {
      maxAll = Math.max(maxAll, st.max);
    }
  }

  if (count < 2 || !Number.isFinite(minAll) || !Number.isFinite(maxAll)) return null;

  // 1% padding
  const span = maxAll - minAll;
  if (Number.isFinite(span) && span > 0) {
    const pad = span * 0.01;
    minAll -= pad;
    maxAll += pad;
  }
  if (minAll >= maxAll) return [minAll - 1, maxAll + 1];
  return [minAll, maxAll];
}

function calculateDomainFromTiles(
  map: mapboxgl.Map,
  runtime: TileRuntime,
  layer: HexLayerConfig,
  attr: string,
  expectedZ: number
): [number, number] | null {
  // Prefer Parquet metadata stats if available (fast path)
  const statsDom = calculateDomainFromTileStats(map, runtime, layer, expectedZ);
  if (statsDom) return statsDom;

  // Only calculate when zoomed in enough
  if (map.getZoom() < AUTO_DOMAIN_MIN_ZOOM) return null;

  const store = runtime.tileStore[layer.id];
  if (!store) return null;

  const b = map.getBounds();
  const viewportBounds = {
    west: b.getWest(),
    east: b.getEast(),
    south: b.getSouth(),
    north: b.getNorth()
  };

  // First pass: count + collect viewport tiles
  let totalCount = 0;
  const viewportTiles: any[][] = [];

  for (const [tileKey, rows] of Object.entries(store)) {
    const [z, x, y] = tileKey.split('/').map(Number);
    if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) continue;

    // Only consider tiles near the current effective zoom (respect zoomOffset)
    if (Math.abs(z - expectedZ) > AUTO_DOMAIN_ZOOM_TOLERANCE) continue;

    const tb = tileToBounds(x, y, z);
    if (!boundsIntersect(tb, viewportBounds)) continue;

    viewportTiles.push(rows);
    totalCount += rows.length;
  }

  if (totalCount < AUTO_DOMAIN_MIN_COUNT) return null;

  // Deterministic stride sampling
  const stride = Math.max(1, Math.floor(totalCount / AUTO_DOMAIN_MAX_SAMPLES));
  const values: number[] = [];
  let seen = 0;

  for (const rows of viewportTiles) {
    for (const item of rows) {
      seen++;
      if (stride > 1 && (seen % stride) !== 0) continue;

      const p = item?.properties || item || {};
      const raw = p[attr];
      let v: number | null = null;
      if (typeof raw === 'number') v = raw;
      else if (typeof raw === 'string') {
        const n = parseFloat(raw);
        v = Number.isFinite(n) ? n : null;
      }
      if (v != null && Number.isFinite(v)) values.push(v);
      if (values.length >= AUTO_DOMAIN_MAX_SAMPLES) break;
    }
    if (values.length >= AUTO_DOMAIN_MAX_SAMPLES) break;
  }

  if (values.length < AUTO_DOMAIN_MIN_COUNT) return null;

  values.sort((a, b) => a - b);
  const loIdx = Math.max(0, Math.min(values.length - 1, Math.floor(values.length * AUTO_DOMAIN_PCT_LOW)));
  const hiIdx = Math.max(0, Math.min(values.length - 1, Math.floor(values.length * AUTO_DOMAIN_PCT_HIGH)));
  let minVal = values[loIdx];
  let maxVal = values[Math.max(hiIdx, loIdx)];

  // 1% padding
  const span = maxVal - minVal;
  if (Number.isFinite(span) && span > 0) {
    const pad = span * 0.01;
    minVal -= pad;
    maxVal += pad;
  }
  if (minVal >= maxVal) return [minVal - 1, maxVal + 1];
  return [minVal, maxVal];
}

function maybeUpdateDynamicDomain(layer: HexLayerConfig, next: [number, number]): boolean {
  const fc: any = (layer.hexLayer as any)?.getFillColor;
  if (!fc || typeof fc !== 'object') return false;
  const old: any = fc._dynamicDomain;

  const changedEnough = !Array.isArray(old) || old.length < 2
    ? true
    : (() => {
        const denom = (old[1] - old[0]) ? (old[1] - old[0]) : 1;
        return (
          Math.abs(next[0] - old[0]) / denom > AUTO_DOMAIN_REBUILD_REL_TOL ||
          Math.abs(next[1] - old[1]) / denom > AUTO_DOMAIN_REBUILD_REL_TOL
        );
      })();

  if (!changedEnough) return false;
  fc._dynamicDomain = next;
  return true;
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

      // Prefer dynamic domain (autoDomain) when present
      const fillCfg: any = rawHexCfg.getFillColor;
      if (fillCfg && typeof fillCfg === 'object' && !Array.isArray(fillCfg) && Array.isArray(fillCfg._dynamicDomain)) {
        fillCfg.domain = fillCfg._dynamicDomain;
      }
      const lineCfg: any = rawHexCfg.getLineColor;
      if (lineCfg && typeof lineCfg === 'object' && !Array.isArray(lineCfg) && Array.isArray(lineCfg._dynamicDomain)) {
        lineCfg.domain = lineCfg._dynamicDomain;
      }

      const getFillColor = buildColorAccessor(fillCfg);
      const getLineColor = buildColorAccessor(lineCfg);

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
          const tileKey = `${z}/${x}/${y}`;

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
              let parquetMetadata: any = null;

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
                parquetMetadata = metadata;
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
              // Track for autoDomain sampling
              if (!runtime.tileStore[layer.id]) runtime.tileStore[layer.id] = {};
              runtime.tileStore[layer.id][tileKey] = normalized;

              // Parquet metadata min/max (instant autoDomain)
              try {
                const auto = wantsAutoDomain(layer);
                if (auto.enabled && auto.attr && parquetMetadata) {
                  const mm = extractParquetMinMaxFromMetadata(parquetMetadata, auto.attr);
                  if (mm) {
                    if (!runtime.tileStats[layer.id]) runtime.tileStats[layer.id] = {};
                    runtime.tileStats[layer.id][tileKey] = { min: mm.min, max: mm.max };
                    // Trigger a quick autoDomain recompute (listener is in createHexTileOverlay)
                    try { window.dispatchEvent(new CustomEvent('fusedmaps:autodomain:dirty')); } catch {}
                  }
                }
              } catch (_) {}
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

  // AutoDomain scheduler (only for layers that request it)
  const autoLayers = layers.filter((l) => l.layerType === 'hex' && (l as any).isTileLayer) as HexLayerConfig[];
  const autoCandidates = autoLayers
    .map((l) => ({ layer: l, ...wantsAutoDomain(l), tileCfg: getTileConfig(l) }))
    .filter((x) => x.enabled && x.attr);

  let autoTimer: any = null;
  const scheduleAuto = (delayMs: number) => {
    if (!autoCandidates.length) return;
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      let changed = false;
      for (const c of autoCandidates) {
        const expectedZ = Math.round(map.getZoom()) + (c.tileCfg.zoomOffset || 0);
        const dom = calculateDomainFromTiles(map, runtime, c.layer, c.attr!, expectedZ);
        if (dom) {
          const did = maybeUpdateDynamicDomain(c.layer, dom);
          if (did) changed = true;
        }
      }
      if (changed) {
        rebuild();
        // Ask host to refresh legend (index.ts listens)
        try { window.dispatchEvent(new CustomEvent('fusedmaps:legend:update')); } catch {}
      }
    }, delayMs);
  };

  const onMoveEnd = () => scheduleAuto(800);
  const onIdle = () => scheduleAuto(1200);
  const onDirty = () => scheduleAuto(150);
  if (autoCandidates.length) {
    map.on('moveend', onMoveEnd);
    map.on('idle', onIdle);
    try { window.addEventListener('fusedmaps:autodomain:dirty', onDirty as any); } catch {}
    // Initial attempt after some tiles arrive
    scheduleAuto(1500);
  }

  const destroy = () => {
    if (autoTimer) clearTimeout(autoTimer);
    try { map.off('moveend', onMoveEnd); } catch {}
    try { map.off('idle', onIdle); } catch {}
    try { window.removeEventListener('fusedmaps:autodomain:dirty', onDirty as any); } catch {}
    try { map.removeControl(overlay); } catch {}
  };

  return { overlay, rebuild, pickObject, destroy };
}


