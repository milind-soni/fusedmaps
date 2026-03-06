/**
 * Debug panel (ported toward map_utils.py).
 *
 * In fusedmaps we focus on the deck/tile hex ecosystem; debug panel edits the in-memory
 * `config.layers` objects and triggers a Deck rebuild so changes apply immediately.
 */

import type { FusedMapsConfig, HexLayerConfig, VectorLayerConfig, ViewState } from '../types';
import { getViewState } from '../core/map';
import { deepDelta, toPyLiteral, legacyStyleToNewFormat } from './debug/export';
import { createPaletteDropdownManager, getPaletteNames, setPaletteOptions } from './debug/palettes';
import { ensureDebugShell, queryDebugElements } from './debug/template';
import { applyDebugUIToLayer } from './debug/apply';
import { createSqlPanel, type SqlPanel } from './debug/sql_panel';
import { clamp, fmt, rgbToHex } from '../utils';

export interface DebugHandle {
  destroy: () => void;
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
    toggle.style.left = panel.classList.contains('collapsed') ? '0px' : `var(--debug-panel-w, ${w}px)`;
  } catch {}
}

function ensureColorContinuousCfg(obj: any) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj['@@function'] !== 'colorContinuous') return null;
  return obj;
}

/**
 * Check if a color config is a @@= expression (e.g., "@@=[properties.r,properties.g,properties.b]")
 */
function isColorExpression(colorCfg: any): boolean {
  return typeof colorCfg === 'string' && colorCfg.startsWith('@@=');
}

/**
 * Get a short description of an expression for display
 */
function getExpressionLabel(colorCfg: string): string {
  if (colorCfg.includes('properties.r') && colorCfg.includes('properties.g') && colorCfg.includes('properties.b')) {
    return 'RGB from properties';
  }
  // Truncate long expressions
  const expr = colorCfg.slice(3); // Remove @@=
  return expr.length > 30 ? expr.slice(0, 27) + '...' : expr;
}

function getAttrCandidates(layer: HexLayerConfig): string[] {
  const out = new Set<string>();
  try {
    const fc: any = (layer.hexLayer as any)?.getFillColor;
    const lc: any = (layer.hexLayer as any)?.getLineColor;
    if (fc?.attr) out.add(String(fc.attr));
    if (lc?.attr) out.add(String(lc.attr));
    // Check tooltipColumns/tooltipAttrs at both layer and hexLayer level
    const ttc: any = (layer as any).tooltipColumns || (layer.hexLayer as any)?.tooltipColumns;
    const tta: any = (layer as any).tooltipAttrs || (layer.hexLayer as any)?.tooltipAttrs;
    if (Array.isArray(ttc)) ttc.forEach((x: any) => { if (x && x !== 'hex') out.add(String(x)); });
    if (Array.isArray(tta)) tta.forEach((x: any) => { if (x && x !== 'hex') out.add(String(x)); });
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

// (Mapbox paint helpers and hexToRgb moved to ./debug/apply)

// --- Defaults (debug output only) ---
const DEFAULT_HEX_STYLE: any = {
  filled: true,
  stroked: true,
  pickable: true,
  extruded: false,
  elevationScale: 1,
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
  lineWidthMinPixels: 0,
  pointRadiusMinPixels: 10,
  getFillColor: {
    '@@function': 'colorContinuous',
    attr: 'house_age',
    domain: [0, 50],
    colors: 'ArmyRose',
    steps: 7,
    nullColor: [200, 200, 200, 180]
  }
};

export function setupDebugPanel(map: mapboxgl.Map, config: FusedMapsConfig): DebugHandle {
  const sidebarMode = (config as any).sidebar || ((config as any).debug ? 'show' : null);
  const { shell, panel, toggle, resizeHandle } = ensureDebugShell();

  // Initial open/closed state (only relevant when mounted)
  try {
    if (sidebarMode === 'hide') {
      panel.classList.add('collapsed');
      toggle.innerHTML = '&#x203A;';
    } else {
      panel.classList.remove('collapsed');
      toggle.innerHTML = '&#x2039;';
    }
    updateDebugTogglePosition(shell!, panel, toggle);
  } catch (_) {}

  const {
    layerSelect,
    hexSection,
    viewStateSection,
    fillColorSection,
    lineColorSection,
    filledEl,
    strokedEl,
    extrudedEl,
    extrusionControls,
    elevAttrEl,
    elevScaleEl,
    opacitySliderEl,
    opacityEl,
    fillFnEl,
    fillFnOptions,
    fillStaticOptions,
    fillExpressionInfo,
    fillExpressionLabel,
    fillAttrEl,
    fillPaletteEl,
    fillPalTrigger,
    fillPalSwatch,
    fillPalMenu,
    fillDomainMinEl,
    fillDomainMaxEl,
    fillRangeMinEl,
    fillRangeMaxEl,
    fillStepsEl,
    fillReverseEl,
    fillNullEl,
    fillNullLabel,
    fillStaticEl,
    fillStaticLabel,
    lineFnEl,
    lineFnOptions,
    lineStaticOptions,
    lineExpressionInfo,
    lineExpressionLabel,
    lineAttrEl,
    linePaletteEl,
    linePalTrigger,
    linePalSwatch,
    linePalMenu,
    lineDomainMinEl,
    lineDomainMaxEl,
    lineReverseEl,
    lineStaticEl,
    lineStaticLabel,
    lineWidthSliderEl,
    lineWidthEl,
    pointSection,
    pointRadiusSliderEl,
    pointRadiusEl,
    lngEl,
    latEl,
    zoomEl,
    pitchEl,
    bearingEl,
    viewOut,
    layerOut,
    sqlSection,
    sqlStatusEl,
    sqlInputEl,
    aiPromptRow,
    aiPromptInput,
    aiPromptBtn,
    aiPromptStatus,
  } = queryDebugElements();

  // --- Tabs (UI | SQL) ---
  const tabUiBtn = document.getElementById('dbg-tab-btn-ui') as HTMLButtonElement | null;
  const tabSqlBtn = document.getElementById('dbg-tab-btn-sql') as HTMLButtonElement | null;
  const tabUiPanel = document.getElementById('dbg-tab-panel-ui') as HTMLElement | null;
  const tabSqlPanel = document.getElementById('dbg-tab-panel-sql') as HTMLElement | null;

  // Check if any layers support SQL (have parquetUrl or parquetData)
  const hasSqlLayers = config.layers.some((l: any) =>
    l.layerType === 'hex' && !l.isTileLayer && (l.parquetUrl || l.parquetData)
  );

  // Hide SQL tab if no SQL-capable layers exist
  if (!hasSqlLayers && tabSqlBtn) {
    tabSqlBtn.style.display = 'none';
  }

  let sqlPanel: SqlPanel | null = null;

  const setActiveTab = (tab: 'ui' | 'sql', persist = true) => {
    // If trying to set SQL tab but no SQL layers, force UI tab
    if (tab === 'sql' && !hasSqlLayers) {
      tab = 'ui';
    }

    try {
      if (tabUiPanel) tabUiPanel.style.display = tab === 'ui' ? 'block' : 'none';
      if (tabSqlPanel) tabSqlPanel.style.display = tab === 'sql' ? 'block' : 'none';
      if (tabUiBtn) {
        tabUiBtn.classList.toggle('active', tab === 'ui');
        tabUiBtn.setAttribute('aria-selected', tab === 'ui' ? 'true' : 'false');
      }
      if (tabSqlBtn) {
        tabSqlBtn.classList.toggle('active', tab === 'sql');
        tabSqlBtn.setAttribute('aria-selected', tab === 'sql' ? 'true' : 'false');
      }
      if (persist) {
        try { localStorage.setItem('fusedmaps:debug:tab', tab); } catch (_) {}
      }
    } catch (_) {}

    try {
      if (tab === 'sql') {
        sqlPanel?.onTabActivated();
      }
    } catch (_) {}
  };

  const onTabClick = (e: any) => {
    const el = e?.currentTarget as HTMLElement | null;
    const tab = String(el?.getAttribute?.('data-tab') || '').toLowerCase();
    if (tab === 'ui' || tab === 'sql') setActiveTab(tab as any, true);
  };

  try {
    tabUiBtn?.addEventListener('click', onTabClick as any);
    tabSqlBtn?.addEventListener('click', onTabClick as any);
  } catch (_) {}

  setActiveTab(hasSqlLayers ? 'sql' : 'ui', false);

  const initial: ViewState = config.initialViewState;

  const palettes = getPaletteNames();
  setPaletteOptions(fillPaletteEl, palettes);
  setPaletteOptions(linePaletteEl, palettes);

  const getPreviewSteps = () => {
    const s = parseInt(fillStepsEl?.value || '7', 10);
    return Number.isFinite(s) ? Math.max(2, Math.min(20, s)) : 7;
  };

  const palMgr = createPaletteDropdownManager(palettes);
  const fillPal = palMgr.attach({
    selectEl: fillPaletteEl,
    menuEl: fillPalMenu,
    swatchEl: fillPalSwatch,
    triggerEl: fillPalTrigger,
    getSteps: getPreviewSteps,
    getReverse: () => !!fillReverseEl.checked,
    onPicked: () => applyUIToLayer(),
  });
  const linePal = palMgr.attach({
    selectEl: linePaletteEl,
    menuEl: linePalMenu,
    swatchEl: linePalSwatch,
    triggerEl: linePalTrigger,
    getSteps: getPreviewSteps,
    getReverse: () => !!lineReverseEl.checked,
    onPicked: () => applyUIToLayer(),
  });

  // Find editable layers.
  // Note: originally this panel was hex-only; we also support vector layers and pmtiles now.
  const editableLayers = config.layers.filter((l) =>
    l.layerType === 'hex' || l.layerType === 'vector' || l.layerType === 'pmtiles'
  ) as any[];
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
      // Paste-back config (short, combined):
      // Emit a full `layers=[...]` list (map_utils style), where each layer's `config`
      // is a delta against strong defaults.
      const MAX_STRINGIFY_CHARS = 200_000;

      const toLayerDef = (l: any) => {
        const base: any = {
          name: l.name
        };
        // Only include visibility when it's explicitly off (default True).
        if (l.visible === false) base.visible = false;

        // Hex (tile or static) - use new clean format
        if (l.layerType === 'hex') {
          const hl = l.hexLayer || {};
          const style = legacyStyleToNewFormat(hl);
          const cfg: any = {};
          if (Object.keys(style).length) cfg.style = style;

          if (l.isTileLayer && l.tileUrl) {
            base.type = 'hex';
            base.tile_url = l.tileUrl;
            const tl = l.tileLayerConfig || l.tileLayer || null;
            if (tl && typeof tl === 'object') {
              const tile: any = {};
              if (typeof tl.minZoom === 'number') tile.minZoom = tl.minZoom;
              if (typeof tl.maxZoom === 'number') tile.maxZoom = tl.maxZoom;
              if (typeof tl.zoomOffset === 'number') tile.zoomOffset = tl.zoomOffset;
              if (Object.keys(tile).length) cfg.tile = tile;
            }
          } else {
            // Static hex data or DuckDB SQL-backed non-tile hex
            base.type = 'hex';
            if (l.parquetUrl) base.parquetUrl = l.parquetUrl;
            if (l.sql) base.sql = l.sql;
            // If this is not a parquet/sql-backed layer, keep an explicit data placeholder.
            if (!l.parquetUrl) {
              // Don't inline huge data arrays in the paste-back snippet.
              // Use a placeholder (data=None) or a python symbol (data=df) if dataRef was provided.
              base.data = (l as any).dataRef ? `@@py:${String((l as any).dataRef)}` : null;
            }
          }
          if (Object.keys(cfg).length) base.config = cfg;
          return base;
        }

        // Vector GeoJSON - use new clean format
        if (l.layerType === 'vector') {
          base.type = 'vector';
          // Don't inline GeoJSON; keep paste-back snippet small and explicit.
          base.data = (l as any).dataRef ? `@@py:${String((l as any).dataRef)}` : null;
          const vl = l.vectorLayer || {};
          const style = legacyStyleToNewFormat(vl);
          if (Object.keys(style).length) base.config = { style };
          return base;
        }

        // MVT tiles - use new clean format
        if (l.layerType === 'mvt') {
          base.type = 'vector';
          base.tile_url = l.tileUrl;
          base.source_layer = l.sourceLayer || 'udf';
          const style: any = {};
          if (l.fillColorConfig) style.fillColor = legacyStyleToNewFormat({ getFillColor: l.fillColorConfig }).fillColor;
          else if (l.fillColor) style.fillColor = l.fillColor;
          if (l.lineColorConfig) style.lineColor = legacyStyleToNewFormat({ getLineColor: l.lineColorConfig }).lineColor;
          else if (l.lineColor) style.lineColor = l.lineColor;
          if (typeof l.lineWidth === 'number') style.lineWidth = l.lineWidth;
          if (typeof l.fillOpacity === 'number') style.opacity = l.fillOpacity;
          if (Object.keys(style).length) base.config = { style };
          return base;
        }

        // PMTiles (Mapbox GL source via mapbox-pmtiles) - use new clean format
        if (l.layerType === 'pmtiles') {
          base.type = 'pmtiles';
          // Prefer original path if available (cleaner paste-back). Otherwise fall back to URL.
          if ((l as any).pmtilesPath) base.pmtiles_path = (l as any).pmtilesPath;
          else base.pmtiles_url = l.pmtilesUrl;
          if (l.sourceLayer) base.source_layer = l.sourceLayer;
          if (typeof l.minzoom === 'number') base.minzoom = l.minzoom;
          if (typeof l.maxzoom === 'number') base.maxzoom = l.maxzoom;

          // Build merged legacy format then convert to new format
          const v: any = l.vectorLayer || {};
          const vMerged: any = { ...v };
          if (l.fillColorConfig) vMerged.getFillColor = l.fillColorConfig;
          if (l.lineColorConfig) vMerged.getLineColor = l.lineColorConfig;
          if (typeof l.fillOpacity === 'number') vMerged.opacity = l.fillOpacity;
          if (typeof l.lineWidth === 'number') vMerged.lineWidthMinPixels = l.lineWidth;
          if (typeof l.pointRadiusMinPixels === 'number') vMerged.pointRadiusMinPixels = l.pointRadiusMinPixels;
          if (typeof l.isFilled === 'boolean') vMerged.filled = l.isFilled;
          if (typeof l.isStroked === 'boolean') vMerged.stroked = l.isStroked;

          const style = legacyStyleToNewFormat(vMerged);
          if (Object.keys(style).length) base.config = { style };
          return base;
        }

        // Raster tiles / static raster overlay - use new clean format
        if (l.layerType === 'raster') {
          base.type = 'raster';
          if (l.tileUrl) base.tile_url = l.tileUrl;
          if (l.imageUrl) base.image_url = l.imageUrl;
          if (l.imageBounds) base.bounds = l.imageBounds;
          const op = l.opacity ?? l.rasterLayer?.opacity;
          if (typeof op === 'number' && Number.isFinite(op) && op !== 1) {
            base.config = { style: { opacity: op } };
          }
          return base;
        }

        // Unknown
        return base;
      };

      const layersOut = (config.layers || []).map(toLayerDef);
      // Layer Config output should be paste-back friendly.
      // For drawings, users expect the full FeatureCollection (geojson.io style).
      let s = `layers = ${toPyLiteral(layersOut, 0)}`;

      // Keep truncation for general layer config
      if (s.length > MAX_STRINGIFY_CHARS) {
        s = s.slice(0, MAX_STRINGIFY_CHARS) + '\n... (truncated)\n';
      }
      layerOut.value = s;
    } catch (_) {
      layerOut.value = '';
    }
  };

  // SQL tab support (CodeMirror is lazy-loaded on tab activation)
  sqlPanel = createSqlPanel({
    sqlSection,
    sqlStatusEl,
    sqlInputEl,
    getActiveLayer: () => getActiveLayer() as any,
    updateLayerOutput,
  });

  // AI prompt (minimal - calls backend UDF)
  const aiUdfUrl = (config as any).aiUdfUrl as string | undefined;
  const aiSchema = (config as any).aiSchema as string | undefined;
  const aiContext = (config as any).aiContext as string | undefined;

  if (aiUdfUrl) {
    try { aiPromptRow.style.display = 'flex'; } catch (_) {}
  }

  const executeAiPrompt = async () => {
    if (!aiUdfUrl) return;
    const prompt = aiPromptInput.value.trim();
    if (!prompt) return;

    try {
      aiPromptBtn.disabled = true;
      aiPromptInput.disabled = true;
      aiPromptStatus.textContent = 'thinking...';
      aiPromptStatus.style.color = 'var(--ui-muted-2)';

      // Build URL with prompt, schema, and context
      let url = aiUdfUrl + (aiUdfUrl.includes('?') ? '&' : '?') + 'prompt=' + encodeURIComponent(prompt);
      if (aiSchema) url += '&schema=' + encodeURIComponent(aiSchema);
      if (aiContext) url += '&context=' + encodeURIComponent(aiContext);

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      let sql = await response.text();
      // Clean up response (remove quotes, markdown)
      sql = sql.trim().replace(/^["']|["']$/g, '').replace(/```sql/gi, '').replace(/```/g, '').trim();

      // Apply the SQL
      sqlPanel?.applySql(sql);
      aiPromptStatus.textContent = '';
      aiPromptInput.value = '';
    } catch (err: any) {
      aiPromptStatus.textContent = err?.message || 'error';
      aiPromptStatus.style.color = '#ff6b6b';
    } finally {
      aiPromptBtn.disabled = false;
      aiPromptInput.disabled = false;
    }
  };

  try {
    aiPromptInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') executeAiPrompt(); });
    aiPromptBtn.addEventListener('click', executeAiPrompt);
  } catch (_) {}

  const updateFillFnOptions = () => {
    const fn = fillFnEl.value;
    fillFnOptions.style.display = fn === 'colorContinuous' ? 'block' : 'none';
    fillStaticOptions.style.display = fn === 'static' ? 'block' : 'none';
    fillExpressionInfo.style.display = fn === 'expression' ? 'block' : 'none';
    // Disable dropdown when expression is selected (read-only)
    fillFnEl.disabled = fn === 'expression';
  };

  const updateLineFnOptions = () => {
    const fn = lineFnEl.value;
    lineFnOptions.style.display = fn === 'colorContinuous' ? 'block' : 'none';
    lineStaticOptions.style.display = fn === 'static' ? 'block' : 'none';
    lineExpressionInfo.style.display = fn === 'expression' ? 'block' : 'none';
    // Disable dropdown when expression is selected (read-only)
    lineFnEl.disabled = fn === 'expression';
  };

  // Show/hide Fill Color section based on Filled checkbox
  const updateFillSectionVisibility = () => {
    try {
      if (fillColorSection) {
        fillColorSection.style.display = filledEl.checked ? 'block' : 'none';
      }
    } catch (_) {}
  };

  // Show/hide Line Color section based on Stroked checkbox
  const updateLineSectionVisibility = () => {
    try {
      if (lineColorSection) {
        lineColorSection.style.display = strokedEl.checked ? 'block' : 'none';
      }
    } catch (_) {}
  };

  const readLayerToUI = () => {
    const layer = getActiveLayer();
    if (!layer) return;
    const isHex = (layer as any).layerType === 'hex';
    const isVector = (layer as any).layerType === 'vector';
    const isPmtiles = (layer as any).layerType === 'pmtiles';
    const hexCfg: any = isHex ? ((layer as any).hexLayer || {}) : {};

    // Toggle section visibility
    try { if (hexSection) hexSection.style.display = (isHex || isVector || isPmtiles) ? 'block' : 'none'; } catch (_) {}
    // Fill/Line color sections are shown based on filled/stroked state (updated after setting checkboxes below)
    try { if (viewStateSection) viewStateSection.style.display = 'block'; } catch (_) {}

    // Basic toggles
    if (isHex) {
      filledEl.checked = hexCfg.filled !== false;
      strokedEl.checked = hexCfg.stroked !== false;
      extrudedEl.checked = hexCfg.extruded === true;
    } else {
      // vector/pmtiles: treat filled/stroked as on/off hints; extruded doesn't apply
      filledEl.checked = (layer as any).isFilled !== false;
      strokedEl.checked = (layer as any).isStroked !== false;
      extrudedEl.checked = false;
    }

    // Update fill/line color section visibility based on filled/stroked checkboxes
    updateFillSectionVisibility();
    updateLineSectionVisibility();

    // Extrusion controls (hex only)
    try {
      // Hide extruded checkbox for non-hex layers
      const extrudedLabel = extrudedEl?.parentElement;
      if (extrudedLabel) extrudedLabel.style.display = isHex ? '' : 'none';
      if (extrusionControls) extrusionControls.style.display = (isHex && extrudedEl.checked) ? 'block' : 'none';
      if (isHex && elevAttrEl) {
        const attrs = getAttrCandidates(layer as any);
        const opts = [''].concat(attrs || []);
        elevAttrEl.innerHTML = opts
          .map((a) => a ? `<option value="${a}">${a}</option>` : `<option value="">(use fill attr)</option>`)
          .join('');
        elevAttrEl.value = String(hexCfg.elevationProperty || '');
      }
      if (isHex && elevScaleEl) {
        elevScaleEl.value = String(
          (typeof hexCfg.elevationScale === 'number' && Number.isFinite(hexCfg.elevationScale))
            ? hexCfg.elevationScale
            : 1
        );
      }
    } catch (_) {}

    const op = isHex
      ? (typeof hexCfg.opacity === 'number' ? hexCfg.opacity : 1)
      : (typeof (layer as any).opacity === 'number' ? (layer as any).opacity : 0.9);
    opacitySliderEl.value = String(op);
    opacityEl.value = String(op);

    // Fill
    if (isHex) {
      const fc: any = hexCfg.getFillColor;

      // Check for expression first (e.g., "@@=[properties.r,properties.g,properties.b]")
      if (isColorExpression(fc)) {
        fillFnEl.value = 'expression';
        fillFnEl.disabled = true;
        fillExpressionLabel.textContent = getExpressionLabel(fc);
        // Still populate attr dropdown for reference
        const attrs = getAttrCandidates(layer as any);
        if (attrs.length) {
          fillAttrEl.innerHTML = attrs.map((a) => `<option value="${a}">${a}</option>`).join('');
        }
      } else {
        fillFnEl.disabled = false;
      }

      const cc = ensureColorContinuousCfg(fc);
      if (!isColorExpression(fc) && cc) {
        fillFnEl.value = 'colorContinuous';
        fillAttrEl.innerHTML = getAttrCandidates(layer as any).map((a) => `<option value="${a}">${a}</option>`).join('');
        if (cc.attr) fillAttrEl.value = String(cc.attr);
        if (cc.colors) fillPaletteEl.value = String(cc.colors);
        try { fillReverseEl.checked = !!(cc as any).reverse; } catch (_) { fillReverseEl.checked = false; }
      try { fillPal.refresh(); } catch (_) {}
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
        const hex = rgbToHex(nc);
        fillNullEl.value = hex;
        fillNullLabel.textContent = hex;
      } else if (!isColorExpression(fc) && Array.isArray(fc)) {
        fillFnEl.value = 'static';
        try { fillReverseEl.checked = false; } catch {}
        const hex = rgbToHex(fc as number[]);
        fillStaticEl.value = hex;
        fillStaticLabel.textContent = hex;
        // Still populate attr dropdown for when user switches to colorContinuous
        const attrs = getAttrCandidates(layer as any);
        if (attrs.length) {
          fillAttrEl.innerHTML = attrs.map((a) => `<option value="${a}">${a}</option>`).join('');
        }
      } else if (!isColorExpression(fc)) {
        fillFnEl.value = 'colorContinuous';
        try { fillReverseEl.checked = false; } catch (_) {}
        // Populate attr dropdown from tooltipColumns
        const attrs = getAttrCandidates(layer as any);
        if (attrs.length) {
          fillAttrEl.innerHTML = attrs.map((a) => `<option value="${a}">${a}</option>`).join('');
        }
      }
    } else if (isVector || isPmtiles) {
      const v = layer as any;
      const fcCfg = v.fillColorConfig;
      // PMTiles layers may not have inline data for attribute detection.
      // IMPORTANT: Always include the configured attr in the dropdown options,
      // otherwise the <select> will silently fall back to its default (often "value"),
      // and the map will appear "wrong" until the user touches the controls.
      const attrs = (() => {
        if (!isPmtiles) return getVectorAttrCandidates(layer as any);
        const s = new Set<string>();
        // Prefer explicit configured attrs
        if (fcCfg?.attr) s.add(String(fcCfg.attr));
        if (v.lineColorConfig?.attr) s.add(String(v.lineColorConfig.attr));
        if (v.colorAttribute) s.add(String(v.colorAttribute));
        // Safe default for many PMTiles datasets
        s.add('value');
        return [...s].filter(Boolean);
      })();
      fillAttrEl.innerHTML = attrs.map((a) => `<option value="${a}">${a}</option>`).join('');
      if (fcCfg && typeof fcCfg === 'object' && fcCfg['@@function'] === 'colorContinuous') {
        fillFnEl.value = 'colorContinuous';
        if (fcCfg.attr) fillAttrEl.value = String(fcCfg.attr);
        if (fcCfg.colors) fillPaletteEl.value = String(fcCfg.colors);
        try { fillReverseEl.checked = !!(fcCfg as any).reverse; } catch (_) { fillReverseEl.checked = false; }
      try { fillPal.refresh(); } catch (_) {}
        const dom = Array.isArray(fcCfg.domain) ? fcCfg.domain : [0, 1];
        fillDomainMinEl.value = fmt(Number(dom[0]), 2);
        fillDomainMaxEl.value = fmt(Number(dom[1]), 2);
        // Keep dual slider aligned with inputs (same behavior as hex)
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
        fillStepsEl.value = String(fcCfg.steps ?? 7);
        const nc = Array.isArray(fcCfg.nullColor) ? fcCfg.nullColor : [184, 184, 184];
        const hex = rgbToHex(nc);
        fillNullEl.value = hex;
        fillNullLabel.textContent = hex;
      } else {
        fillFnEl.value = 'static';
        try { fillReverseEl.checked = false; } catch (_) {}
        // best-effort: derive picker from rgba if possible, else keep default
        fillStaticEl.value = '#0090ff';
        fillStaticLabel.textContent = fillStaticEl.value;
      }
    }

    // Line
    if (isHex) {
      const lc: any = hexCfg.getLineColor;

      // Check for expression first
      if (isColorExpression(lc)) {
        lineFnEl.value = 'expression';
        lineFnEl.disabled = true;
        lineExpressionLabel.textContent = getExpressionLabel(lc);
        const attrs = getAttrCandidates(layer as any);
        if (attrs.length) {
          lineAttrEl.innerHTML = attrs.map((a) => `<option value="${a}">${a}</option>`).join('');
        }
      } else {
        lineFnEl.disabled = false;
      }

      const lcCC = ensureColorContinuousCfg(lc);
      if (!isColorExpression(lc) && lcCC) {
        lineFnEl.value = 'colorContinuous';
        lineAttrEl.innerHTML = getAttrCandidates(layer as any).map((a) => `<option value="${a}">${a}</option>`).join('');
        if (lcCC.attr) lineAttrEl.value = String(lcCC.attr);
        if (lcCC.colors) linePaletteEl.value = String(lcCC.colors);
        try { lineReverseEl.checked = !!(lcCC as any).reverse; } catch (_) { lineReverseEl.checked = false; }
      try { linePal.refresh(); } catch (_) {}
        const dom = Array.isArray(lcCC.domain) ? lcCC.domain : [0, 1];
        lineDomainMinEl.value = fmt(Number(dom[0]), 2);
        lineDomainMaxEl.value = fmt(Number(dom[1]), 2);
      } else if (!isColorExpression(lc) && Array.isArray(lc)) {
        lineFnEl.value = 'static';
        try { lineReverseEl.checked = false; } catch {}
        const hex = rgbToHex(lc as number[]);
        lineStaticEl.value = hex;
        lineStaticLabel.textContent = hex;
        // Still populate attr dropdown for when user switches to colorContinuous
        const attrs = getAttrCandidates(layer as any);
        if (attrs.length) {
          lineAttrEl.innerHTML = attrs.map((a) => `<option value="${a}">${a}</option>`).join('');
        }
      } else if (!isColorExpression(lc)) {
        lineFnEl.value = 'static';
        try { lineReverseEl.checked = false; } catch {}
        // Still populate attr dropdown for when user switches to colorContinuous
        const attrs = getAttrCandidates(layer as any);
        if (attrs.length) {
          lineAttrEl.innerHTML = attrs.map((a) => `<option value="${a}">${a}</option>`).join('');
        }
      }
    } else if (isVector || isPmtiles) {
      const v = layer as any;
      const lcCfg = v.lineColorConfig;
      const attrs = (() => {
        if (!isPmtiles) return getVectorAttrCandidates(layer as any);
        const s = new Set<string>();
        if (lcCfg?.attr) s.add(String(lcCfg.attr));
        if (v.fillColorConfig?.attr) s.add(String(v.fillColorConfig.attr));
        if (v.colorAttribute) s.add(String(v.colorAttribute));
        s.add('value');
        return [...s].filter(Boolean);
      })();
      lineAttrEl.innerHTML = attrs.map((a) => `<option value="${a}">${a}</option>`).join('');
      if (lcCfg && typeof lcCfg === 'object' && lcCfg['@@function'] === 'colorContinuous') {
        lineFnEl.value = 'colorContinuous';
        if (lcCfg.attr) lineAttrEl.value = String(lcCfg.attr);
        if (lcCfg.colors) linePaletteEl.value = String(lcCfg.colors);
        try { lineReverseEl.checked = !!(lcCfg as any).reverse; } catch (_) { lineReverseEl.checked = false; }
      try { linePal.refresh(); } catch (_) {}
        const dom = Array.isArray(lcCfg.domain) ? lcCfg.domain : [0, 1];
        lineDomainMinEl.value = fmt(Number(dom[0]), 2);
        lineDomainMaxEl.value = fmt(Number(dom[1]), 2);
      } else {
        lineFnEl.value = 'static';
        try { lineReverseEl.checked = false; } catch (_) {}
      }
    }

    const lw = isHex ? (hexCfg.lineWidthMinPixels ?? 1) : ((layer as any).lineWidth ?? 1);
    lineWidthSliderEl.value = String(lw);
    lineWidthEl.value = String(lw);

    // Point radius (vector/pmtiles only, when data has Point geometry)
    const hasPoints = isVector && (layer as any).geojson?.features?.some(
      (f: any) => f.geometry?.type === 'Point' || f.geometry?.type === 'MultiPoint'
    );
    pointSection.style.display = hasPoints ? 'block' : 'none';
    if (hasPoints) {
      const pr = (layer as any).pointRadius ?? (layer as any).pointRadiusMinPixels ?? 6;
      pointRadiusSliderEl.value = String(pr);
      pointRadiusEl.value = String(pr);
    }

    updateFillFnOptions();
    updateLineFnOptions();
    updateLayerOutput();

    // SQL (DuckDB) section: only for non-tile hex layers that have parquetData/parquetUrl
    try {
      sqlPanel?.syncFromLayer(layer as any);
    } catch (_) {}
  };

  const applyUIToLayer = () => {
    const layer = getActiveLayer();
    if (!layer) return;
    applyDebugUIToLayer({
      map,
      layer,
      els: {
        filledEl,
        strokedEl,
        extrudedEl,
        extrusionControls,
        elevAttrEl,
        elevScaleEl,
        opacityEl,
        fillFnEl,
        fillAttrEl,
        fillPaletteEl,
        fillReverseEl,
        fillDomainMinEl,
        fillDomainMaxEl,
        fillStepsEl,
        fillNullEl,
        fillStaticEl,
        lineFnEl,
        lineAttrEl,
        linePaletteEl,
        lineReverseEl,
        lineDomainMinEl,
        lineDomainMaxEl,
        lineStaticEl,
        lineWidthEl,
        pointRadiusEl,
      },
      updateLayerOutput,
      findDeckOverlayOnMap,
      rebuildDeck,
    });
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
      // Always show a paste-ready Python assignment.
      viewOut.value = `initialViewState = ${toPyLiteral(vs, 0)}`;
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
  resizeHandle.addEventListener('pointerdown', onResizeDown as any, { passive: false });

  // Layer editor events
  layerSelect.addEventListener('change', () => readLayerToUI());
  fillFnEl.addEventListener('change', () => { updateFillFnOptions(); applyUIToLayer(); });
  lineFnEl.addEventListener('change', () => { updateLineFnOptions(); applyUIToLayer(); });
  filledEl.addEventListener('change', () => { updateFillSectionVisibility(); applyUIToLayer(); });
  strokedEl.addEventListener('change', () => { updateLineSectionVisibility(); applyUIToLayer(); });
  extrudedEl.addEventListener('change', () => {
    try { if (extrusionControls) extrusionControls.style.display = extrudedEl.checked ? 'block' : 'none'; } catch (_) {}
    applyUIToLayer();
  });
  elevAttrEl.addEventListener('change', applyUIToLayer);
  // Number input: make it feel like Deck.gl (updates while typing / clicking steppers)
  elevScaleEl.addEventListener('input', applyUIToLayer);
  elevScaleEl.addEventListener('change', applyUIToLayer);
  opacitySliderEl.addEventListener('input', () => { opacityEl.value = opacitySliderEl.value; applyUIToLayer(); });
  opacityEl.addEventListener('change', () => { opacitySliderEl.value = opacityEl.value; applyUIToLayer(); });
  [fillAttrEl, fillStepsEl, fillReverseEl].forEach((el) => el.addEventListener('change', () => {
    // keep palette swatches/menu in sync with reverse + steps
    try { fillPal.refresh(); } catch (_) {}
    try { linePal.refresh(); } catch (_) {}
    applyUIToLayer();
  }));
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
  [lineAttrEl, lineDomainMinEl, lineDomainMaxEl, lineReverseEl].forEach((el) => el.addEventListener('change', () => {
    try { linePal.refresh(); } catch (_) {}
    applyUIToLayer();
  }));
  lineStaticEl.addEventListener('input', () => { lineStaticLabel.textContent = lineStaticEl.value; applyUIToLayer(); });
  lineWidthSliderEl.addEventListener('input', () => { lineWidthEl.value = lineWidthSliderEl.value; applyUIToLayer(); });
  lineWidthEl.addEventListener('change', () => { lineWidthSliderEl.value = lineWidthEl.value; applyUIToLayer(); });
  pointRadiusSliderEl.addEventListener('input', () => { pointRadiusEl.value = pointRadiusSliderEl.value; applyUIToLayer(); });
  pointRadiusEl.addEventListener('change', () => { pointRadiusSliderEl.value = pointRadiusEl.value; applyUIToLayer(); });

  // Update viewstate only on "stop"
  try {
    map.on('moveend', updateFromMapStop);
    map.on('rotateend', updateFromMapStop);
    map.on('pitchend', updateFromMapStop);
  } catch (_) {}

  // Initial render
  updateFillFnOptions();
  updateLineFnOptions();
  try { fillPal.refresh(); } catch (_) {}
  try { linePal.refresh(); } catch (_) {}
  readLayerToUI();
  updateFromMapStop();
  updateDebugTogglePosition(shell!, panel, toggle);
  const onWindowResize = () => updateDebugTogglePosition(shell!, panel, toggle);
  window.addEventListener('resize', onWindowResize);

  return {
    destroy: () => {
      try { palMgr.destroy(); } catch (_) {}
      try { toggle.removeEventListener('click', onToggle); } catch (_) {}
      try { tabUiBtn?.removeEventListener('click', onTabClick as any); } catch (_) {}
      try { tabSqlBtn?.removeEventListener('click', onTabClick as any); } catch (_) {}
      try { window.removeEventListener('resize', onWindowResize); } catch (_) {}
      // view state buttons removed
      try { resizeHandle.removeEventListener('pointerdown', onResizeDown as any); } catch (_) {}
      try {
        map.off('moveend', updateFromMapStop);
        map.off('rotateend', updateFromMapStop);
        map.off('pitchend', updateFromMapStop);
      } catch (_) {}
      try { sqlPanel?.destroy(); } catch (_) {}
      try { sqlPanel = null; } catch (_) {}
      try { shell?.remove(); } catch (_) {}
    }
  };
}


