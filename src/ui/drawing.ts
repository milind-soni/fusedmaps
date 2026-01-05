/**
 * Drawing mode (experimental)
 *
 * Uses Mapbox GL Draw under the hood, but provides a custom bottom toolbar UI
 * inspired by `open_felt.py`.
 *
 * NOTE: We intentionally keep this module self-contained and only load external
 * dependencies (mapbox-gl-draw) when enabled.
 */

import type { FusedMapsConfig, DrawingConfig, DrawingMode } from '../types';

type AnyMap = mapboxgl.Map & any;

let drawCssInjected = false;
let drawLoadPromise: Promise<any> | null = null;

async function ensureMapboxDrawLoaded(): Promise<any> {
  if ((window as any).MapboxDraw) return (window as any).MapboxDraw;
  if (drawLoadPromise) return drawLoadPromise;

  drawLoadPromise = new Promise((resolve, reject) => {
    try {
      if (!drawCssInjected) {
        drawCssInjected = true;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.css';
        document.head.appendChild(link);
      }

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/@mapbox/mapbox-gl-draw@1.5.0/dist/mapbox-gl-draw.js';
      script.onload = () => resolve((window as any).MapboxDraw);
      script.onerror = () => reject(new Error('Failed to load mapbox-gl-draw'));
      document.head.appendChild(script);
    } catch (e) {
      reject(e);
    }
  }).finally(() => {
    drawLoadPromise = null;
  });

  return drawLoadPromise;
}

function svgIcon(name: string): string {
  // Small subset of icons matching open_felt toolbar.
  // Keep inline for simplicity (no assets pipeline).
  const icons: Record<string, string> = {
    select: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
    </svg>`,
    freehand: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 19l7-7 3 3-7 7-3-3z"/>
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
    </svg>`,
    line: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="5" y1="19" x2="19" y2="5"/>
    </svg>`,
    polygon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
    </svg>`,
    rectangle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
    </svg>`,
    circle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
    </svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
    </svg>`,
  };
  return icons[name] || '';
}

function injectToolbarCss(): void {
  if (document.getElementById('fusedmaps-drawing-style')) return;
  const style = document.createElement('style');
  style.id = 'fusedmaps-drawing-style';
  style.textContent = `
    :root {
      --fm-bg-glass: rgba(15, 15, 20, 0.85);
      --fm-bg-glass-hover: rgba(25, 25, 35, 0.9);
      --fm-border-glass: rgba(255, 255, 255, 0.08);
      --fm-text-primary: #f0f0f5;
      --fm-text-muted: #8888a0;
      --fm-accent: #6366f1;
      --fm-accent-glow: rgba(99, 102, 241, 0.4);
    }
    .fm-toolbar {
      position: fixed;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      display: flex;
      gap: 4px;
      padding: 6px;
      background: var(--fm-bg-glass);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--fm-border-glass);
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      user-select: none;
    }
    .fm-toolbar.bottom { bottom: 16px; }
    .fm-toolbar.top { top: 16px; }
    .fm-toolbar-group { display:flex; gap:2px; }
    .fm-toolbar-group + .fm-toolbar-group {
      margin-left: 4px;
      padding-left: 8px;
      border-left: 1px solid var(--fm-border-glass);
    }
    .fm-tool-btn {
      display:flex;
      align-items:center;
      justify-content:center;
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 10px;
      background: transparent;
      color: var(--fm-text-muted);
      cursor: pointer;
      transition: all 0.15s ease;
      position: relative;
    }
    .fm-tool-btn:hover { background: var(--fm-bg-glass-hover); color: var(--fm-text-primary); }
    .fm-tool-btn.active { background: var(--fm-accent); color: white; box-shadow: 0 0 20px var(--fm-accent-glow); }
    .fm-tool-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .fm-tool-btn svg { width: 20px; height: 20px; }

    .fm-color-btn {
      width: 40px;
      height: 40px;
      border: 2px solid transparent;
      border-radius: 10px;
      background: var(--fm-current-color, #6366f1);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .fm-color-btn:hover { transform: scale(1.05); }
    .fm-color-btn.active { border-color: white; box-shadow: 0 0 12px var(--fm-current-color, #6366f1); }

    .fm-popover {
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-bottom: 8px;
      padding: 8px;
      background: var(--fm-bg-glass);
      backdrop-filter: blur(20px);
      border: 1px solid var(--fm-border-glass);
      border-radius: 12px;
      display: none;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
    /* Popovers: show state should preserve each popover's intended layout (grid vs flex) */
    .fm-popover.show { display: block; }
    .fm-popover.fm-color-grid.show { display: grid; }
    .fm-popover.fm-stroke-list.show { display: flex; }
    .fm-color-grid {
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
    }
    .fm-color-opt {
      width: 28px;
      height: 28px;
      border: 2px solid transparent;
      border-radius: 50%;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .fm-color-opt:hover { transform: scale(1.15); }
    .fm-color-opt.selected { border-color: white; }

    .fm-stroke-list { flex-direction:column; gap:4px; }
    .fm-stroke-opt {
      display:flex; align-items:center; gap:10px;
      padding: 6px 12px;
      border:none;
      border-radius: 8px;
      background: transparent;
      color: var(--fm-text-muted);
      cursor:pointer;
      font-size: 12px;
      white-space: nowrap;
    }
    .fm-stroke-opt:hover { background: var(--fm-bg-glass-hover); color: var(--fm-text-primary); }
    .fm-stroke-opt.selected { color: var(--fm-accent); }
    .fm-stroke-line { width: 40px; height: var(--stroke-height,2px); background: currentColor; border-radius: 2px; }
  `;
  document.head.appendChild(style);
}

function withAlpha(hex: string, alpha: number): string {
  // alpha 0..1
  const a = Math.max(0, Math.min(1, alpha));
  // hex -> rgba
  const c = String(hex || '').replace('#', '');
  if (c.length !== 6) return `rgba(99,102,241,${a})`;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function makeFreehandMode(): any {
  // Minimal freehand mode for MapboxDraw.
  // Draws a LineString by sampling pointer moves (distance threshold in pixels).
  return {
    onSetup(this: any, opts: any = {}) {
      const line = this.newFeature({
        type: 'Feature',
        properties: {
          // Persist style on the feature so export contains values (geojson.io-like).
          stroke: typeof opts.stroke === 'string' ? opts.stroke : undefined,
          fill: typeof opts.fill === 'string' ? opts.fill : undefined,
          strokeWidth: typeof opts.strokeWidth === 'number' ? opts.strokeWidth : undefined,
        },
        geometry: { type: 'LineString', coordinates: [] },
      });
      this.addFeature(line);
      this.clearSelectedFeatures();
      this.updateUIClasses({ mouse: 'add' });
      this.setActionableState({ trash: true });
      return { line, lastPt: null as any, isDown: false };
    },
    onMouseDown(this: any, state: any, e: any) {
      state.isDown = true;
      const c = [e.lngLat.lng, e.lngLat.lat];
      state.line.updateCoordinate('0', c[0], c[1]);
      state.lastPt = this.map.project(e.lngLat);
    },
    onMouseMove(this: any, state: any, e: any) {
      if (!state.isDown) return;
      const p = this.map.project(e.lngLat);
      if (state.lastPt) {
        const dx = p.x - state.lastPt.x;
        const dy = p.y - state.lastPt.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 9) return; // ~3px threshold
      }
      const coords = state.line.getCoordinates();
      const idx = coords.length;
      state.line.updateCoordinate(String(idx), e.lngLat.lng, e.lngLat.lat);
      state.lastPt = p;
    },
    onMouseUp(this: any, state: any) {
      state.isDown = false;
      const coords = state.line.getCoordinates();
      if (!coords || coords.length < 2) {
        this.deleteFeature([state.line.id], { silent: true });
        this.changeMode('simple_select');
        return;
      }
      this.changeMode('simple_select', { featureIds: [state.line.id] });
    },
    onStop(this: any, state: any) {
      this.updateUIClasses({ mouse: 'none' });
      // Do not emit a synthetic draw.create event here.
      // MapboxDraw will manage render + events during mode transition;
      // synthetic events can cause odd "closing" artifacts or duplicate states.
    },
    toDisplayFeatures(this: any, state: any, geojson: any, display: any) {
      // display the feature while drawing
      display(geojson);
    },
  };
}

function makeDrawStyles(defaultStroke: string, defaultFill: string, defaultWidth: number): any[] {
  // Style expressions read from feature properties when present.
  const stroke = ['coalesce', ['get', 'stroke'], defaultStroke];
  const fill = ['coalesce', ['get', 'fill'], defaultFill];
  const width = ['coalesce', ['get', 'strokeWidth'], defaultWidth];

  // IMPORTANT:
  // Mapbox GL Draw renders from 2 internal sources:
  // - mapbox-gl-draw-cold (static/inactive)
  // - mapbox-gl-draw-hot  (active while drawing/editing)
  // If we omit `source`, Mapbox will reject the layer and Draw will fall back to its defaults.
  const COLD = 'mapbox-gl-draw-cold';
  const HOT = 'mapbox-gl-draw-hot';

  // Keep it minimal but valid: line + polygon fill/outline + point.
  //
  // NOTE: During drawing/editing, Mapbox GL Draw frequently moves features between HOT and COLD
  // sources. If we style them differently (or filter by `active`), it can appear as "blinking".
  // To keep visuals stable, we apply the same styles to both sources (no active/inactive split).
  return [
    // Polygon fill (cold)
    {
      id: 'gl-draw-polygon-fill-cold',
      type: 'fill',
      source: COLD,
      filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
      paint: { 'fill-color': fill, 'fill-opacity': 1 },
    },
    // Polygon fill (hot)
    {
      id: 'gl-draw-polygon-fill-hot',
      type: 'fill',
      source: HOT,
      filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
      paint: { 'fill-color': fill, 'fill-opacity': 1 },
    },
    // Polygon outline (cold)
    {
      id: 'gl-draw-polygon-stroke-cold',
      type: 'line',
      source: COLD,
      filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': stroke, 'line-width': width },
    },
    // Polygon outline (hot)
    {
      id: 'gl-draw-polygon-stroke-hot',
      type: 'line',
      source: HOT,
      filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': stroke, 'line-width': width },
    },
    // LineString (cold)
    {
      id: 'gl-draw-line-cold',
      type: 'line',
      source: COLD,
      filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': stroke, 'line-width': width },
    },
    // LineString (hot)
    {
      id: 'gl-draw-line-hot',
      type: 'line',
      source: HOT,
      filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': stroke, 'line-width': width },
    },
    // Points/vertices (cold)
    {
      id: 'gl-draw-point-cold',
      type: 'circle',
      source: COLD,
      filter: ['all', ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
      paint: { 'circle-radius': 4, 'circle-color': stroke, 'circle-stroke-color': '#000', 'circle-stroke-width': 1 },
    },
    // Points/vertices (hot)
    {
      id: 'gl-draw-point-hot',
      type: 'circle',
      source: HOT,
      filter: ['all', ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
      paint: { 'circle-radius': 4, 'circle-color': stroke, 'circle-stroke-color': '#000', 'circle-stroke-width': 1 },
    },
  ];
}

function setActive(btns: Record<string, HTMLButtonElement>, active: string) {
  Object.entries(btns).forEach(([k, el]) => {
    try { el.classList.toggle('active', k === active); } catch (_) {}
  });
}

function setDrawVisibility(map: AnyMap, visible: boolean) {
  try {
    const styleLayers: any[] = (map.getStyle?.()?.layers || []) as any[];
    for (const l of styleLayers) {
      const id = l?.id;
      if (typeof id === 'string' && (id.startsWith('gl-draw') || id.startsWith('mapbox-gl-draw'))) {
        try { map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none'); } catch (_) {}
      }
    }
  } catch (_) {}
}

export async function setupDrawing(
  map: mapboxgl.Map,
  config: FusedMapsConfig
): Promise<{ destroy: () => void; setVisible: (v: boolean) => void; getGeoJSON: () => any } | null> {
  const dcfg: DrawingConfig | undefined = config.drawing;
  if (!dcfg?.enabled) return null;

  injectToolbarCss();

  const MapboxDraw = await ensureMapboxDrawLoaded();

  const defaultStroke = dcfg.style?.stroke || '#6366f1';
  const defaultFill = dcfg.style?.fill || withAlpha(defaultStroke, 0.25);
  const defaultWidth = typeof dcfg.style?.strokeWidth === 'number' ? dcfg.style!.strokeWidth! : 4;

  const draw = new MapboxDraw({
    displayControlsDefault: false,
    modes: {
      ...(MapboxDraw.modes || {}),
      draw_freehand: makeFreehandMode(),
    },
    styles: makeDrawStyles(defaultStroke, defaultFill, defaultWidth),
  });

  // Add draw control but hide its default UI; we use our own toolbar.
  (map as AnyMap).addControl(draw, 'top-left');
  try {
    const ctrlEls = document.getElementsByClassName('mapboxgl-ctrl-draw');
    for (const el of Array.from(ctrlEls)) (el as HTMLElement).style.display = 'none';
  } catch (_) {}

  // Load initial GeoJSON if provided
  try {
    if (dcfg.initialGeoJSON) {
      draw.add(dcfg.initialGeoJSON as any);
    }
  } catch (_) {}

  // Toolbar DOM
  const toolbar = document.createElement('div');
  toolbar.className = `fm-toolbar ${dcfg.position === 'top' ? 'top' : 'bottom'}`;

  const tools: DrawingMode[] = dcfg.tools?.length
    ? dcfg.tools
    : ['select', 'freehand', 'line', 'polygon', 'rectangle', 'circle'];

  const COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
    '#f43f5e', '#6366f1', '#14b8a6', '#84cc16',
    '#a855f7', '#0ea5e9', '#64748b', '#ffffff'
  ];
  const STROKES = [
    { width: 2, label: 'Fine' },
    { width: 4, label: 'Medium' },
    { width: 6, label: 'Bold' },
    { width: 10, label: 'Heavy' },
  ];

  let currentColor = defaultStroke;
  let currentStroke = defaultWidth;
  // Default to select so the map can be panned immediately.
  // (Drawing modes intentionally capture drag gestures.)
  let currentMode: DrawingMode = dcfg.defaultMode || 'select';

  const groupTools = document.createElement('div');
  groupTools.className = 'fm-toolbar-group';

  const mkToolBtn = (mode: DrawingMode, title: string, iconKey: string, enabled = true) => {
    const b = document.createElement('button');
    b.className = 'fm-tool-btn';
    b.type = 'button';
    b.title = title;
    b.disabled = !enabled;
    b.innerHTML = svgIcon(iconKey);
    groupTools.appendChild(b);
    return b;
  };

  const btns: Record<string, HTMLButtonElement> = {};
  if (tools.includes('select')) btns.select = mkToolBtn('select', 'Select', 'select', true);
  if (tools.includes('freehand')) btns.freehand = mkToolBtn('freehand', 'Freehand', 'freehand', true);
  if (tools.includes('line')) btns.line = mkToolBtn('line', 'Line', 'line', true);
  if (tools.includes('polygon')) btns.polygon = mkToolBtn('polygon', 'Polygon', 'polygon', true);
  // Rectangle/circle are not implemented yet without extra modes; keep disabled but present.
  if (tools.includes('rectangle')) btns.rectangle = mkToolBtn('rectangle', 'Rectangle (coming soon)', 'rectangle', false);
  if (tools.includes('circle')) btns.circle = mkToolBtn('circle', 'Circle (coming soon)', 'circle', false);

  toolbar.appendChild(groupTools);

  // Style group
  const groupStyle = document.createElement('div');
  groupStyle.className = 'fm-toolbar-group';
  groupStyle.style.position = 'relative';

  const colorWrap = document.createElement('div');
  colorWrap.style.position = 'relative';
  const colorBtn = document.createElement('button');
  colorBtn.className = 'fm-color-btn';
  colorBtn.type = 'button';
  colorBtn.title = 'Color';
  colorBtn.style.setProperty('--fm-current-color', currentColor);
  colorBtn.style.background = currentColor;
  const colorPop = document.createElement('div');
  colorPop.className = 'fm-popover fm-color-grid';
  COLORS.forEach((c) => {
    const opt = document.createElement('div');
    opt.className = 'fm-color-opt' + (c === currentColor ? ' selected' : '');
    opt.style.background = c;
    opt.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      currentColor = c;
      colorBtn.style.background = currentColor;
      colorBtn.style.setProperty('--fm-current-color', currentColor);
      try { applyGlobalDrawStyle(); } catch (_) {}
      Array.from(colorPop.querySelectorAll('.fm-color-opt')).forEach((el) => {
        (el as HTMLElement).classList.toggle('selected', (el as HTMLElement).style.background === currentColor);
      });
      colorPop.classList.remove('show');
      // Only recolor selected features (if any). Otherwise, this sets the color for the *next* draw.
      applyStyleToSelection();
      // If we're currently in a drawing mode, re-enter it so the next feature picks up the new opts.
      try { setMode(currentMode); } catch (_) {}
    });
    colorPop.appendChild(opt);
  });
  colorBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    colorPop.classList.toggle('show');
    strokePop.classList.remove('show');
  });
  colorWrap.appendChild(colorBtn);
  colorWrap.appendChild(colorPop);

  const strokeWrap = document.createElement('div');
  strokeWrap.style.position = 'relative';
  const strokeBtn = document.createElement('button');
  strokeBtn.className = 'fm-tool-btn';
  strokeBtn.type = 'button';
  strokeBtn.title = 'Stroke Width';
  strokeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <line x1="4" y1="6" x2="20" y2="6" stroke-width="1"/>
    <line x1="4" y1="12" x2="20" y2="12" stroke-width="2"/>
    <line x1="4" y1="18" x2="20" y2="18" stroke-width="4"/>
  </svg>`;
  const strokePop = document.createElement('div');
  strokePop.className = 'fm-popover fm-stroke-list';
  STROKES.forEach((s) => {
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = 'fm-stroke-opt' + (s.width === currentStroke ? ' selected' : '');
    opt.innerHTML = `<span class="fm-stroke-line" style="--stroke-height:${s.width}px"></span><span>${s.label}</span>`;
    opt.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      currentStroke = s.width;
      try { applyGlobalDrawStyle(); } catch (_) {}
      Array.from(strokePop.querySelectorAll('.fm-stroke-opt')).forEach((el) => {
        (el as HTMLElement).classList.toggle('selected', (el as any).textContent?.includes(s.label));
      });
      strokePop.classList.remove('show');
      applyStyleToSelection();
      try { setMode(currentMode); } catch (_) {}
    });
    strokePop.appendChild(opt);
  });
  strokeBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    strokePop.classList.toggle('show');
    colorPop.classList.remove('show');
  });
  strokeWrap.appendChild(strokeBtn);
  strokeWrap.appendChild(strokePop);

  groupStyle.appendChild(colorWrap);
  groupStyle.appendChild(strokeWrap);
  toolbar.appendChild(groupStyle);

  // Actions group
  const groupActions = document.createElement('div');
  groupActions.className = 'fm-toolbar-group';
  const clearBtn = document.createElement('button');
  clearBtn.className = 'fm-tool-btn';
  clearBtn.type = 'button';
  clearBtn.title = 'Clear All';
  clearBtn.innerHTML = svgIcon('trash');
  clearBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    try { draw.deleteAll(); } catch (_) {}
  });
  groupActions.appendChild(clearBtn);
  toolbar.appendChild(groupActions);

  document.body.appendChild(toolbar);

  const DRAW_LAYER_IDS = [
    'gl-draw-polygon-fill-cold',
    'gl-draw-polygon-fill-hot',
    'gl-draw-polygon-stroke-cold',
    'gl-draw-polygon-stroke-hot',
    'gl-draw-line-cold',
    'gl-draw-line-hot',
    'gl-draw-point-cold',
    'gl-draw-point-hot',
  ];

  const applyGlobalDrawStyle = () => {
    // IMPORTANT:
    // Do NOT mutate the global Draw style defaults based on the toolbar selection.
    // If we set the Mapbox GL Draw paint expressions to fall back to `currentColor`,
    // every existing feature (that relies on fallback defaults) can appear to change color.
    //
    // Desired behavior:
    // - Changing color/stroke affects *the next feature you draw* (and the active "hot" preview),
    //   not every existing feature.
    //
    // We therefore only update the "hot" layers (active drawing/editing) to use currentColor/currentStroke
    // as fallbacks. Cold/static layers keep their original defaults.
    const hotStroke = ['coalesce', ['get', 'stroke'], currentColor];
    const hotFill = ['coalesce', ['get', 'fill'], withAlpha(currentColor, 0.25)];
    const hotWidth = ['coalesce', ['get', 'strokeWidth'], currentStroke];
    try {
      for (const id of DRAW_LAYER_IDS) {
        if (!id.includes('-hot')) continue;
        if (!(map as any).getLayer?.(id)) continue;
        if (id.includes('fill')) {
          try { (map as any).setPaintProperty(id, 'fill-color', hotFill); } catch (_) {}
        }
        if (id.includes('stroke') || id.includes('line')) {
          try { (map as any).setPaintProperty(id, 'line-color', hotStroke); } catch (_) {}
          try { (map as any).setPaintProperty(id, 'line-width', hotWidth); } catch (_) {}
        }
        if (id.includes('point')) {
          try { (map as any).setPaintProperty(id, 'circle-color', hotStroke); } catch (_) {}
        }
      }
    } catch (_) {}
  };

  const bringDrawLayersToFront = () => {
    // Ensure drawings are on top of *all Mapbox style layers* (hex/vector/pmtiles/raster).
    // Note: Deck.gl MapboxOverlay renders above the Mapbox map canvas; we can't layer MapboxDraw above Deck
    // without changing the rendering approach. This guarantees top-of-stack within Mapbox itself.
    try {
      for (const id of DRAW_LAYER_IDS) {
        try {
          if ((map as any).getLayer?.(id)) (map as any).moveLayer(id);
        } catch (_) {}
      }
    } catch (_) {}
  };

  // Draw layers appear after addControl; apply a few times to be safe.
  try {
    applyGlobalDrawStyle();
    bringDrawLayersToFront();
    setTimeout(applyGlobalDrawStyle, 50);
    setTimeout(bringDrawLayersToFront, 60);
    setTimeout(applyGlobalDrawStyle, 250);
    setTimeout(bringDrawLayersToFront, 260);
    setTimeout(applyGlobalDrawStyle, 750);
    setTimeout(bringDrawLayersToFront, 760);
  } catch (_) {}

  // If other code adds layers later (e.g. PMTiles async; style reload), keep drawings on top.
  let styleBumpTimer: any = null;
  const onStyleData = () => {
    clearTimeout(styleBumpTimer);
    styleBumpTimer = setTimeout(() => {
      try { bringDrawLayersToFront(); } catch (_) {}
      try { applyGlobalDrawStyle(); } catch (_) {}
    }, 50);
  };
  try { (map as AnyMap).on('styledata', onStyleData); } catch (_) {}

  const applyStyleToIds = (ids: string[]) => {
    try {
      for (const id of ids || []) {
        if (!id) continue;
        try {
          draw.setFeatureProperty(id, 'stroke', currentColor);
          draw.setFeatureProperty(id, 'fill', withAlpha(currentColor, 0.25));
          draw.setFeatureProperty(id, 'strokeWidth', currentStroke);
        } catch (_) {}
      }
    } catch (_) {}
  };

  const applyDefaultsToUnstyled = () => {
    // Guarantee that freshly-created features get styled even if we can't reliably
    // infer their IDs from the draw.create event payload.
    try {
      const all = draw.getAll?.()?.features || [];
      for (const f of all) {
        const id = f?.id ? String(f.id) : '';
        if (!id) continue;
        const p: any = (f as any).properties || {};
        const needsStroke = !(typeof p.stroke === 'string' && p.stroke.length);
        const needsFill = !(typeof p.fill === 'string' && p.fill.length);
        const needsWidth = !(typeof p.strokeWidth === 'number' && Number.isFinite(p.strokeWidth));
        if (!needsStroke && !needsFill && !needsWidth) continue;
        try {
          if (needsStroke) draw.setFeatureProperty(id, 'stroke', currentColor);
          if (needsFill) draw.setFeatureProperty(id, 'fill', withAlpha(currentColor, 0.25));
          if (needsWidth) draw.setFeatureProperty(id, 'strokeWidth', currentStroke);
        } catch (_) {}
      }
    } catch (_) {}
  };

  function applyStyleToSelection() {
    try {
      const ids: string[] = (draw.getSelectedIds && draw.getSelectedIds()) || [];
      if (!ids.length) return;
      applyStyleToIds(ids);
    } catch (_) {}
  }

  function setMode(mode: DrawingMode) {
    currentMode = mode;
    setActive(btns, mode);
    try {
      if (mode === 'select') draw.changeMode('simple_select');
      else if (mode === 'freehand') draw.changeMode('draw_freehand', { stroke: currentColor, strokeWidth: currentStroke, fill: withAlpha(currentColor, 0.25) });
      else if (mode === 'line') draw.changeMode('draw_line_string');
      else if (mode === 'polygon') draw.changeMode('draw_polygon');
    } catch (_) {}
  }

  Object.entries(btns).forEach(([k, el]) => {
    el.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      setMode(k as any);
    });
  });

  // default mode
  setMode(currentMode);

  // Ensure newly created features get current style, and selection updates reflect in toolbar.
  const knownIds = new Set<string>();
  try {
    const all0 = draw.getAll?.()?.features || [];
    for (const f of all0) if (f?.id) knownIds.add(String(f.id));
  } catch (_) {}

  const applyStyleToNewFeatures = () => {
    try {
      const all = draw.getAll?.()?.features || [];
      const newIds: string[] = [];
      for (const f of all) {
        const id = f?.id ? String(f.id) : '';
        if (!id) continue;
        if (!knownIds.has(id)) {
          knownIds.add(id);
          newIds.push(id);
        }
      }
      if (newIds.length) applyStyleToIds(newIds);
    } catch (_) {}
  };

  const onDrawModeChange = (e: any) => {
    // Only stamp defaults once drawing is finished (prevents flicker/blink while dragging).
    try {
      const m = String(e?.mode || '');
      if (m === 'simple_select' || m === 'direct_select') {
        applyStyleToNewFeatures();
        applyDefaultsToUnstyled();
      }
    } catch (_) {}
  };
  const onDrawSelectionChange = () => {
    try {
      const ids: string[] = (draw.getSelectedIds && draw.getSelectedIds()) || [];
      if (!ids.length) return;
      const f = draw.get(ids[0]);
      const p = (f?.properties || {}) as any;
      if (typeof p.stroke === 'string' && p.stroke) {
        currentColor = p.stroke;
        colorBtn.style.background = currentColor;
        colorBtn.style.setProperty('--fm-current-color', currentColor);
        try { applyGlobalDrawStyle(); } catch (_) {}
      }
      if (typeof p.strokeWidth === 'number' && Number.isFinite(p.strokeWidth)) {
        currentStroke = p.strokeWidth;
        try { applyGlobalDrawStyle(); } catch (_) {}
      }
      // Keep selection highlighting in the palette UI
      try {
        Array.from(colorPop.querySelectorAll('.fm-color-opt')).forEach((el) => {
          (el as HTMLElement).classList.toggle('selected', (el as HTMLElement).style.background === currentColor);
        });
      } catch (_) {}
    } catch (_) {}
  };
  try {
    (map as AnyMap).on('draw.modechange', onDrawModeChange);
    (map as AnyMap).on('draw.selectionchange', onDrawSelectionChange);
  } catch (_) {}

  const onDocClick = () => {
    try { colorPop.classList.remove('show'); } catch (_) {}
    try { strokePop.classList.remove('show'); } catch (_) {}
  };
  document.addEventListener('click', onDocClick);

  // ESC should always exit drawing mode back to Select.
  // This answers the "how do I stop drawing?" question for line/polygon modes.
  const onKeyDown = (e: KeyboardEvent) => {
    try {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      try { colorPop.classList.remove('show'); } catch (_) {}
      try { strokePop.classList.remove('show'); } catch (_) {}
      try { setMode('select'); } catch (_) {}
    } catch (_) {}
  };
  document.addEventListener('keydown', onKeyDown, true);

  // If drawing is represented as a layer in the panel, hook it up via visibilityState.
  const drawingLayerId = dcfg.layerId || 'drawings';
  const setVisible = (v: boolean) => setDrawVisibility(map as AnyMap, v);
  // Apply initial visibility based on layer state (if present)
  try {
    const v = (config as any).__visibilityState?.[drawingLayerId];
    if (v === false) setVisible(false);
  } catch (_) {}

  return {
    destroy: () => {
      try { document.removeEventListener('click', onDocClick); } catch (_) {}
      try { document.removeEventListener('keydown', onKeyDown, true as any); } catch (_) {}
      try { toolbar.remove(); } catch (_) {}
      try {
        (map as AnyMap).off('draw.modechange', onDrawModeChange);
        (map as AnyMap).off('draw.selectionchange', onDrawSelectionChange);
      } catch (_) {}
      try { (map as AnyMap).off('styledata', onStyleData); } catch (_) {}
      try { (map as AnyMap).removeControl(draw); } catch (_) {}
    },
    setVisible,
    getGeoJSON: () => {
      try { return draw.getAll?.() || { type: 'FeatureCollection', features: [] }; } catch (_) {
        return { type: 'FeatureCollection', features: [] };
      }
    }
  };
}


