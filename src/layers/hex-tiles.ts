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
  tileStats: Record<string, Record<string, { min: number; max: number }>>; // layerId -> "z/x/y" -> min/max
  catState: Record<string, Record<string, { lut: Map<string, number[]>; pairs: Array<{ value: string; label: string }>; next: number; debounce?: any }>>; // layerId -> attr -> state
}

const DEFAULT_MAX_REQUESTS = 10;
const DEFAULT_HYPARQUET_ESM_URL = 'https://cdn.jsdelivr.net/npm/hyparquet@1.23.3/+esm';

let HYPARQUET_LOAD_PROMISE: Promise<any> | null = null;

async function ensureHyparquetLoaded(): Promise<any> {
  const w = window as any;
  if (w.hyparquet?.parquetMetadataAsync && w.hyparquet?.parquetReadObjects) {
    return w.hyparquet;
  }
  if (HYPARQUET_LOAD_PROMISE) return HYPARQUET_LOAD_PROMISE;

  // Important: keep Rollup from trying to bundle/transform dynamic import in UMD.
  const dynamicImport = (u: string) => (new Function('u', 'return import(u)') as any)(u);

  HYPARQUET_LOAD_PROMISE = (async () => {
    const mod = await dynamicImport(DEFAULT_HYPARQUET_ESM_URL);
    // hyparquet exports vary: use module itself if functions are present, else default/named.
    const candidate = mod?.default && (mod.default.parquetReadObjects || mod.default.parquetMetadataAsync)
      ? mod.default
      : mod;
    w.hyparquet = candidate;
    return w.hyparquet;
  })()
    .catch((e: any) => {
      // allow retry on next tile
      HYPARQUET_LOAD_PROMISE = null;
      throw e;
    });

  return HYPARQUET_LOAD_PROMISE;
}

function hashString(s: string): string {
  // Small stable hash (djb2-ish) for IDs; not crypto.
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

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

function buildColorAccessor(
  runtime: TileRuntime,
  layer: HexLayerConfig,
  colorCfg: any
): ((obj: any) => any) | any[] | null {
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
      const nullColor = Array.isArray(colorCfg.nullColor) ? colorCfg.nullColor : [184, 184, 184];

      // If categories are provided, use a fixed lookup.
      if (categories.length) {
        const cols0 = getPaletteColors(paletteName, Math.max(categories.length, 3)) || null;
        const lut = new Map<string, any[]>();
        if (cols0?.length) {
          categories.forEach((c, i) => {
            const col = cols0[i % cols0.length] || '#999999';
            const hex = String(col).replace('#', '');
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            lut.set(String((c as any)?.value ?? c), [r, g, b]);
          });
        }
        // Also expose for legend if user passed objects
        try {
          (colorCfg as any)._detectedCategories = categories.map((c: any) =>
            typeof c === 'object' ? { value: c.value, label: String(c.label ?? c.value) } : { value: c, label: String(c) }
          );
        } catch (_) {}

        return (obj: any) => {
          const p = obj?.properties || obj || {};
          const v = p[attr];
          if (v == null) return nullColor;
          const hit = lut.get(String(v));
          return hit || nullColor;
        };
      }

      // No categories provided: progressively discover categories from loaded tiles.
      const layerId = layer.id;
      runtime.catState[layerId] = runtime.catState[layerId] || {};
      const st = runtime.catState[layerId][attr] || { lut: new Map(), pairs: [], next: 0 };
      runtime.catState[layerId][attr] = st;

      // Use a reasonable palette size for discovery.
      const cols0 = getPaletteColors(paletteName, 12) || null;
      const cols = cols0?.length ? cols0 : ['#7fc97f', '#beaed4', '#fdc086', '#ffff99', '#386cb0', '#f0027f', '#bf5b17', '#666666'];

      const scheduleLegendUpdate = () => {
        try {
          if (st.debounce) return;
          st.debounce = setTimeout(() => {
            st.debounce = null;
            try { window.dispatchEvent(new CustomEvent('fusedmaps:legend:update')); } catch (_) {}
          }, 150);
        } catch (_) {}
      };

      return (obj: any) => {
        const p = obj?.properties || obj || {};
        const v = p[attr];
        if (v == null || v === '' || v === 'null') return nullColor;
        const key = String(v);
        let hit = st.lut.get(key);
        if (!hit) {
          const col = cols[st.next % cols.length] || '#999999';
          st.next += 1;
          const hex = String(col).replace('#', '');
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          hit = [r, g, b];
          st.lut.set(key, hit);
          // cap legend categories for sanity
          if (st.pairs.length < 50) st.pairs.push({ value: key, label: key });
          try { (colorCfg as any)._detectedCategories = st.pairs; } catch (_) {}
          scheduleLegendUpdate();
        }
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
    tileStats: {},
    catState: {}
  };
}

// --- AutoDomain (Parquet stats-only) ---
const AUTO_DOMAIN_MIN_ZOOM = 10;
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
  // If the user explicitly set a domain (e.g. via debug UI), never override it.
  if ((layer as any).fillDomainFromUser === true || (fc as any).fillDomainFromUser === true) {
    return { enabled: false, attr };
  }
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
  _attr: string,
  expectedZ: number
): [number, number] | null {
  // Stats-only (Parquet). If stats aren't there, we intentionally don't update.
  return calculateDomainFromTileStats(map, runtime, layer, expectedZ);
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

function getTileConfig(
  layer: HexLayerConfig
): Required<TileLayerConfig> & { maxRequests: number; zoomOffset: number; refinementStrategy: string } {
  const cfg = layer.tileLayerConfig || {};
  return {
    tileSize: cfg.tileSize ?? 256,
    minZoom: cfg.minZoom ?? 0,
    maxZoom: cfg.maxZoom ?? 19,
    zoomOffset: (cfg as any).zoomOffset ?? 0,
    maxRequests: (cfg as any).maxRequests ?? DEFAULT_MAX_REQUESTS,
    refinementStrategy: (cfg as any).refinementStrategy ?? 'best-available'
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

  // IMPORTANT: Only include visible tile layers.
  // Using `visible: false` on Deck layers can still leave stale tiles/picking artifacts in some setups.
  // Filtering them out ensures the layer is truly removed from rendering + picking (matches map_utils.py).
  const tileLayers = layers
    .filter((l) => l.layerType === 'hex' && (l as any).isTileLayer && (l as any).tileUrl)
    .map((l) => l as HexLayerConfig)
    .filter((l) => visibility[l.id] !== false);

  // Reverse to keep UI order consistent (top of menu renders on top)
  return tileLayers
    .slice()
    .reverse()
    .map((layer) => {
      const visible = true;
      const tileUrl = layer.tileUrl!;
      const tileCfg = getTileConfig(layer);
      const rawHexCfg: any = layer.hexLayer || {};

      // Prefer dynamic domain (autoDomain) when present (without mutating config object)
      const fillCfg: any = rawHexCfg.getFillColor;
      const fillCfgEffective =
        fillCfg && typeof fillCfg === 'object' && !Array.isArray(fillCfg) && Array.isArray(fillCfg._dynamicDomain)
          ? { ...fillCfg, domain: fillCfg._dynamicDomain }
          : fillCfg;

      const lineCfg: any = rawHexCfg.getLineColor;
      const lineCfgEffective =
        lineCfg && typeof lineCfg === 'object' && !Array.isArray(lineCfg) && Array.isArray(lineCfg._dynamicDomain)
          ? { ...lineCfg, domain: lineCfg._dynamicDomain }
          : lineCfg;

      const getFillColor = buildColorAccessor(runtime, layer, fillCfgEffective);
      const getLineColor = buildColorAccessor(runtime, layer, lineCfgEffective);

      // IMPORTANT: When autoDomain updates, we must force TileLayer + its sublayers to fully update.
      // Otherwise, some already-loaded tiles can keep old attribute buffers and you see "tile seams".
      const domKey = JSON.stringify({
        fd: (fillCfgEffective && typeof fillCfgEffective === 'object') ? (fillCfgEffective.domain || fillCfgEffective._dynamicDomain) : null,
        ld: (lineCfgEffective && typeof lineCfgEffective === 'object') ? (lineCfgEffective.domain || lineCfgEffective._dynamicDomain) : null
      });
      const styleKey = JSON.stringify({
        f: fillCfgEffective,
        l: lineCfgEffective,
        stroked: rawHexCfg.stroked !== false,
        filled: rawHexCfg.filled !== false,
        extruded: rawHexCfg.extruded === true,
        opacity: rawHexCfg.opacity,
        elevationScale: rawHexCfg.elevationScale,
        coverage: rawHexCfg.coverage,
        lineWidthMinPixels: rawHexCfg.lineWidthMinPixels
      });
      const idHash = hashString(`${domKey}|${styleKey}`);

      const stroked = rawHexCfg.stroked !== false;
      const filled = rawHexCfg.filled !== false;
      const extruded = rawHexCfg.extruded === true;
      const opacity = typeof rawHexCfg.opacity === 'number' ? rawHexCfg.opacity : 0.8;
      const lineWidthMinPixels = rawHexCfg.lineWidthMinPixels ?? 1;
      const elevationScale = rawHexCfg.elevationScale ?? 1;
      const coverage = rawHexCfg.coverage ?? 0.9;
      const elevationProperty =
        rawHexCfg.elevationProperty ||
        (fillCfgEffective && typeof fillCfgEffective === 'object' ? (fillCfgEffective as any).attr : null) ||
        null;

      const auto = wantsAutoDomain(layer);
      const refinementStrategy =
        (tileCfg as any).refinementStrategy ||
        (auto.enabled ? 'no-overlap' : 'best-available');

      return new TileLayer({
        id: `${layer.id}-tiles-${idHash}`,
        data: tileUrl,
        tileSize: tileCfg.tileSize,
        minZoom: tileCfg.minZoom,
        maxZoom: tileCfg.maxZoom,
        zoomOffset: tileCfg.zoomOffset,
        maxRequests: tileCfg.maxRequests,
        refinementStrategy,
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
                let hp = (window as any).hyparquet;
                if (!hp?.parquetMetadataAsync || !hp?.parquetReadObjects) {
                  try {
                    hp = await ensureHyparquetLoaded();
                  } catch (e) {
                    console.error('[tiles] failed to auto-load hyparquet', e);
                    // IMPORTANT: don't mark tile as loaded; allow retry after hyparquet becomes available.
                    return null;
                  }
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
            ...(extruded && elevationProperty ? { getElevation: (d: any) => Number(d?.[elevationProperty] ?? 0) } : {}),
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


