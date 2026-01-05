/**
 * Drawing mode (experimental)
 *
 * Hybrid approach inspired by `open_felt.py`:
 * - SVG overlay for freehand/arrow (direct color application, no expression issues)
 * - Terra Draw for shapes (polygon, line, rectangle, circle) with per-feature style functions
 *
 * This fixes the coloring issues that plagued the Mapbox GL Draw approach.
 */

import type { FusedMapsConfig, DrawingConfig, DrawingMode } from '../types';

type AnyMap = mapboxgl.Map & any;

// Track loaded libraries
let terraDrawLoaded = false;
let terraDrawLoadPromise: Promise<any> | null = null;

async function ensureTerraDrawLoaded(): Promise<any> {
  if (terraDrawLoaded && (window as any).terraDraw) {
    return (window as any).terraDraw;
  }
  if (terraDrawLoadPromise) return terraDrawLoadPromise;

  terraDrawLoadPromise = new Promise((resolve, reject) => {
    try {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/terra-draw@1.0.0-beta.1/dist/terra-draw.umd.js';
      script.onload = () => {
        terraDrawLoaded = true;
        resolve((window as any).terraDraw);
      };
      script.onerror = () => reject(new Error('Failed to load terra-draw'));
      document.head.appendChild(script);
    } catch (e) {
      reject(e);
    }
  }).finally(() => {
    terraDrawLoadPromise = null;
  });

  return terraDrawLoadPromise;
}

function svgIcon(name: string): string {
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
    arrow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="5" y1="19" x2="19" y2="5"/>
      <polyline points="10 5 19 5 19 14"/>
    </svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
    </svg>`,
    undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 7v6h6"/>
      <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>
    </svg>`,
    redo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 7v6h-6"/>
      <path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7"/>
    </svg>`,
  };
  return icons[name] || '';
}

function injectStyles(): void {
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
    
    /* SVG Drawing Overlay for freehand/arrow */
    .fm-drawing-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
    }
    .fm-drawing-overlay.active {
      pointer-events: all;
      cursor: crosshair;
    }
    .fm-drawing-overlay path {
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
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
    .fm-toolbar-group { display: flex; gap: 2px; }
    .fm-toolbar-group + .fm-toolbar-group {
      margin-left: 4px;
      padding-left: 8px;
      border-left: 1px solid var(--fm-border-glass);
    }
    .fm-tool-btn {
      display: flex;
      align-items: center;
      justify-content: center;
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
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }
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

    .fm-stroke-list { flex-direction: column; gap: 4px; }
    .fm-stroke-opt {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 12px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: var(--fm-text-muted);
      cursor: pointer;
      font-size: 12px;
      white-space: nowrap;
    }
    .fm-stroke-opt:hover { background: var(--fm-bg-glass-hover); color: var(--fm-text-primary); }
    .fm-stroke-opt.selected { color: var(--fm-accent); }
    .fm-stroke-line { width: 40px; height: var(--stroke-height, 2px); background: currentColor; border-radius: 2px; }
  `;
  document.head.appendChild(style);
}

function hexToRgba(hex: string, alpha: number): string {
  const c = String(hex || '').replace('#', '');
  if (c.length !== 6) return `rgba(99,102,241,${alpha})`;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Convert hex to Terra Draw's expected format (hex with alpha suffix for fill)
function hexWithAlpha(hex: string, alpha: number = 0.25): string {
  // Terra Draw expects hex colors, append alpha as 2-char hex
  const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return hex + alphaHex;
}

interface FreehandPath {
  id: string;
  points: Array<{ lng: number; lat: number }>;
  color: string;
  stroke: number;
  type: 'freehand' | 'arrow';
}

interface UndoState {
  freehandPaths: FreehandPath[];
  terraFeatures: any[];
  featureStyles: Record<string, { color: string; stroke: number }>;
}

export async function setupDrawing(
  map: mapboxgl.Map,
  config: FusedMapsConfig
): Promise<{ destroy: () => void; setVisible: (v: boolean) => void; getGeoJSON: () => any } | null> {
  const dcfg: DrawingConfig | undefined = config.drawing;
  if (!dcfg?.enabled) return null;

  injectStyles();

  const terraDraw = await ensureTerraDrawLoaded();
  const {
    TerraDraw,
    TerraDrawMapLibreGLAdapter,
    TerraDrawLineStringMode,
    TerraDrawPolygonMode,
    TerraDrawRectangleMode,
    TerraDrawCircleMode,
    TerraDrawSelectMode,
  } = terraDraw;

  // State
  const defaultStroke = dcfg.style?.stroke || '#6366f1';
  const defaultWidth = typeof dcfg.style?.strokeWidth === 'number' ? dcfg.style!.strokeWidth! : 4;
  
  let currentColor = defaultStroke;
  let currentStroke = defaultWidth;
  let currentMode: DrawingMode = dcfg.defaultMode || 'select';
  
  // Freehand paths (SVG overlay)
  let freehandPaths: FreehandPath[] = [];
  let isDrawingFreehand = false;
  let currentFreehandPath: FreehandPath | null = null;
  
  // Terra Draw feature styles (featureId -> {color, stroke})
  const featureStyles: Record<string, { color: string; stroke: number }> = {};
  
  // Undo/Redo stacks
  let undoStack: string[] = [];
  let redoStack: string[] = [];
  
  // Get feature style (for Terra Draw style functions)
  const getFeatureColor = (featureId: string | number) => {
    return featureStyles[String(featureId)]?.color || currentColor;
  };
  const getFeatureStroke = (featureId: string | number) => {
    return featureStyles[String(featureId)]?.stroke || currentStroke;
  };

  // Initialize Terra Draw for shapes
  const draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map: map as any, coordinatePrecision: 9 }),
    modes: [
      new TerraDrawSelectMode({
        flags: {
          linestring: { feature: { draggable: true, deletable: true } },
          polygon: { feature: { draggable: true, deletable: true } },
          rectangle: { feature: { draggable: true, deletable: true } },
          circle: { feature: { draggable: true, deletable: true } },
        },
      }),
      new TerraDrawLineStringMode({
        styles: {
          lineStringColor: (feature: any) => getFeatureColor(feature.id),
          lineStringWidth: (feature: any) => getFeatureStroke(feature.id),
        },
      }),
      new TerraDrawPolygonMode({
        styles: {
          fillColor: (feature: any) => hexWithAlpha(getFeatureColor(feature.id), 0.25),
          outlineColor: (feature: any) => getFeatureColor(feature.id),
          outlineWidth: (feature: any) => getFeatureStroke(feature.id),
        },
      }),
      new TerraDrawRectangleMode({
        styles: {
          fillColor: (feature: any) => hexWithAlpha(getFeatureColor(feature.id), 0.25),
          outlineColor: (feature: any) => getFeatureColor(feature.id),
          outlineWidth: (feature: any) => getFeatureStroke(feature.id),
        },
      }),
      new TerraDrawCircleMode({
        styles: {
          fillColor: (feature: any) => hexWithAlpha(getFeatureColor(feature.id), 0.25),
          outlineColor: (feature: any) => getFeatureColor(feature.id),
          outlineWidth: (feature: any) => getFeatureStroke(feature.id),
        },
      }),
    ],
  });

  draw.start();

  // When a Terra Draw feature is finished, store its color
  draw.on('finish', (id: string) => {
    if (id) {
      featureStyles[String(id)] = { color: currentColor, stroke: currentStroke };
      saveUndoState();
    }
  });

  // Create SVG overlay for freehand/arrow
  const mapContainer = (map as any).getContainer() as HTMLElement;
  const svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgOverlay.setAttribute('class', 'fm-drawing-overlay');
  svgOverlay.innerHTML = `
    <defs id="fm-arrow-markers"></defs>
    <g id="fm-path-group"></g>
  `;
  mapContainer.appendChild(svgOverlay);

  const pathGroup = svgOverlay.querySelector('#fm-path-group') as SVGGElement;
  const arrowMarkers = svgOverlay.querySelector('#fm-arrow-markers') as SVGDefsElement;

  // Ensure arrow marker exists for a color
  function ensureArrowMarker(color: string) {
    const markerId = `fm-arrow-${color.replace('#', '')}`;
    if (document.getElementById(markerId)) return markerId;

    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', markerId);
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');
    marker.setAttribute('markerUnits', 'strokeWidth');

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
    polygon.setAttribute('fill', color);

    marker.appendChild(polygon);
    arrowMarkers.appendChild(marker);
    return markerId;
  }

  // Convert lat/lng points to SVG path data
  function pointsToPathData(points: Array<{ lng: number; lat: number }>): string {
    if (!points || points.length === 0) return '';
    
    const screenPoints = points.map(p => (map as any).project([p.lng, p.lat]));
    let d = `M ${screenPoints[0].x} ${screenPoints[0].y}`;
    for (let i = 1; i < screenPoints.length; i++) {
      d += ` L ${screenPoints[i].x} ${screenPoints[i].y}`;
    }
    return d;
  }

  // Redraw all freehand paths (called on map move/zoom)
  function redrawFreehandPaths() {
    pathGroup.innerHTML = '';
    
    freehandPaths.forEach((path, index) => {
      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('stroke', path.color);
      pathEl.setAttribute('stroke-width', String(path.stroke));
      pathEl.setAttribute('d', pointsToPathData(path.points));
      pathEl.dataset.index = String(index);

      if (path.type === 'arrow') {
        const markerId = ensureArrowMarker(path.color);
        pathEl.setAttribute('marker-end', `url(#${markerId})`);
      }

      pathGroup.appendChild(pathEl);
    });
  }

  // Get event point relative to map container
  function getEventPoint(e: MouseEvent | TouchEvent): { x: number; y: number } {
    const rect = mapContainer.getBoundingClientRect();
    if ('touches' in e && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: (e as MouseEvent).clientX - rect.left,
      y: (e as MouseEvent).clientY - rect.top,
    };
  }

  // Freehand drawing handlers
  function handleFreehandStart(e: MouseEvent | TouchEvent) {
    if (currentMode !== 'freehand' && currentMode !== 'arrow') return;

    isDrawingFreehand = true;
    const point = getEventPoint(e);
    const lngLat = (map as any).unproject([point.x, point.y]);

    currentFreehandPath = {
      id: `path-${Date.now()}`,
      points: [{ lng: lngLat.lng, lat: lngLat.lat }],
      color: currentColor,
      stroke: currentStroke,
      type: currentMode as 'freehand' | 'arrow',
    };

    // Create temporary path element
    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('stroke', currentColor);
    pathEl.setAttribute('stroke-width', String(currentStroke));
    pathEl.id = 'fm-current-path';

    if (currentMode === 'arrow') {
      const markerId = ensureArrowMarker(currentColor);
      pathEl.setAttribute('marker-end', `url(#${markerId})`);
    }

    pathGroup.appendChild(pathEl);
    updateCurrentPath();
  }

  function handleFreehandMove(e: MouseEvent | TouchEvent) {
    if (!isDrawingFreehand || !currentFreehandPath) return;

    const point = getEventPoint(e);
    const lngLat = (map as any).unproject([point.x, point.y]);

    // For arrow mode, just keep start and end points (straight line)
    if (currentFreehandPath.type === 'arrow') {
      if (currentFreehandPath.points.length === 1) {
        currentFreehandPath.points.push({ lng: lngLat.lng, lat: lngLat.lat });
      } else {
        currentFreehandPath.points[1] = { lng: lngLat.lng, lat: lngLat.lat };
      }
    } else {
      currentFreehandPath.points.push({ lng: lngLat.lng, lat: lngLat.lat });
    }
    updateCurrentPath();
  }

  function handleFreehandEnd() {
    if (!isDrawingFreehand || !currentFreehandPath) return;

    isDrawingFreehand = false;

    // Only save if we have more than 1 point
    if (currentFreehandPath.points.length > 1) {
      freehandPaths.push(currentFreehandPath);
      saveUndoState();
    }

    currentFreehandPath = null;

    // Remove temp path and redraw all
    const tempPath = document.getElementById('fm-current-path');
    if (tempPath) tempPath.remove();

    redrawFreehandPaths();
  }

  function updateCurrentPath() {
    if (!currentFreehandPath) return;
    const pathEl = document.getElementById('fm-current-path');
    if (!pathEl) return;
    pathEl.setAttribute('d', pointsToPathData(currentFreehandPath.points));
  }

  // Bind freehand events
  svgOverlay.addEventListener('mousedown', handleFreehandStart);
  svgOverlay.addEventListener('mousemove', handleFreehandMove);
  svgOverlay.addEventListener('mouseup', handleFreehandEnd);
  svgOverlay.addEventListener('mouseleave', handleFreehandEnd);
  svgOverlay.addEventListener('touchstart', (e) => { e.preventDefault(); handleFreehandStart(e); }, { passive: false });
  svgOverlay.addEventListener('touchmove', (e) => { e.preventDefault(); handleFreehandMove(e); }, { passive: false });
  svgOverlay.addEventListener('touchend', (e) => { e.preventDefault(); handleFreehandEnd(); }, { passive: false });

  // Redraw on map move/zoom
  (map as any).on('move', redrawFreehandPaths);
  (map as any).on('zoom', redrawFreehandPaths);

  // Undo/Redo
  function saveUndoState() {
    const state: UndoState = {
      freehandPaths: JSON.parse(JSON.stringify(freehandPaths)),
      terraFeatures: draw.getSnapshot(),
      featureStyles: JSON.parse(JSON.stringify(featureStyles)),
    };
    undoStack.push(JSON.stringify(state));
    redoStack = [];
    if (undoStack.length > 50) undoStack.shift();
    updateUndoRedoButtons();
  }

  function undo() {
    if (undoStack.length === 0) return;

    // Save current to redo
    const current: UndoState = {
      freehandPaths: JSON.parse(JSON.stringify(freehandPaths)),
      terraFeatures: draw.getSnapshot(),
      featureStyles: JSON.parse(JSON.stringify(featureStyles)),
    };
    redoStack.push(JSON.stringify(current));

    // Restore previous
    const prev: UndoState = JSON.parse(undoStack.pop()!);
    freehandPaths = prev.freehandPaths;
    redrawFreehandPaths();

    // Restore Terra Draw features
    draw.clear();
    Object.keys(featureStyles).forEach(k => delete featureStyles[k]);
    Object.assign(featureStyles, prev.featureStyles);
    if (prev.terraFeatures?.length) {
      prev.terraFeatures.forEach((f: any) => {
        try { draw.addFeatures([f]); } catch (_) {}
      });
    }

    updateUndoRedoButtons();
  }

  function redo() {
    if (redoStack.length === 0) return;

    // Save current to undo
    const current: UndoState = {
      freehandPaths: JSON.parse(JSON.stringify(freehandPaths)),
      terraFeatures: draw.getSnapshot(),
      featureStyles: JSON.parse(JSON.stringify(featureStyles)),
    };
    undoStack.push(JSON.stringify(current));

    // Restore next
    const next: UndoState = JSON.parse(redoStack.pop()!);
    freehandPaths = next.freehandPaths;
    redrawFreehandPaths();

    draw.clear();
    Object.keys(featureStyles).forEach(k => delete featureStyles[k]);
    Object.assign(featureStyles, next.featureStyles);
    if (next.terraFeatures?.length) {
      next.terraFeatures.forEach((f: any) => {
        try { draw.addFeatures([f]); } catch (_) {}
      });
    }

    updateUndoRedoButtons();
  }

  function clearAll() {
    if (freehandPaths.length === 0 && draw.getSnapshot().length === 0) return;
    saveUndoState();
    freehandPaths = [];
    redrawFreehandPaths();
    draw.clear();
    Object.keys(featureStyles).forEach(k => delete featureStyles[k]);
  }

  // Build toolbar
  const toolbar = document.createElement('div');
  toolbar.className = `fm-toolbar ${dcfg.position === 'top' ? 'top' : 'bottom'}`;

  const tools: DrawingMode[] = dcfg.tools?.length
    ? dcfg.tools
    : ['select', 'freehand', 'line', 'polygon', 'rectangle', 'circle', 'arrow'];

  const COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
    '#f43f5e', '#6366f1', '#14b8a6', '#84cc16',
    '#a855f7', '#0ea5e9', '#64748b', '#ffffff',
  ];

  const STROKES = [
    { width: 2, label: 'Fine' },
    { width: 4, label: 'Medium' },
    { width: 6, label: 'Bold' },
    { width: 10, label: 'Heavy' },
  ];

  // Tool buttons
  const groupTools = document.createElement('div');
  groupTools.className = 'fm-toolbar-group';

  const btns: Record<string, HTMLButtonElement> = {};

  function mkToolBtn(mode: DrawingMode, title: string, iconKey: string, enabled = true): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'fm-tool-btn';
    b.type = 'button';
    b.title = title;
    b.disabled = !enabled;
    b.innerHTML = svgIcon(iconKey);
    groupTools.appendChild(b);
    return b;
  }

  if (tools.includes('select')) btns.select = mkToolBtn('select', 'Select', 'select');
  if (tools.includes('freehand')) btns.freehand = mkToolBtn('freehand', 'Freehand', 'freehand');
  if (tools.includes('line')) btns.line = mkToolBtn('line', 'Line', 'line');
  if (tools.includes('polygon')) btns.polygon = mkToolBtn('polygon', 'Polygon', 'polygon');
  if (tools.includes('rectangle')) btns.rectangle = mkToolBtn('rectangle', 'Rectangle', 'rectangle');
  if (tools.includes('circle')) btns.circle = mkToolBtn('circle', 'Circle', 'circle');
  if (tools.includes('arrow')) btns.arrow = mkToolBtn('arrow', 'Arrow', 'arrow');

  toolbar.appendChild(groupTools);

  // Undo/Redo group
  const groupActions = document.createElement('div');
  groupActions.className = 'fm-toolbar-group';

  const undoBtn = document.createElement('button');
  undoBtn.className = 'fm-tool-btn';
  undoBtn.type = 'button';
  undoBtn.title = 'Undo';
  undoBtn.disabled = true;
  undoBtn.innerHTML = svgIcon('undo');
  undoBtn.addEventListener('click', (e) => { e.preventDefault(); undo(); });
  groupActions.appendChild(undoBtn);

  const redoBtn = document.createElement('button');
  redoBtn.className = 'fm-tool-btn';
  redoBtn.type = 'button';
  redoBtn.title = 'Redo';
  redoBtn.disabled = true;
  redoBtn.innerHTML = svgIcon('redo');
  redoBtn.addEventListener('click', (e) => { e.preventDefault(); redo(); });
  groupActions.appendChild(redoBtn);

  const clearBtn = document.createElement('button');
  clearBtn.className = 'fm-tool-btn';
  clearBtn.type = 'button';
  clearBtn.title = 'Clear All';
  clearBtn.innerHTML = svgIcon('trash');
  clearBtn.addEventListener('click', (e) => { e.preventDefault(); clearAll(); });
  groupActions.appendChild(clearBtn);

  toolbar.appendChild(groupActions);

  function updateUndoRedoButtons() {
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  }

  // Style group (color + stroke)
  const groupStyle = document.createElement('div');
  groupStyle.className = 'fm-toolbar-group';
  groupStyle.style.position = 'relative';

  // Color picker
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
      e.preventDefault();
      e.stopPropagation();
      currentColor = c;
      colorBtn.style.background = currentColor;
      colorBtn.style.setProperty('--fm-current-color', currentColor);
      Array.from(colorPop.querySelectorAll('.fm-color-opt')).forEach((el) => {
        (el as HTMLElement).classList.toggle('selected', (el as HTMLElement).style.background === currentColor);
      });
      colorPop.classList.remove('show');
    });
    colorPop.appendChild(opt);
  });

  colorBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    colorPop.classList.toggle('show');
    strokePop.classList.remove('show');
  });

  colorWrap.appendChild(colorBtn);
  colorWrap.appendChild(colorPop);

  // Stroke picker
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
      e.preventDefault();
      e.stopPropagation();
      currentStroke = s.width;
      Array.from(strokePop.querySelectorAll('.fm-stroke-opt')).forEach((el, i) => {
        (el as HTMLElement).classList.toggle('selected', STROKES[i].width === currentStroke);
      });
      strokePop.classList.remove('show');
    });
    strokePop.appendChild(opt);
  });

  strokeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    strokePop.classList.toggle('show');
    colorPop.classList.remove('show');
  });

  strokeWrap.appendChild(strokeBtn);
  strokeWrap.appendChild(strokePop);

  groupStyle.appendChild(colorWrap);
  groupStyle.appendChild(strokeWrap);
  toolbar.appendChild(groupStyle);

  document.body.appendChild(toolbar);

  // Mode switching
  function setMode(mode: DrawingMode) {
    currentMode = mode;

    // Update button states
    Object.entries(btns).forEach(([k, el]) => {
      el.classList.toggle('active', k === mode);
    });

    // SVG overlay modes: freehand and arrow
    if (mode === 'freehand' || mode === 'arrow') {
      svgOverlay.classList.add('active');
      try { draw.setMode('static'); } catch (_) {}
    } else {
      svgOverlay.classList.remove('active');
      // Terra Draw modes
      const terraMode = mode === 'line' ? 'linestring' : mode;
      try { draw.setMode(terraMode); } catch (_) {}
    }
  }

  Object.entries(btns).forEach(([k, el]) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setMode(k as DrawingMode);
    });
  });

  // Set initial mode
  setMode(currentMode);

  // Close popovers on outside click
  const onDocClick = () => {
    try { colorPop.classList.remove('show'); } catch (_) {}
    try { strokePop.classList.remove('show'); } catch (_) {}
  };
  document.addEventListener('click', onDocClick);

  // ESC to return to select mode
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      colorPop.classList.remove('show');
      strokePop.classList.remove('show');
      setMode('select');
    }
  };
  document.addEventListener('keydown', onKeyDown, true);

  // Load initial GeoJSON if provided
  if (dcfg.initialGeoJSON?.features?.length) {
    try {
      dcfg.initialGeoJSON.features.forEach((f: any) => {
        if (f.geometry?.type === 'LineString' || f.geometry?.type === 'Polygon') {
          draw.addFeatures([f]);
          if (f.properties?.stroke) {
            featureStyles[f.id || ''] = {
              color: f.properties.stroke,
              stroke: f.properties.strokeWidth || defaultWidth,
            };
          }
        }
      });
    } catch (_) {}
  }

  // Hide/show Terra Draw layers on the map
  function setTerraDrawLayersVisibility(visible: boolean) {
    try {
      const style = (map as any).getStyle?.();
      if (!style?.layers) return;
      
      // Terra Draw creates layers with 'terra-draw' in their ID
      for (const layer of style.layers) {
        const id = (layer as any)?.id;
        if (typeof id === 'string' && id.includes('terra-draw')) {
          try {
            (map as any).setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  // Visibility control
  let isVisible = true;
  const setVisible = (v: boolean) => {
    isVisible = v;
    toolbar.style.display = v ? 'flex' : 'none';
    svgOverlay.style.display = v ? 'block' : 'none';
    
    // Hide/show Terra Draw layers
    setTerraDrawLayersVisibility(v);
    
    // Disable interaction when hidden
    if (!v) {
      try { draw.setMode('static'); } catch (_) {}
    }
  };

  // Get all drawings as GeoJSON
  const getGeoJSON = () => {
    const features: any[] = [];

    // Terra Draw features
    try {
      const terraFeatures = draw.getSnapshot() || [];
      terraFeatures.forEach((f: any) => {
        const style = featureStyles[f.id] || {};
        features.push({
          ...f,
          properties: {
            ...f.properties,
            stroke: style.color || currentColor,
            strokeWidth: style.stroke || currentStroke,
            fill: hexToRgba(style.color || currentColor, 0.25),
          },
        });
      });
    } catch (_) {}

    // Freehand paths as LineStrings
    freehandPaths.forEach((path) => {
      features.push({
        type: 'Feature',
        id: path.id,
        properties: {
          stroke: path.color,
          strokeWidth: path.stroke,
          drawingType: path.type,
        },
        geometry: {
          type: 'LineString',
          coordinates: path.points.map(p => [p.lng, p.lat]),
        },
      });
    });

    return { type: 'FeatureCollection', features };
  };

  // Cleanup
  const destroy = () => {
    try { document.removeEventListener('click', onDocClick); } catch (_) {}
    try { document.removeEventListener('keydown', onKeyDown, true as any); } catch (_) {}
    try { toolbar.remove(); } catch (_) {}
    try { svgOverlay.remove(); } catch (_) {}
    try { (map as any).off('move', redrawFreehandPaths); } catch (_) {}
    try { (map as any).off('zoom', redrawFreehandPaths); } catch (_) {}
    try { draw.stop(); } catch (_) {}
  };

  return { destroy, setVisible, getGeoJSON };
}
