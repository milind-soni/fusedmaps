/**
 * Debug panel (ported toward map_utils.py).
 *
 * In fusedmaps we focus on the deck/tile hex ecosystem; debug panel edits the in-memory
 * `config.layers` objects and triggers a Deck rebuild so changes apply immediately.
 */

import type { FusedMapsConfig, HexLayerConfig, ViewState } from '../types';
import { getViewState } from '../core/map';

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

  // Find editable layers (for now: hex layers; especially tile layers)
  const editableLayers = config.layers.filter((l) => l.layerType === 'hex') as HexLayerConfig[];
  layerSelect.innerHTML = editableLayers.map((l) => `<option value="${l.id}">${l.name || l.id}</option>`).join('');
  if (!layerSelect.value && editableLayers.length) layerSelect.value = editableLayers[0].id;

  const getActiveLayer = (): HexLayerConfig | null => {
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
      layerOut.value = JSON.stringify(getActiveLayer(), null, 2);
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
    const hexCfg: any = layer.hexLayer || {};

    filledEl.checked = hexCfg.filled !== false;
    strokedEl.checked = hexCfg.stroked !== false;
    extrudedEl.checked = hexCfg.extruded === true;
    const op = typeof hexCfg.opacity === 'number' ? hexCfg.opacity : 1;
    opacitySliderEl.value = String(op);
    opacityEl.value = String(op);

    // Fill
    const fc: any = hexCfg.getFillColor;
    const cc = ensureColorContinuousCfg(fc);
    if (cc) {
      fillFnEl.value = 'colorContinuous';
      fillAttrEl.innerHTML = getAttrCandidates(layer).map((a) => `<option value="${a}">${a}</option>`).join('');
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

    // Line
    const lc: any = hexCfg.getLineColor;
    const lcCC = ensureColorContinuousCfg(lc);
    if (lcCC) {
      lineFnEl.value = 'colorContinuous';
      lineAttrEl.innerHTML = getAttrCandidates(layer).map((a) => `<option value="${a}">${a}</option>`).join('');
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

    const lw = hexCfg.lineWidthMinPixels ?? 1;
    lineWidthSliderEl.value = String(lw);
    lineWidthEl.value = String(lw);

    updateFillFnOptions();
    updateLineFnOptions();
    updateLayerOutput();
  };

  const applyUIToLayer = () => {
    const layer = getActiveLayer();
    if (!layer) return;
    layer.hexLayer = layer.hexLayer || {};
    const hexCfg: any = layer.hexLayer;

    hexCfg.filled = !!filledEl.checked;
    hexCfg.stroked = !!strokedEl.checked;
    hexCfg.extruded = !!extrudedEl.checked;
    const op = parseFloat(opacityEl.value);
    if (Number.isFinite(op)) hexCfg.opacity = clamp(op, 0, 1);

    // Fill
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

    // Line
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

    const lw = parseFloat(lineWidthEl.value);
    if (Number.isFinite(lw)) hexCfg.lineWidthMinPixels = clamp(lw, 0, 10);

    updateLayerOutput();
    findDeckOverlayOnMap();
    rebuildDeck();
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
    const hc: any = layer.hexLayer || {};
    if (hc.getFillColor && typeof hc.getFillColor === 'object') {
      hc.getFillColor.autoDomain = false;
      try { delete hc.getFillColor._dynamicDomain; } catch (_) {}
    }
    if (hc.getLineColor && typeof hc.getLineColor === 'object') {
      hc.getLineColor.autoDomain = false;
      try { delete hc.getLineColor._dynamicDomain; } catch (_) {}
    }
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
      try { shell?.remove(); } catch (_) {}
    }
  };
}


