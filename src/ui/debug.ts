/**
 * Debug panel (ported toward map_utils.py).
 *
 * In fusedmaps we focus on the deck/tile hex ecosystem; debug panel edits the in-memory
 * `config.layers` objects and triggers a Deck rebuild so changes apply immediately.
 */

import type { FusedMapsConfig, HexLayerConfig, VectorLayerConfig, ViewState } from '../types';
import { getViewState } from '../core/map';
import { hexToGeoJSON, updateStaticHexLayer } from '../layers/hex';
import { getLayerGeoJSONs } from '../layers';
import { buildColorExpr } from '../color/expressions';

export interface DebugHandle {
  destroy: () => void;
}

function fmt(n: number, digits: number) {
  try {
    return Number.isFinite(n) ? n.toFixed(digits) : '';
  } catch {
    return '';
  }
}

function isEditingInputs(root: HTMLElement) {
  const a = document.activeElement as HTMLElement | null;
  if (!a) return false;
  return !!a.closest?.('#debug-panel') && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
}

function updateDebugTogglePosition(shell: HTMLElement, panel: HTMLElement, toggle: HTMLElement) {
  try {
    const w = panel.getBoundingClientRect().width || 280;
    shell.style.setProperty('--debug-panel-w', `${w}px`);
    const collapsed = panel.classList.contains('collapsed');
    toggle.style.left = collapsed ? '0px' : `var(--debug-panel-w, ${w}px)`;
  } catch (_) {}
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function getCurrentLayerVisibility(map: mapboxgl.Map, layerId: string): boolean {
  try {
    const style: any = map.getStyle?.();
    const layers: any[] = style?.layers || [];
    const ids = [`${layerId}-fill`, `${layerId}-extrusion`, `${layerId}-outline`];
    for (const id of ids) {
      const l = layers.find((x: any) => x && x.id === id);
      if (!l) continue;
      const vis = l.layout?.visibility;
      return vis !== 'none';
    }
  } catch (_) {}
  return true;
}

function ensureColorContinuousCfg(obj: any) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj['@@function'] !== 'colorContinuous') return null;
  return obj;
}

function getAttrCandidates(layer: HexLayerConfig): string[] {
  const out = new Set<string>();
  try {
    const fc: any = (layer.hexLayer as any)?.getFillColor;
    const lc: any = (layer.hexLayer as any)?.getLineColor;
    if (fc?.attr) out.add(String(fc.attr));
    if (lc?.attr) out.add(String(lc.attr));
    const tta: any = (layer.hexLayer as any)?.tooltipAttrs;
    if (Array.isArray(tta)) tta.forEach((x) => out.add(String(x)));
  } catch (_) {}
  return [...out].filter(Boolean);
}

function getVectorAttrCandidates(layer: VectorLayerConfig): string[] {
  try {
    const f0: any = layer.geojson?.features?.[0];
    const p = (f0?.properties || {}) as Record<string, unknown>;
    return Object.keys(p || {}).filter((k) => k && k !== '_fused_idx');
  } catch (_) {
    return [];
  }
}

function setPaintSafe(map: mapboxgl.Map, layerId: string, prop: string, value: any) {
  try {
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, prop as any, value as any);
    }
  } catch (_) {}
}

function hexToRgbArr(hex: string, withAlpha255?: number): number[] | null {
  try {
    const c = String(hex || '').trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(c)) return null;
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    if (typeof withAlpha255 === 'number' && Number.isFinite(withAlpha255)) {
      return [r, g, b, Math.max(0, Math.min(255, Math.round(withAlpha255)))];
    }
    return [r, g, b];
  } catch (_) {
    return null;
  }
}

// --- Defaults + delta helpers (debug output only) ---
const DEFAULT_HEX_STYLE: any = {
  filled: true,
  stroked: true,
  pickable: true,
  extruded: false,
  opacity: 1,
  getHexagon: '@@=properties.hex',
  getFillColor: {
    '@@function': 'colorContinuous',
    attr: 'cnt',
    steps: 20,
    colors: 'ArmyRose',
    nullColor: [184, 184, 184]
  },
  getLineColor: [255, 255, 255],
  lineWidthMinPixels: 1
};

const DEFAULT_TILE_LAYER: any = {
  minZoom: 0,
  maxZoom: 19,
  zoomOffset: 0
};

const DEFAULT_VECTOR_STYLE: any = {
  filled: true,
  stroked: true,
  pickable: true,
  opacity: 0.8,
  lineWidthMinPixels: 1,
  pointRadiusMinPixels: 6
};

function isPlainObject(x: any) {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!(k in b)) return false;
      if (!deepEqual(a[k], b[k])) return false;
    }
    return true;
  }
  return false;
}

function deepDelta(base: any, cur: any): any {
  // Return only keys in `cur` that differ from `base`.
  if (deepEqual(base, cur)) return undefined;
  if (Array.isArray(cur)) return cur;
  if (!isPlainObject(cur)) return cur;

  const out: any = {};
  for (const k of Object.keys(cur)) {
    const d = deepDelta(base?.[k], cur[k]);
    if (d !== undefined) out[k] = d;
  }
  return Object.keys(out).length ? out : undefined;
}

export function setupDebugPanel(map: mapboxgl.Map, config: FusedMapsConfig): DebugHandle {
  let shell = document.getElementById('debug-shell') as HTMLElement | null;
  if (!shell) {
    shell = document.createElement('div');
    shell.id = 'debug-shell';
    shell.innerHTML = `
      <div id="debug-panel">
        <div id="debug-content">
          <div class="debug-section">
            <div class="debug-section-title">Editing Layer</div>
            <div class="debug-row">
              <span class="debug-label">Layer</span>
              <select class="debug-select" id="dbg-layer-select"></select>
            </div>
          </div>

          <div class="debug-section">
            <div class="debug-section-title">Hex Layer</div>
            <div class="debug-toggles">
              <label class="debug-checkbox"><input type="checkbox" id="dbg-filled" checked /> Filled</label>
              <label class="debug-checkbox"><input type="checkbox" id="dbg-stroked" checked /> Stroked</label>
              <label class="debug-checkbox"><input type="checkbox" id="dbg-extruded" /> Extruded</label>
            </div>
            <div class="debug-row" style="margin-top:8px;">
              <span class="debug-label">Opacity</span>
              <input type="range" class="debug-slider" id="dbg-opacity-slider" min="0" max="1" step="0.05" value="1" />
              <input type="number" class="debug-input debug-input-sm" id="dbg-opacity" step="0.1" min="0" max="1" value="1" />
            </div>
          </div>

          <div class="debug-section" id="fill-color-section">
            <div class="debug-section-title">Fill Color</div>
            <div class="debug-row">
              <span class="debug-label">Function</span>
              <select class="debug-select" id="dbg-fill-fn">
                <option value="colorContinuous">colorContinuous</option>
                <option value="static">Static Color</option>
              </select>
            </div>
            <div id="fill-fn-options">
              <div class="debug-row">
                <span class="debug-label">Attribute</span>
                <select class="debug-select" id="dbg-attr"></select>
              </div>
              <div class="debug-row">
                <span class="debug-label">Palette</span>
                <select class="debug-select pal-hidden" id="dbg-palette"></select>
                <div class="pal-dd" id="dbg-palette-dd">
                  <button type="button" class="pal-trigger" id="dbg-palette-trigger" title="Palette">
                    <span class="pal-name" id="dbg-palette-name">Palette</span>
                    <span class="pal-swatch" id="dbg-palette-swatch"></span>
                  </button>
                  <div class="pal-menu" id="dbg-palette-menu" style="display:none;"></div>
                </div>
              </div>
              <div class="debug-row">
                <span class="debug-label">Domain</span>
                <input type="number" class="debug-input debug-input-sm" id="dbg-domain-min" step="0.1" placeholder="min" />
                <span style="color:#666;">–</span>
                <input type="number" class="debug-input debug-input-sm" id="dbg-domain-max" step="0.1" placeholder="max" />
              </div>
            <div class="debug-row">
              <span class="debug-label"></span>
              <div class="debug-dual-range" aria-label="Domain range">
                <input type="range" class="debug-range-min" id="dbg-domain-range-min" min="0" max="100" step="0.1" value="0" />
                <input type="range" class="debug-range-max" id="dbg-domain-range-max" min="0" max="100" step="0.1" value="100" />
              </div>
            </div>
              <div class="debug-row">
                <span class="debug-label">Steps</span>
                <input type="number" class="debug-input debug-input-sm" id="dbg-steps" step="1" min="2" max="20" value="7" />
              </div>
              <div class="debug-row">
                <span class="debug-label">Null Color</span>
                <input type="color" class="debug-color" id="dbg-null-color" value="#b8b8b8" />
                <span class="debug-color-label" id="dbg-null-color-label">#b8b8b8</span>
              </div>
            </div>
            <div id="fill-static-options" style="display:none;">
              <div class="debug-row">
                <span class="debug-label">Color</span>
                <input type="color" class="debug-color" id="dbg-fill-static" value="#0090ff" />
                <span class="debug-color-label" id="dbg-fill-static-label">#0090ff</span>
              </div>
            </div>
          </div>

          <div class="debug-section" id="line-color-section">
            <div class="debug-section-title">Line Color</div>
            <div class="debug-row">
              <span class="debug-label">Function</span>
              <select class="debug-select" id="dbg-line-fn">
                <option value="colorContinuous">colorContinuous</option>
                <option value="static" selected>Static Color</option>
              </select>
            </div>
            <div id="line-fn-options" style="display:none;">
              <div class="debug-row">
                <span class="debug-label">Attribute</span>
                <select class="debug-select" id="dbg-line-attr"></select>
              </div>
              <div class="debug-row">
                <span class="debug-label">Palette</span>
                <select class="debug-select pal-hidden" id="dbg-line-palette"></select>
                <div class="pal-dd" id="dbg-line-palette-dd">
                  <button type="button" class="pal-trigger" id="dbg-line-palette-trigger" title="Palette">
                    <span class="pal-name" id="dbg-line-palette-name">Palette</span>
                    <span class="pal-swatch" id="dbg-line-palette-swatch"></span>
                  </button>
                  <div class="pal-menu" id="dbg-line-palette-menu" style="display:none;"></div>
                </div>
              </div>
              <div class="debug-row">
                <span class="debug-label">Domain</span>
                <input type="number" class="debug-input debug-input-sm" id="dbg-line-domain-min" step="0.1" placeholder="min" />
                <span style="color:#666;">–</span>
                <input type="number" class="debug-input debug-input-sm" id="dbg-line-domain-max" step="0.1" placeholder="max" />
              </div>
            </div>
            <div id="line-static-options">
              <div class="debug-row">
                <span class="debug-label">Color</span>
                <input type="color" class="debug-color" id="dbg-line-static" value="#ffffff" />
                <span class="debug-color-label" id="dbg-line-static-label">#ffffff</span>
              </div>
              <div class="debug-row">
                <span class="debug-label">Line Width</span>
                <input type="range" class="debug-slider" id="dbg-line-width-slider" min="0" max="5" step="0.5" value="1" />
                <input type="number" class="debug-input debug-input-sm" id="dbg-line-width" step="0.5" min="0" max="10" value="1" />
              </div>
            </div>
          </div>

          <div class="debug-section">
            <div class="debug-section-title">View State</div>
            <div class="debug-row">
              <span class="debug-label">Longitude</span>
              <input type="number" class="debug-input" id="dbg-lng" step="0.0001" />
            </div>
            <div class="debug-row">
              <span class="debug-label">Latitude</span>
              <input type="number" class="debug-input" id="dbg-lat" step="0.0001" />
            </div>
            <div class="debug-row">
              <span class="debug-label">Zoom</span>
              <input type="number" class="debug-input" id="dbg-zoom" step="0.1" min="0" max="22" />
            </div>
            <div class="debug-row">
              <span class="debug-label">Pitch</span>
              <input type="number" class="debug-input" id="dbg-pitch" step="1" min="0" max="85" />
            </div>
            <div class="debug-row">
              <span class="debug-label">Bearing</span>
              <input type="number" class="debug-input" id="dbg-bearing" step="1" />
            </div>
            <div class="debug-row">
              <span class="debug-label"></span>
              <button type="button" class="debug-btn" id="dbg-apply">Apply</button>
              <button type="button" class="debug-btn debug-btn-secondary" id="dbg-copy">Copy current</button>
            </div>
          </div>

          <div class="debug-section" id="sql-section" style="display:none;">
            <div class="debug-section-title">SQL <span id="sql-status" style="float:right;font-weight:normal;color:var(--ui-muted-2);"></span></div>
            <textarea id="dbg-sql" class="debug-output" style="height:60px;font-family:monospace;font-size:11px;resize:vertical;" placeholder="WHERE expression (e.g. data = 111)\n—or—\nFull SQL (SELECT ... FROM data ...)"></textarea>
          </div>

          <div class="debug-section">
            <div class="debug-section-title">Current ViewState</div>
            <textarea id="dbg-view-output" class="debug-output" readonly></textarea>
          </div>

          <div class="debug-section">
            <div class="debug-section-title">Layer Config</div>
            <textarea id="dbg-output" class="debug-output" readonly></textarea>
          </div>
        </div>
        <div id="debug-resize-handle" title="Drag to resize"></div>
      </div>
      <div id="debug-toggle" title="Toggle debug panel">&#x2039;</div>
    `;
    document.body.appendChild(shell);
  }

  const panel = document.getElementById('debug-panel') as HTMLElement;
  const toggle = document.getElementById('debug-toggle') as HTMLElement;
  const resizeHandle = document.getElementById('debug-resize-handle') as HTMLElement;

  const layerSelect = document.getElementById('dbg-layer-select') as HTMLSelectElement;

  const filledEl = document.getElementById('dbg-filled') as HTMLInputElement;
  const strokedEl = document.getElementById('dbg-stroked') as HTMLInputElement;
  const extrudedEl = document.getElementById('dbg-extruded') as HTMLInputElement;
  const opacitySliderEl = document.getElementById('dbg-opacity-slider') as HTMLInputElement;
  const opacityEl = document.getElementById('dbg-opacity') as HTMLInputElement;

  const fillFnEl = document.getElementById('dbg-fill-fn') as HTMLSelectElement;
  const fillFnOptions = document.getElementById('fill-fn-options') as HTMLElement;
  const fillStaticOptions = document.getElementById('fill-static-options') as HTMLElement;
  const fillAttrEl = document.getElementById('dbg-attr') as HTMLSelectElement;
  const fillPaletteEl = document.getElementById('dbg-palette') as HTMLSelectElement;
  const fillPalTrigger = document.getElementById('dbg-palette-trigger') as HTMLButtonElement;
  const fillPalSwatch = document.getElementById('dbg-palette-swatch') as HTMLElement;
  const fillPalMenu = document.getElementById('dbg-palette-menu') as HTMLElement;
  const fillDomainMinEl = document.getElementById('dbg-domain-min') as HTMLInputElement;
  const fillDomainMaxEl = document.getElementById('dbg-domain-max') as HTMLInputElement;
  const fillRangeMinEl = document.getElementById('dbg-domain-range-min') as HTMLInputElement;
  const fillRangeMaxEl = document.getElementById('dbg-domain-range-max') as HTMLInputElement;
  const fillStepsEl = document.getElementById('dbg-steps') as HTMLInputElement;
  const fillNullEl = document.getElementById('dbg-null-color') as HTMLInputElement;
  const fillNullLabel = document.getElementById('dbg-null-color-label') as HTMLElement;
  const fillStaticEl = document.getElementById('dbg-fill-static') as HTMLInputElement;
  const fillStaticLabel = document.getElementById('dbg-fill-static-label') as HTMLElement;

  const lineFnEl = document.getElementById('dbg-line-fn') as HTMLSelectElement;
  const lineFnOptions = document.getElementById('line-fn-options') as HTMLElement;
  const lineStaticOptions = document.getElementById('line-static-options') as HTMLElement;
  const lineAttrEl = document.getElementById('dbg-line-attr') as HTMLSelectElement;
  const linePaletteEl = document.getElementById('dbg-line-palette') as HTMLSelectElement;
  const linePalTrigger = document.getElementById('dbg-line-palette-trigger') as HTMLButtonElement;
  const linePalSwatch = document.getElementById('dbg-line-palette-swatch') as HTMLElement;
  const linePalMenu = document.getElementById('dbg-line-palette-menu') as HTMLElement;
  const lineDomainMinEl = document.getElementById('dbg-line-domain-min') as HTMLInputElement;
  const lineDomainMaxEl = document.getElementById('dbg-line-domain-max') as HTMLInputElement;
  const lineStaticEl = document.getElementById('dbg-line-static') as HTMLInputElement;
  const lineStaticLabel = document.getElementById('dbg-line-static-label') as HTMLElement;
  const lineWidthSliderEl = document.getElementById('dbg-line-width-slider') as HTMLInputElement;
  const lineWidthEl = document.getElementById('dbg-line-width') as HTMLInputElement;

  const lngEl = document.getElementById('dbg-lng') as HTMLInputElement;
  const latEl = document.getElementById('dbg-lat') as HTMLInputElement;
  const zoomEl = document.getElementById('dbg-zoom') as HTMLInputElement;
  const pitchEl = document.getElementById('dbg-pitch') as HTMLInputElement;
  const bearingEl = document.getElementById('dbg-bearing') as HTMLInputElement;
  const viewOut = document.getElementById('dbg-view-output') as HTMLTextAreaElement;
  const layerOut = document.getElementById('dbg-output') as HTMLTextAreaElement;

  const sqlSection = document.getElementById('sql-section') as HTMLElement;
  const sqlStatusEl = document.getElementById('sql-status') as HTMLElement;
  const sqlInputEl = document.getElementById('dbg-sql') as HTMLTextAreaElement;

  const initial: ViewState = config.initialViewState;

  const palettes = Object.keys((window as any).cartocolor || {}).sort((a, b) => a.localeCompare(b));
  const setPaletteOptions = (sel: HTMLSelectElement) => {
    sel.innerHTML = palettes.map((p) => `<option value="${p}">${p}</option>`).join('');
  };
  setPaletteOptions(fillPaletteEl);
  setPaletteOptions(linePaletteEl);

  const getPaletteColors = (name: string, steps: number): string[] | null => {
    try {
      const pal = (window as any).cartocolor?.[name];
      if (!pal) return null;
      const keys = Object.keys(pal)
        .map((x: any) => Number(x))
        .filter((n: number) => Number.isFinite(n))
        .sort((a: number, b: number) => a - b);
      const best = keys.find((n: number) => n >= steps) ?? keys[keys.length - 1];
      const cols = pal[best];
      return Array.isArray(cols) ? [...cols] : null;
    } catch (_) {
      return null;
    }
  };

  const paletteGradient = (paletteName: string, steps = 9): string => {
    const cols = getPaletteColors(paletteName, Math.max(steps, 3));
    if (!cols?.length) return 'linear-gradient(90deg, #555, #999)';
    const g = cols.map((c: string, i: number) => `${c} ${(i / Math.max(1, cols.length - 1)) * 100}%`).join(', ');
    return `linear-gradient(90deg, ${g})`;
  };

  const updatePalSwatch = (sel: HTMLSelectElement, swatchEl: HTMLElement, triggerEl: HTMLButtonElement) => {
    const name = sel.value || 'Palette';
    swatchEl.style.background = paletteGradient(name);
    triggerEl.title = name;
  };

  const closeMenus = () => {
    try { fillPalMenu.style.display = 'none'; } catch (_) {}
    try { linePalMenu.style.display = 'none'; } catch (_) {}
  };

  const buildPalMenu = (
    sel: HTMLSelectElement,
    menuEl: HTMLElement,
    swatchEl: HTMLElement,
    triggerEl: HTMLButtonElement
  ) => {
    menuEl.innerHTML = palettes
      .map((p) => {
        const bg = paletteGradient(p);
        return `<div class="pal-item" data-pal="${p}" title="${p}">
          <div class="pal-item-swatch" style="background:${bg};"></div>
        </div>`;
      })
      .join('');
    menuEl.querySelectorAll('.pal-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
        const pal = (el as HTMLElement).getAttribute('data-pal') || '';
        if (pal) sel.value = pal;
        updatePalSwatch(sel, swatchEl, triggerEl);
        menuEl.style.display = 'none';
        applyUIToLayer();
      });
    });
  };

  const attachPalDropdown = (
    sel: HTMLSelectElement,
    menuEl: HTMLElement,
    swatchEl: HTMLElement,
    triggerEl: HTMLButtonElement
  ) => {
    buildPalMenu(sel, menuEl, swatchEl, triggerEl);
    updatePalSwatch(sel, swatchEl, triggerEl);
    triggerEl.addEventListener('click', (e) => {
      try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
      const isOpen = menuEl.style.display !== 'none';
      closeMenus();
      menuEl.style.display = isOpen ? 'none' : 'block';
    });
  };

  // Close palette menus when clicking elsewhere
  const onDocClick = () => closeMenus();
  document.addEventListener('click', onDocClick);
  window.addEventListener('blur', onDocClick);

  // Find editable layers.
  // Note: originally this panel was hex-only; we also support vector layers now so the default UDF (points) can be edited.
  const editableLayers = config.layers.filter((l) => l.layerType === 'hex' || l.layerType === 'vector') as any[];
  layerSelect.innerHTML = editableLayers.map((l) => `<option value="${l.id}">${l.name || l.id}</option>`).join('');
  if (!layerSelect.value && editableLayers.length) layerSelect.value = editableLayers[0].id;

  const getActiveLayer = (): (HexLayerConfig | VectorLayerConfig) | null => {
    const id = layerSelect.value;
    const l = editableLayers.find((x) => x.id === id) || null;
    return l;
  };

  const rebuildDeck = () => {
    try {
      // hex tile overlay stores a rebuild helper on the MapboxOverlay instance
      const overlay = (config as any).__deckOverlay || null;
      const state = (overlay as any)?.__fused_hex_tiles__;
      state?.rebuild?.();
    } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent('fusedmaps:legend:update'));
    } catch (_) {}
  };

  // We don't have direct access to deckOverlay in config; instead we locate it on the map's controls list.
  const findDeckOverlayOnMap = () => {
    try {
      const controls = (map as any)._controls || [];
      const deck = controls.find((c: any) => c && c.__fused_hex_tiles__);
      (config as any).__deckOverlay = deck || (config as any).__deckOverlay;
    } catch (_) {}
  };
  findDeckOverlayOnMap();

  const updateLayerOutput = () => {
    try {
      const layer: any = getActiveLayer();
      if (!layer) {
        layerOut.value = '';
        return;
      }

      // Paste-back config (short):
      // show a minimal `{ vectorLayer: {...} }` / `{ hexLayer: {...}, tileLayer?: {...} }`
      // that can be pasted back into the Python UDF as `config=...`.
      const MAX_STRINGIFY_CHARS = 200_000;

      if (layer.layerType === 'vector') {
        const vl = layer.vectorLayer || {};
        const delta = deepDelta(DEFAULT_VECTOR_STYLE, vl) || {};
        // Always keep output paste-back friendly
        let s = JSON.stringify({ vectorLayer: delta }, null, 2);
        if (s.length > MAX_STRINGIFY_CHARS) {
          s = s.slice(0, MAX_STRINGIFY_CHARS) + '\n... (truncated)\n';
        }
        layerOut.value = s;
        return;
      }

      if (layer.layerType === 'hex') {
        const hl = layer.hexLayer || {};
        const outHex: any = { hexLayer: deepDelta(DEFAULT_HEX_STYLE, hl) || {} };
        if ((layer as any).isTileLayer) {
          const tl = (layer as any).tileLayerConfig || (layer as any).tileLayer || null;
          if (tl && typeof tl === 'object') {
            const dt = deepDelta(DEFAULT_TILE_LAYER, tl);
            if (dt && Object.keys(dt).length) outHex.tileLayer = dt;
          }
        }
        let s = JSON.stringify(outHex, null, 2);
        if (s.length > MAX_STRINGIFY_CHARS) {
          s = s.slice(0, MAX_STRINGIFY_CHARS) + '\n... (truncated)\n';
        }
        layerOut.value = s;
        return;
      }

      const out: any = { ...layer };
      // SQL UX: allow shorthand "WHERE ..." expressions but surface the resolved full query for clarity.
      try {
        const sqlRaw = typeof layer.sql === 'string' ? layer.sql.trim() : '';
        if (sqlRaw) {
          const isSelectLike = /^(with|select)\b/i.test(sqlRaw);
          out.sql = sqlRaw;
          out.sqlResolved = isSelectLike ? sqlRaw : `SELECT * FROM data WHERE (${sqlRaw || '1=1'})`;
        }
      } catch (_) {}

      if (Array.isArray(layer.data)) {
        out.rowCount = layer.data.length;
        out.dataPreview = layer.data.slice(0, 50);
        if (layer.data.length > 50) out.dataPreviewTruncated = true;
        delete out.data;
      }

      // If any geojson snuck in, truncate similarly.
      if (out.geojson && out.geojson.features && Array.isArray(out.geojson.features)) {
        out.geojson = {
          type: out.geojson.type,
          rowCount: out.geojson.features.length,
          featuresPreview: out.geojson.features.slice(0, Math.min(10, out.geojson.features.length))
        };
        out.geojsonPreviewTruncated = out.geojson.featuresPreview.length < (layer.geojson?.features?.length || 0);
      }

      let s = JSON.stringify(out, null, 2);
      if (s.length > MAX_STRINGIFY_CHARS) {
        s = s.slice(0, MAX_STRINGIFY_CHARS) + '\n... (truncated)\n';
      }
      layerOut.value = s;
    } catch (_) {
      layerOut.value = '';
    }
  };

  const updateFillFnOptions = () => {
    const fn = fillFnEl.value;
    fillFnOptions.style.display = fn === 'colorContinuous' ? 'block' : 'none';
    fillStaticOptions.style.display = fn === 'static' ? 'block' : 'none';
  };

  const updateLineFnOptions = () => {
    const fn = lineFnEl.value;
    lineFnOptions.style.display = fn === 'colorContinuous' ? 'block' : 'none';
    lineStaticOptions.style.display = fn === 'static' ? 'block' : 'none';
  };

  const readLayerToUI = () => {
    const layer = getActiveLayer();
    if (!layer) return;
    const isHex = (layer as any).layerType === 'hex';
    const isVector = (layer as any).layerType === 'vector';
    const hexCfg: any = isHex ? ((layer as any).hexLayer || {}) : {};

    // Basic toggles
    if (isHex) {
      filledEl.checked = hexCfg.filled !== false;
      strokedEl.checked = hexCfg.stroked !== false;
      extrudedEl.checked = hexCfg.extruded === true;
    } else {
      // vector: treat filled/stroked as on/off hints; extruded doesn't apply
      filledEl.checked = (layer as any).isFilled !== false;
      strokedEl.checked = (layer as any).isStroked !== false;
      extrudedEl.checked = false;
    }

    const op = isHex
      ? (typeof hexCfg.opacity === 'number' ? hexCfg.opacity : 1)
      : (typeof (layer as any).opacity === 'number' ? (layer as any).opacity : 0.9);
    opacitySliderEl.value = String(op);
    opacityEl.value = String(op);

    // Fill
    if (isHex) {
      const fc: any = hexCfg.getFillColor;
      const cc = ensureColorContinuousCfg(fc);
      if (cc) {
        fillFnEl.value = 'colorContinuous';
        fillAttrEl.innerHTML = getAttrCandidates(layer as any).map((a) => `<option value="${a}">${a}</option>`).join('');
        if (cc.attr) fillAttrEl.value = String(cc.attr);
        if (cc.colors) fillPaletteEl.value = String(cc.colors);
        updatePalSwatch(fillPaletteEl, fillPalSwatch, fillPalTrigger);
        const dom = Array.isArray(cc.domain) ? cc.domain : [0, 1];
        fillDomainMinEl.value = fmt(Number(dom[0]), 2);
        fillDomainMaxEl.value = fmt(Number(dom[1]), 2);
        // Keep dual slider aligned with inputs (map_utils style)
        try {
          const dmin = Math.min(Number(dom[0]), Number(dom[1]));
          const dmax = Math.max(Number(dom[0]), Number(dom[1]));
          if (Number.isFinite(dmin) && Number.isFinite(dmax)) {
            fillRangeMinEl.min = String(dmin);
            fillRangeMinEl.max = String(dmax);
            fillRangeMaxEl.min = String(dmin);
            fillRangeMaxEl.max = String(dmax);
            fillRangeMinEl.step = '0.1';
            fillRangeMaxEl.step = '0.1';
            fillRangeMinEl.value = String(Number(dom[0]));
            fillRangeMaxEl.value = String(Number(dom[1]));
          }
        } catch (_) {}
        fillStepsEl.value = String(cc.steps ?? 7);
        const nc = Array.isArray(cc.nullColor) ? cc.nullColor : [184, 184, 184];
        const hex = `#${nc.slice(0, 3).map((x: any) => clamp(Number(x), 0, 255).toString(16).padStart(2, '0')).join('')}`;
        fillNullEl.value = hex;
        fillNullLabel.textContent = hex;
      } else if (Array.isArray(fc)) {
        fillFnEl.value = 'static';
        const arr = fc as any[];
        const hex = `#${arr.slice(0, 3).map((x) => clamp(Number(x), 0, 255).toString(16).padStart(2, '0')).join('')}`;
        fillStaticEl.value = hex;
        fillStaticLabel.textContent = hex;
      } else {
        fillFnEl.value = 'colorContinuous';
      }
    } else if (isVector) {
      const v = layer as any;
      const attrs = getVectorAttrCandidates(layer as any);
      fillAttrEl.innerHTML = attrs.map((a) => `<option value="${a}">${a}</option>`).join('');
      const fcCfg = v.fillColorConfig;
      if (fcCfg && typeof fcCfg === 'object' && fcCfg['@@function'] === 'colorContinuous') {
        fillFnEl.value = 'colorContinuous';
        if (fcCfg.attr) fillAttrEl.value = String(fcCfg.attr);
        if (fcCfg.colors) fillPaletteEl.value = String(fcCfg.colors);
        updatePalSwatch(fillPaletteEl, fillPalSwatch, fillPalTrigger);
        const dom = Array.isArray(fcCfg.domain) ? fcCfg.domain : [0, 1];
        fillDomainMinEl.value = fmt(Number(dom[0]), 2);
        fillDomainMaxEl.value = fmt(Number(dom[1]), 2);
        fillStepsEl.value = String(fcCfg.steps ?? 7);
        const nc = Array.isArray(fcCfg.nullColor) ? fcCfg.nullColor : [184, 184, 184];
        const hex = `#${nc.slice(0, 3).map((x: any) => clamp(Number(x), 0, 255).toString(16).padStart(2, '0')).join('')}`;
        fillNullEl.value = hex;
        fillNullLabel.textContent = hex;
      } else {
        fillFnEl.value = 'static';
        // best-effort: derive picker from rgba if possible, else keep default
        fillStaticEl.value = '#0090ff';
        fillStaticLabel.textContent = fillStaticEl.value;
      }
    }

    // Line
    if (isHex) {
      const lc: any = hexCfg.getLineColor;
      const lcCC = ensureColorContinuousCfg(lc);
      if (lcCC) {
        lineFnEl.value = 'colorContinuous';
        lineAttrEl.innerHTML = getAttrCandidates(layer as any).map((a) => `<option value="${a}">${a}</option>`).join('');
        if (lcCC.attr) lineAttrEl.value = String(lcCC.attr);
        if (lcCC.colors) linePaletteEl.value = String(lcCC.colors);
        updatePalSwatch(linePaletteEl, linePalSwatch, linePalTrigger);
        const dom = Array.isArray(lcCC.domain) ? lcCC.domain : [0, 1];
        lineDomainMinEl.value = fmt(Number(dom[0]), 2);
        lineDomainMaxEl.value = fmt(Number(dom[1]), 2);
      } else if (Array.isArray(lc)) {
        lineFnEl.value = 'static';
        const arr = lc as any[];
        const hex = `#${arr.slice(0, 3).map((x) => clamp(Number(x), 0, 255).toString(16).padStart(2, '0')).join('')}`;
        lineStaticEl.value = hex;
        lineStaticLabel.textContent = hex;
      } else {
        lineFnEl.value = 'static';
      }
    } else if (isVector) {
      const v = layer as any;
      const attrs = getVectorAttrCandidates(layer as any);
      lineAttrEl.innerHTML = attrs.map((a) => `<option value="${a}">${a}</option>`).join('');
      const lcCfg = v.lineColorConfig;
      if (lcCfg && typeof lcCfg === 'object' && lcCfg['@@function'] === 'colorContinuous') {
        lineFnEl.value = 'colorContinuous';
        if (lcCfg.attr) lineAttrEl.value = String(lcCfg.attr);
        if (lcCfg.colors) linePaletteEl.value = String(lcCfg.colors);
        updatePalSwatch(linePaletteEl, linePalSwatch, linePalTrigger);
        const dom = Array.isArray(lcCfg.domain) ? lcCfg.domain : [0, 1];
        lineDomainMinEl.value = fmt(Number(dom[0]), 2);
        lineDomainMaxEl.value = fmt(Number(dom[1]), 2);
      } else {
        lineFnEl.value = 'static';
      }
    }

    const lw = isHex ? (hexCfg.lineWidthMinPixels ?? 1) : ((layer as any).lineWidth ?? 1);
    lineWidthSliderEl.value = String(lw);
    lineWidthEl.value = String(lw);

    updateFillFnOptions();
    updateLineFnOptions();
    updateLayerOutput();

    // SQL (DuckDB) section: only for non-tile hex layers that have parquetData/parquetUrl
    try {
      const isSql = layer.layerType === 'hex' && !(layer as any).isTileLayer && (!!(layer as any).parquetData || !!(layer as any).parquetUrl);
      if (sqlSection) sqlSection.style.display = isSql ? 'block' : 'none';
      if (sqlInputEl && isSql) {
        sqlInputEl.value = String((layer as any).sql || 'SELECT * FROM data');
      }
      if (sqlStatusEl) sqlStatusEl.textContent = '';
    } catch (_) {}
  };

  const applyUIToLayer = () => {
    const layer = getActiveLayer();
    if (!layer) return;
    const isHex = (layer as any).layerType === 'hex';
    const isVector = (layer as any).layerType === 'vector';

    if (isHex) {
      (layer as any).hexLayer = (layer as any).hexLayer || {};
    }
    const hexCfg: any = isHex ? (layer as any).hexLayer : {};

    const op = parseFloat(opacityEl.value);
    const opClamped = Number.isFinite(op) ? clamp(op, 0, 1) : 1;

    if (isHex) {
      hexCfg.filled = !!filledEl.checked;
      hexCfg.stroked = !!strokedEl.checked;
      hexCfg.extruded = !!extrudedEl.checked;
      hexCfg.opacity = opClamped;
    } else if (isVector) {
      (layer as any).isFilled = !!filledEl.checked;
      (layer as any).isStroked = !!strokedEl.checked;
      (layer as any).opacity = opClamped;
      try { (layer as any).vectorLayer = { ...((layer as any).vectorLayer || {}), filled: !!filledEl.checked, stroked: !!strokedEl.checked, opacity: opClamped }; } catch (_) {}
    }

    // Fill
    if (isHex) {
      if (fillFnEl.value === 'static') {
        const c = fillStaticEl.value || '#0090ff';
        const r = parseInt(c.slice(1, 3), 16);
        const g = parseInt(c.slice(3, 5), 16);
        const b = parseInt(c.slice(5, 7), 16);
        hexCfg.getFillColor = [r, g, b];
      } else {
        const attr = fillAttrEl.value || 'data_avg';
        const colors = fillPaletteEl.value || 'Earth';
        const d0 = parseFloat(fillDomainMinEl.value);
        const d1 = parseFloat(fillDomainMaxEl.value);
        const steps = parseInt(fillStepsEl.value || '7', 10);
        const nc = fillNullEl.value || '#b8b8b8';
        const nr = parseInt(nc.slice(1, 3), 16);
        const ng = parseInt(nc.slice(3, 5), 16);
        const nb = parseInt(nc.slice(5, 7), 16);
        hexCfg.getFillColor = {
          '@@function': 'colorContinuous',
          attr,
          domain: [Number.isFinite(d0) ? d0 : 0, Number.isFinite(d1) ? d1 : 1],
          colors,
          steps: Number.isFinite(steps) ? steps : 7,
          nullColor: [nr, ng, nb],
          // Default to autoDomain unless user explicitly overrides the domain (see domain handlers below).
          autoDomain: (hexCfg.getFillColor?.autoDomain !== false)
        };
      }
    } else if (isVector) {
      if (fillFnEl.value === 'static') {
        const c = fillStaticEl.value || '#0090ff';
        (layer as any).fillColorConfig = null;
        (layer as any).fillColorRgba = c;
        try {
          const arr = hexToRgbArr(c, 200) || hexToRgbArr(c) || null;
          if ((layer as any).vectorLayer) (layer as any).vectorLayer.getFillColor = arr || c;
        } catch (_) {}
      } else {
        const attr = fillAttrEl.value || 'house_age';
        const colors = fillPaletteEl.value || 'ArmyRose';
        const d0 = parseFloat(fillDomainMinEl.value);
        const d1 = parseFloat(fillDomainMaxEl.value);
        const steps = parseInt(fillStepsEl.value || '7', 10);
        const nc = fillNullEl.value || '#b8b8b8';
        const nr = parseInt(nc.slice(1, 3), 16);
        const ng = parseInt(nc.slice(3, 5), 16);
        const nb = parseInt(nc.slice(5, 7), 16);
        (layer as any).fillColorRgba = null;
        const cfgObj = {
          '@@function': 'colorContinuous',
          attr,
          domain: [Number.isFinite(d0) ? d0 : 0, Number.isFinite(d1) ? d1 : 1],
          colors,
          steps: Number.isFinite(steps) ? steps : 7,
          nullColor: [nr, ng, nb],
        };
        (layer as any).fillColorConfig = cfgObj;
        try {
          if ((layer as any).vectorLayer) (layer as any).vectorLayer.getFillColor = cfgObj;
        } catch (_) {}
      }
    }

    // Line
    if (isHex) {
      if (lineFnEl.value === 'static') {
        const c = lineStaticEl.value || '#ffffff';
        const r = parseInt(c.slice(1, 3), 16);
        const g = parseInt(c.slice(3, 5), 16);
        const b = parseInt(c.slice(5, 7), 16);
        hexCfg.getLineColor = [r, g, b];
      } else {
        const attr = lineAttrEl.value || 'data_avg';
        const colors = linePaletteEl.value || 'Earth';
        const d0 = parseFloat(lineDomainMinEl.value);
        const d1 = parseFloat(lineDomainMaxEl.value);
        hexCfg.getLineColor = {
          '@@function': 'colorContinuous',
          attr,
          domain: [Number.isFinite(d0) ? d0 : 0, Number.isFinite(d1) ? d1 : 1],
          colors,
          steps: parseInt(fillStepsEl.value || '7', 10) || 7,
          autoDomain: (hexCfg.getLineColor?.autoDomain !== false)
        };
      }
    } else if (isVector) {
      if (lineFnEl.value === 'static') {
        const c = lineStaticEl.value || '#ffffff';
        (layer as any).lineColorConfig = null;
        (layer as any).lineColorRgba = c;
        try {
          const arr = hexToRgbArr(c, 255) || hexToRgbArr(c) || null;
          if ((layer as any).vectorLayer) (layer as any).vectorLayer.getLineColor = arr || c;
        } catch (_) {}
      } else {
        const attr = lineAttrEl.value || 'house_age';
        const colors = linePaletteEl.value || 'ArmyRose';
        const d0 = parseFloat(lineDomainMinEl.value);
        const d1 = parseFloat(lineDomainMaxEl.value);
        (layer as any).lineColorRgba = null;
        const cfgObj = {
          '@@function': 'colorContinuous',
          attr,
          domain: [Number.isFinite(d0) ? d0 : 0, Number.isFinite(d1) ? d1 : 1],
          colors,
          steps: parseInt(fillStepsEl.value || '7', 10) || 7,
        };
        (layer as any).lineColorConfig = cfgObj;
        try {
          if ((layer as any).vectorLayer) (layer as any).vectorLayer.getLineColor = cfgObj;
        } catch (_) {}
      }
    }

    const lw = parseFloat(lineWidthEl.value);
    const lwClamped = Number.isFinite(lw) ? clamp(lw, 0, 10) : 1;
    if (isHex) {
      hexCfg.lineWidthMinPixels = lwClamped;
    } else if (isVector) {
      (layer as any).lineWidth = lwClamped;
      try {
        if ((layer as any).vectorLayer) (layer as any).vectorLayer.lineWidthMinPixels = lwClamped;
      } catch (_) {}
    }

    updateLayerOutput();
    findDeckOverlayOnMap();
    rebuildDeck();

    // Non-tile hex layers are Mapbox GL layers, not Deck.gl. Rebuild them so UI edits apply.
    try {
      const isStaticHex = layer.layerType === 'hex' && !(layer as any).isTileLayer;
      if (isStaticHex) {
        // SQL-backed hex layers no longer keep `layer.data`; their latest geometry lives in `layerGeoJSONs`.
        const isSql = !!(layer as any).parquetData || !!(layer as any).parquetUrl;
        const g = isSql
          ? (getLayerGeoJSONs()?.[layer.id] || ({ type: 'FeatureCollection', features: [] } as any))
          : hexToGeoJSON((layer as any).data || []);
        const visible = getCurrentLayerVisibility(map, layer.id);
        updateStaticHexLayer(map, layer as HexLayerConfig, g, visible);
      }
    } catch (_) {}

    // Vector layers are Mapbox GL layers. Update paint properties directly so edits apply instantly.
    try {
      if (isVector) {
        const v: any = layer as any;
        const geojson = v.geojson;
        const vecData = geojson?.features?.map((f: any) => f?.properties || {}) || [];

        const fillExpr = (v.fillColorConfig as any)?.['@@function']
          ? buildColorExpr(v.fillColorConfig, vecData)
          : (v.fillColorRgba || '#0090ff');

        const lineExpr = (v.lineColorConfig as any)?.['@@function']
          ? buildColorExpr(v.lineColorConfig, vecData)
          : (v.lineColorRgba || '#ffffff');

        const fillOpacity = (v.isFilled === false) ? 0 : opClamped;
        const lineOpacity = (v.isStroked === false) ? 0 : 1;

        // Polygons
        setPaintSafe(map, `${v.id}-fill`, 'fill-color', fillExpr);
        setPaintSafe(map, `${v.id}-fill`, 'fill-opacity', fillOpacity);
        setPaintSafe(map, `${v.id}-outline`, 'line-color', lineExpr);
        setPaintSafe(map, `${v.id}-outline`, 'line-width', lwClamped);
        setPaintSafe(map, `${v.id}-outline`, 'line-opacity', lineOpacity);

        // Lines
        setPaintSafe(map, `${v.id}-line`, 'line-color', lineExpr);
        setPaintSafe(map, `${v.id}-line`, 'line-width', lwClamped);
        setPaintSafe(map, `${v.id}-line`, 'line-opacity', lineOpacity);

        // Points (circle)
        setPaintSafe(map, `${v.id}-circle`, 'circle-color', fillExpr);
        setPaintSafe(map, `${v.id}-circle`, 'circle-opacity', fillOpacity);
        setPaintSafe(map, `${v.id}-circle`, 'circle-stroke-color', lineExpr);
        setPaintSafe(map, `${v.id}-circle`, 'circle-stroke-width', lwClamped);
      }
    } catch (_) {}
  };

  // Domain slider behavior (map_utils style)
  const syncDomainSliderFromInputs = () => {
    const minV = parseFloat(fillDomainMinEl.value);
    const maxV = parseFloat(fillDomainMaxEl.value);
    if (Number.isFinite(minV)) fillRangeMinEl.value = String(minV);
    if (Number.isFinite(maxV)) fillRangeMaxEl.value = String(maxV);
  };

  const syncDomainInputsFromSlider = () => {
    let a = parseFloat(fillRangeMinEl.value);
    let b = parseFloat(fillRangeMaxEl.value);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;
    if (a > b) [a, b] = [b, a];
    fillRangeMinEl.value = String(a);
    fillRangeMaxEl.value = String(b);
    fillDomainMinEl.value = String(a);
    fillDomainMaxEl.value = String(b);
  };

  const markDomainFromUser = () => {
    const layer = getActiveLayer();
    if (!layer) return;
    // This flag is checked by the tile autoDomain logic to avoid overwriting user edits.
    (layer as any).fillDomainFromUser = true;
    // Only hex layers have autoDomain behavior (tile autoDomain + SQL legend stats).
    try {
      if ((layer as any).layerType !== 'hex') return;
      const hc: any = (layer as any).hexLayer || {};
      if (hc.getFillColor && typeof hc.getFillColor === 'object') {
        hc.getFillColor.autoDomain = false;
        try { delete hc.getFillColor._dynamicDomain; } catch (_) {}
      }
      if (hc.getLineColor && typeof hc.getLineColor === 'object') {
        hc.getLineColor.autoDomain = false;
        try { delete hc.getLineColor._dynamicDomain; } catch (_) {}
      }
    } catch (_) {}
  };

  const onDomainSliderInput = () => {
    // While dragging: update only the input boxes
    syncDomainInputsFromSlider();
  };

  const onDomainSliderChange = () => {
    // On mouseup/touchend: apply once + lock out autoDomain
    syncDomainInputsFromSlider();
    markDomainFromUser();
    applyUIToLayer();
  };

  // ViewState updates: update output on map stop (moveend/rotateend/pitchend)
  const updateFromMapStop = () => {
    try {
      const vs = getViewState(map);
      viewOut.value = JSON.stringify(vs, null, 2);
      if (shell && isEditingInputs(shell)) return;
      lngEl.value = fmt(vs.longitude, 5);
      latEl.value = fmt(vs.latitude, 5);
      zoomEl.value = fmt(vs.zoom, 2);
      pitchEl.value = fmt(vs.pitch ?? 0, 1);
      bearingEl.value = fmt(vs.bearing ?? 0, 1);
    } catch (_) {}
  };

  const applyView = () => {
    const lng = parseFloat(lngEl.value);
    const lat = parseFloat(latEl.value);
    const zoom = parseFloat(zoomEl.value);
    const pitch = parseFloat(pitchEl.value);
    const bearing = parseFloat(bearingEl.value);
    try {
      map.jumpTo({
        center: [
          Number.isFinite(lng) ? lng : initial.longitude,
          Number.isFinite(lat) ? lat : initial.latitude
        ],
        zoom: Number.isFinite(zoom) ? zoom : map.getZoom(),
        pitch: Number.isFinite(pitch) ? pitch : map.getPitch(),
        bearing: Number.isFinite(bearing) ? bearing : map.getBearing()
      } as any);
    } catch (_) {}
  };

  const copyCurrent = async () => {
    try {
      await navigator.clipboard.writeText(viewOut.value || '');
    } catch (_) {}
  };

  const onToggle = () => {
    const collapsed = panel.classList.toggle('collapsed');
    toggle.innerHTML = collapsed ? '&#x203A;' : '&#x2039;';
    updateDebugTogglePosition(shell!, panel, toggle);
  };

  const onApplyView = (e: any) => {
    try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
    applyView();
  };
  const onCopy = async (e: any) => {
    try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
    await copyCurrent();
  };

  // Resize handle (sticky toggle)
  let resizing = false;
  let startX = 0;
  let startW = 280;
  const onResizeMove = (e: PointerEvent) => {
    if (!resizing) return;
    const dx = e.clientX - startX;
    const w = clamp(startW + dx, 240, 520);
    panel.style.width = `${w}px`;
    updateDebugTogglePosition(shell!, panel, toggle);
    e.preventDefault();
  };
  const onResizeUp = (_e: PointerEvent) => {
    if (!resizing) return;
    resizing = false;
    window.removeEventListener('pointermove', onResizeMove as any);
    window.removeEventListener('pointerup', onResizeUp as any);
  };
  const onResizeDown = (e: PointerEvent) => {
    resizing = true;
    startX = e.clientX;
    startW = panel.getBoundingClientRect().width || 280;
    window.addEventListener('pointermove', onResizeMove as any, { passive: false });
    window.addEventListener('pointerup', onResizeUp as any);
    e.preventDefault();
    e.stopPropagation();
  };

  // Event wiring
  toggle.addEventListener('click', onToggle);
  (document.getElementById('dbg-apply') as HTMLElement).addEventListener('click', onApplyView);
  (document.getElementById('dbg-copy') as HTMLElement).addEventListener('click', onCopy);
  resizeHandle.addEventListener('pointerdown', onResizeDown as any, { passive: false });

  // Layer editor events
  layerSelect.addEventListener('change', () => readLayerToUI());
  fillFnEl.addEventListener('change', () => { updateFillFnOptions(); applyUIToLayer(); });
  lineFnEl.addEventListener('change', () => { updateLineFnOptions(); applyUIToLayer(); });
  [filledEl, strokedEl, extrudedEl].forEach((el) => el.addEventListener('change', applyUIToLayer));
  opacitySliderEl.addEventListener('input', () => { opacityEl.value = opacitySliderEl.value; applyUIToLayer(); });
  opacityEl.addEventListener('change', () => { opacitySliderEl.value = opacityEl.value; applyUIToLayer(); });
  [fillAttrEl, fillStepsEl].forEach((el) => el.addEventListener('change', applyUIToLayer));
  // Domain inputs -> slider (no repaint while typing)
  fillDomainMinEl.addEventListener('input', () => { syncDomainSliderFromInputs(); });
  fillDomainMaxEl.addEventListener('input', () => { syncDomainSliderFromInputs(); });
  // Enter/blur -> apply + disable autoDomain so it won't revert
  fillDomainMinEl.addEventListener('change', () => { markDomainFromUser(); applyUIToLayer(); });
  fillDomainMaxEl.addEventListener('change', () => { markDomainFromUser(); applyUIToLayer(); });
  // Slider -> inputs (no repaint while dragging; repaint once on change)
  fillRangeMinEl.addEventListener('input', onDomainSliderInput);
  fillRangeMaxEl.addEventListener('input', onDomainSliderInput);
  fillRangeMinEl.addEventListener('change', onDomainSliderChange);
  fillRangeMaxEl.addEventListener('change', onDomainSliderChange);
  fillNullEl.addEventListener('input', () => { fillNullLabel.textContent = fillNullEl.value; applyUIToLayer(); });
  fillStaticEl.addEventListener('input', () => { fillStaticLabel.textContent = fillStaticEl.value; applyUIToLayer(); });
  [lineAttrEl, lineDomainMinEl, lineDomainMaxEl].forEach((el) => el.addEventListener('change', applyUIToLayer));
  lineStaticEl.addEventListener('input', () => { lineStaticLabel.textContent = lineStaticEl.value; applyUIToLayer(); });
  lineWidthSliderEl.addEventListener('input', () => { lineWidthEl.value = lineWidthSliderEl.value; applyUIToLayer(); });
  lineWidthEl.addEventListener('change', () => { lineWidthSliderEl.value = lineWidthEl.value; applyUIToLayer(); });

  // SQL editor (debounced, live)
  let sqlTypingTimer: any = null;
  const scheduleSql = () => {
    const layer = getActiveLayer();
    if (!layer) return;
    const isSql = layer.layerType === 'hex' && !(layer as any).isTileLayer && (!!(layer as any).parquetData || !!(layer as any).parquetUrl);
    if (!isSql) return;
    const sql = String(sqlInputEl?.value || '').trim() || 'SELECT * FROM data';
    // Normalize away trailing newlines so the config output stays stable/readable.
    try { if (sqlInputEl) sqlInputEl.value = sql; } catch (_) {}
    (layer as any).sql = sql;
    try { updateLayerOutput(); } catch (_) {}
    if (sqlStatusEl) sqlStatusEl.textContent = 'typing...';
    clearTimeout(sqlTypingTimer);
    sqlTypingTimer = setTimeout(() => {
      try {
        window.dispatchEvent(new CustomEvent('fusedmaps:sql:update', { detail: { layerId: layer.id, sql } }));
      } catch (_) {}
    }, 500);
  };
  try {
    sqlInputEl?.addEventListener('input', scheduleSql);
  } catch (_) {}

  // SQL status updates from runtime
  const onSqlStatus = (evt: any) => {
    try {
      const d = evt?.detail || {};
      const layerId = String(d.layerId || '');
      const status = String(d.status || '');
      const active = getActiveLayer();
      if (!active || active.id !== layerId) return;
      if (sqlStatusEl) sqlStatusEl.textContent = status;
    } catch (_) {}
  };
  try {
    window.addEventListener('fusedmaps:sql:status', onSqlStatus as any);
  } catch (_) {}

  // Update viewstate only on "stop"
  try {
    map.on('moveend', updateFromMapStop);
    map.on('rotateend', updateFromMapStop);
    map.on('pitchend', updateFromMapStop);
  } catch (_) {}

  // Initial render
  updateFillFnOptions();
  updateLineFnOptions();
  attachPalDropdown(fillPaletteEl, fillPalMenu, fillPalSwatch, fillPalTrigger);
  attachPalDropdown(linePaletteEl, linePalMenu, linePalSwatch, linePalTrigger);
  readLayerToUI();
  updateFromMapStop();
  updateDebugTogglePosition(shell!, panel, toggle);
  window.addEventListener('resize', () => updateDebugTogglePosition(shell!, panel, toggle));

  return {
    destroy: () => {
      try { document.removeEventListener('click', onDocClick); } catch (_) {}
      try { window.removeEventListener('blur', onDocClick); } catch (_) {}
      try { toggle.removeEventListener('click', onToggle); } catch (_) {}
      try {
        (document.getElementById('dbg-apply') as HTMLElement).removeEventListener('click', onApplyView);
        (document.getElementById('dbg-copy') as HTMLElement).removeEventListener('click', onCopy);
      } catch (_) {}
      try { resizeHandle.removeEventListener('pointerdown', onResizeDown as any); } catch (_) {}
      try {
        map.off('moveend', updateFromMapStop);
        map.off('rotateend', updateFromMapStop);
        map.off('pitchend', updateFromMapStop);
      } catch (_) {}
      try { window.removeEventListener('fusedmaps:sql:status', onSqlStatus as any); } catch (_) {}
      try { shell?.remove(); } catch (_) {}
    }
  };
}


