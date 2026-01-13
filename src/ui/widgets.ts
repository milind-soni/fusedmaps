/**
 * Map widgets: scale, zoom/home, screenshot, basemap switcher, and Cmd+drag orbit.
 * Ported from map_utils.py for UI parity.
 */

import type { ViewState } from '../types';

export interface WidgetsHandle {
  destroy: () => void;
  setHomeViewState?: (view: ViewState) => void;
}

// ============================================================
// Basemap Definitions
// ============================================================

export interface BasemapOption {
  id: string;
  label: string;
  style: string;
  thumbnail: string; // CSS background (gradient or image URL)
}

export const DEFAULT_BASEMAPS: BasemapOption[] = [
  {
    id: 'dark',
    label: 'Dark',
    style: 'mapbox://styles/mapbox/dark-v11',
    thumbnail: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)'
  },
  {
    id: 'satellite',
    label: 'Satellite',
    style: 'mapbox://styles/mapbox/satellite-streets-v12',
    thumbnail: 'linear-gradient(135deg, #2d5016 0%, #1a3a0f 50%, #0d2818 100%)'
  },
  {
    id: 'light',
    label: 'Light',
    style: 'mapbox://styles/mapbox/light-v11',
    thumbnail: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 50%, #d0d0d0 100%)'
  },
  {
    id: 'streets',
    label: 'Streets',
    style: 'mapbox://styles/mapbox/streets-v12',
    thumbnail: 'linear-gradient(135deg, #e8e4d9 0%, #d4cfc0 50%, #b8c4a8 100%)'
  }
];

function downloadScreenshot(map: mapboxgl.Map) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `map-screenshot-${ts}.png`;

  try {
    const canvas = map.getCanvas();
    const a = document.createElement('a');
    a.download = filename;

    // Prefer Blob download: more reliable filename/extension across browsers than data URLs.
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(
        (blob) => {
          try {
            if (!blob) throw new Error('toBlob returned null');
            const url = URL.createObjectURL(blob);
            a.href = url;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Screenshot failed:', e);
            alert(
              'Screenshot blocked (likely due to CORS/tainted canvas from raster tiles). Try using only CORS-enabled layers/tiles.'
            );
          }
        },
        'image/png'
      );
      return;
    }

    // Fallback: data URL
    const dataUrl = canvas.toDataURL('image/png');
    a.href = dataUrl;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (e) {
    // Likely CORS/tainted canvas due to raster tiles
    // eslint-disable-next-line no-console
    console.error('Screenshot failed:', e);
    alert(
      'Screenshot blocked (likely due to CORS/tainted canvas from raster tiles). Try using only CORS-enabled layers/tiles.'
    );
  }
}

function addScaleControl(map: mapboxgl.Map, position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' = 'bottom-left') {
  try {
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 110, unit: 'metric' }), position);
  } catch (_) {}
}

function addZoomHomeControl(
  map: mapboxgl.Map,
  initialView: ViewState,
  screenshotEnabled: boolean,
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' = 'bottom-left'
): { setHomeViewState: (view: ViewState) => void } {
  // Keep home target mutable so callers can update it after auto-fit.
  const homeView: ViewState = { ...initialView };

  const setHomeViewState = (v: ViewState) => {
    try {
      if (!v) return;
      if (typeof v.longitude === 'number' && Number.isFinite(v.longitude)) homeView.longitude = v.longitude;
      if (typeof v.latitude === 'number' && Number.isFinite(v.latitude)) homeView.latitude = v.latitude;
      if (typeof v.zoom === 'number' && Number.isFinite(v.zoom)) homeView.zoom = v.zoom;
      if (typeof v.pitch === 'number' && Number.isFinite(v.pitch)) homeView.pitch = v.pitch;
      if (typeof v.bearing === 'number' && Number.isFinite(v.bearing)) homeView.bearing = v.bearing;
    } catch (_) {}
  };

  class ZoomHomeControl {
    private _map?: mapboxgl.Map;
    private _container?: HTMLElement;

    onAdd(m: mapboxgl.Map) {
      this._map = m;
      const container = document.createElement('div');
      container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

      const mkBtn = (label: string, title: string, onClick: () => void) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.title = title;
        b.setAttribute('aria-label', title);
        b.style.fontSize = '16px';
        b.style.lineHeight = '20px';
        b.style.fontWeight = '600';
        b.style.display = 'flex';
        b.style.alignItems = 'center';
        b.style.justifyContent = 'center';
        b.textContent = label;
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            onClick();
          } catch (_) {}
        });
        return b;
      };

      const mkSvgBtn = (svgHtml: string, title: string, onClick: () => void) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.title = title;
        b.setAttribute('aria-label', title);
        b.style.display = 'flex';
        b.style.alignItems = 'center';
        b.style.justifyContent = 'center';
        b.innerHTML = svgHtml;
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            onClick();
          } catch (_) {}
        });
        return b;
      };

      container.appendChild(mkBtn('+', 'Zoom in', () => m.zoomIn({ duration: 250 })));
      container.appendChild(mkBtn('−', 'Zoom out', () => m.zoomOut({ duration: 250 })));
      container.appendChild(
        mkBtn('⌂', 'Reset view', () => {
          m.easeTo({
            center: [homeView.longitude, homeView.latitude],
            zoom: Number.isFinite(homeView.zoom) ? homeView.zoom : m.getZoom(),
            pitch: Number.isFinite(homeView.pitch ?? 0) ? (homeView.pitch ?? 0) : m.getPitch(),
            bearing: Number.isFinite(homeView.bearing ?? 0) ? (homeView.bearing ?? 0) : m.getBearing(),
            duration: 600
          });
        })
      );

      if (screenshotEnabled) {
        container.appendChild(
          mkSvgBtn(
            `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block">
              <path d="M4 8h3l1.2-2h7.6L17 8h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z"/>
              <circle cx="12" cy="14" r="3.2"/>
            </svg>`,
            'Download screenshot',
            () => downloadScreenshot(m)
          )
        );
      }

      this._container = container;
      return container;
    }

    onRemove() {
      try {
        this._container?.parentNode?.removeChild(this._container);
      } catch (_) {}
      this._map = undefined;
      this._container = undefined;
    }
  }

  try {
    map.addControl(new ZoomHomeControl() as any, position);
  } catch (_) {}

  return { setHomeViewState };
}

function enableCmdDragOrbit(map: mapboxgl.Map): () => void {
  const canvas: any = (map as any).getCanvasContainer?.() || (map as any).getCanvas?.();
  if (!canvas) return () => {};

  let active = false;
  let startX = 0;
  let startY = 0;
  let startBearing = 0;
  let startPitch = 0;

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const PITCH_MIN = 0;
  const PITCH_MAX = 85;
  const SPEED_PITCH = 0.25; // degrees per pixel
  const SPEED_BEARING = 0.35; // degrees per pixel

  const stop = () => {
    if (!active) return;
    active = false;
    try {
      map.dragPan.enable();
    } catch (_) {}
    try {
      canvas.style.cursor = '';
    } catch (_) {}
    window.removeEventListener('pointermove', onMove as any, { passive: false } as any);
    window.removeEventListener('pointerup', onUp as any, { passive: false } as any);
    window.removeEventListener('pointercancel', onUp as any, { passive: false } as any);
  };

  const onMove = (e: PointerEvent) => {
    if (!active) return;
    if (!(e as any).metaKey) return stop();
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    map.setBearing(startBearing + dx * SPEED_BEARING);
    map.setPitch(clamp(startPitch - dy * SPEED_PITCH, PITCH_MIN, PITCH_MAX));
    e.preventDefault();
  };

  const onUp = (e: PointerEvent) => {
    stop();
    try {
      e.preventDefault();
    } catch (_) {}
  };

  const onDown = (e: PointerEvent) => {
    // Block Mapbox default ctrl+drag rotate so Cmd becomes the shortcut.
    if (e.button === 0 && (e as any).ctrlKey && !(e as any).metaKey) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (active) return;
    if (e.button !== 0) return;
    if (!(e as any).metaKey) return;

    active = true;
    startX = e.clientX;
    startY = e.clientY;
    startBearing = map.getBearing();
    startPitch = map.getPitch();
    try {
      map.dragPan.disable();
    } catch (_) {}
    try {
      canvas.style.cursor = 'grabbing';
    } catch (_) {}

    window.addEventListener('pointermove', onMove as any, { passive: false });
    window.addEventListener('pointerup', onUp as any, { passive: false });
    window.addEventListener('pointercancel', onUp as any, { passive: false });
    e.stopPropagation();
    e.preventDefault();
  };

  canvas.addEventListener('pointerdown', onDown as any, { passive: false, capture: true });

  return () => {
    try {
      stop();
    } catch (_) {}
    try {
      canvas.removeEventListener('pointerdown', onDown as any, { capture: true } as any);
    } catch (_) {}
  };
}

// ============================================================
// Basemap Switcher Control
// ============================================================

// Map icon for basemap switcher
const MAP_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/></svg>';

interface BasemapSwitcherOptions {
  basemaps?: BasemapOption[];
  currentStyle: string;
  onStyleChange?: (basemap: BasemapOption) => void;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

function addBasemapSwitcher(
  map: mapboxgl.Map,
  options: BasemapSwitcherOptions
): { destroy: () => void; setActive: (id: string) => void } {
  const basemaps = options.basemaps || DEFAULT_BASEMAPS;

  // Find current basemap from style URL
  const findCurrentBasemap = (styleUrl: string): string => {
    const match = basemaps.find(b => styleUrl.includes(b.id));
    return match?.id || basemaps[0]?.id || 'dark';
  };

  let activeId = findCurrentBasemap(options.currentStyle);
  let isExpanded = false;

  // Wrapper for trigger + panel
  const wrapper = document.createElement('div');
  wrapper.className = 'fm-basemap-switcher';

  // Trigger button with map icon
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'fm-basemap-trigger';
  trigger.title = 'Change basemap';
  trigger.setAttribute('aria-label', 'Change basemap');
  trigger.innerHTML = MAP_ICON_SVG;

  // Expandable horizontal panel (Google Maps-like)
  const panel = document.createElement('div');
  panel.className = 'fm-basemap-options';

  // Create thumbnail buttons
  const buttons: Map<string, HTMLButtonElement> = new Map();

  basemaps.forEach((basemap) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = basemap.label;
    btn.setAttribute('data-basemap', basemap.id);
    btn.className = `fm-basemap-option${basemap.id === activeId ? ' is-active' : ''}`;

    const thumb = document.createElement('div');
    thumb.className = 'fm-basemap-option-thumb';
    thumb.style.background = basemap.thumbnail;
    const label = document.createElement('div');
    label.className = 'fm-basemap-option-label';
    label.textContent = basemap.label;
    btn.appendChild(thumb);
    btn.appendChild(label);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Update active states
      buttons.forEach((b, id) => {
        try { b.classList.toggle('is-active', id === basemap.id); } catch (_) {}
      });

      activeId = basemap.id;

      // Collapse panel
      isExpanded = false;
      try { wrapper.classList.remove('is-open'); } catch (_) {}

      // Switch map style
      try {
        (map as any).setStyle(basemap.style);
      } catch (err) {
        console.error('[BasemapSwitcher] Failed to set style:', err);
      }

      // Callback
      if (options.onStyleChange) {
        try {
          options.onStyleChange(basemap);
        } catch (_) {}
      }
    });

    btn.addEventListener('mouseenter', () => {
      if (basemap.id !== activeId) {
        try { btn.classList.add('is-hover'); } catch (_) {}
      }
    });

    btn.addEventListener('mouseleave', () => {
      if (basemap.id !== activeId) {
        try { btn.classList.remove('is-hover'); } catch (_) {}
      }
    });

    buttons.set(basemap.id, btn);
    panel.appendChild(btn);
  });

  const close = () => {
    isExpanded = false;
    try { wrapper.classList.remove('is-open'); } catch (_) {}
  };

  const open = () => {
    isExpanded = true;
    try { wrapper.classList.add('is-open'); } catch (_) {}
  };

  // Toggle on trigger click
  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isExpanded) close();
    else open();
  });

  // Close panel when clicking outside
  const closeOnOutsideClick = (e: MouseEvent) => {
    if (isExpanded && !wrapper.contains(e.target as Node)) {
      close();
    }
  };

  const closeOnEscape = (e: KeyboardEvent) => {
    if (!isExpanded) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  document.addEventListener('click', closeOnOutsideClick);
  document.addEventListener('keydown', closeOnEscape);

  // Assemble wrapper
  wrapper.appendChild(trigger);
  wrapper.appendChild(panel);

  try {
    // Insert at beginning (column-reverse means first child appears at bottom)
    const pos = options.position || 'bottom-left';
    const ctrlContainer = (map as any).getContainer().querySelector(`.mapboxgl-ctrl-${pos}`);
    if (ctrlContainer) {
      ctrlContainer.insertBefore(wrapper, ctrlContainer.firstChild);
    }
  } catch (_) {}

  return {
    destroy: () => {
      try {
        document.removeEventListener('click', closeOnOutsideClick);
        document.removeEventListener('keydown', closeOnEscape);
        wrapper.remove();
      } catch (_) {}
    },
    setActive: (id: string) => {
      const btn = buttons.get(id);
      if (btn) {
        buttons.forEach((b, bid) => {
          try { b.classList.toggle('is-active', bid === id); } catch (_) {}
        });
        activeId = id;
      }
    }
  };
}

// ============================================================
// Setup All Widgets
// ============================================================

type WidgetPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface WidgetsSetupConfig {
  screenshot?: boolean;
  basemapSwitcher?: boolean;
  currentStyle?: string;
  onStyleChange?: (basemap: BasemapOption) => void;
  // Widget positions (false = disabled)
  positions?: {
    controls?: WidgetPosition | false;
    scale?: WidgetPosition | false;
    basemap?: WidgetPosition | false;
  };
}

export function setupWidgets(
  map: mapboxgl.Map,
  initialView: ViewState,
  configOrScreenshot: boolean | WidgetsSetupConfig = true
): WidgetsHandle {
  // Backwards compatibility: accept boolean for screenshotEnabled
  const config: WidgetsSetupConfig = typeof configOrScreenshot === 'boolean'
    ? { screenshot: configOrScreenshot }
    : configOrScreenshot;

  const pos = config.positions || {};
  const controlsPos = pos.controls ?? 'bottom-left';
  const scalePos = pos.scale ?? 'bottom-left';
  const basemapPos = pos.basemap ?? 'bottom-left';

  // Scale control
  if (scalePos !== false) {
    addScaleControl(map, scalePos);
  }

  // Zoom/Home/Screenshot controls
  let zh: { setHomeViewState: (view: ViewState) => void } | null = null;
  if (controlsPos !== false) {
    zh = addZoomHomeControl(map, initialView, config.screenshot !== false, controlsPos);
  }

  const cleanupOrbit = enableCmdDragOrbit(map);

  // Basemap switcher
  let basemapSwitcherHandle: { destroy: () => void } | null = null;
  if (config.basemapSwitcher !== false && basemapPos !== false) {
    basemapSwitcherHandle = addBasemapSwitcher(map, {
      currentStyle: config.currentStyle || '',
      onStyleChange: config.onStyleChange,
      position: basemapPos
    });
  }

  return {
    destroy: () => {
      try {
        cleanupOrbit();
      } catch (_) {}
      try {
        basemapSwitcherHandle?.destroy();
      } catch (_) {}
    },
    setHomeViewState: zh?.setHomeViewState
  };
}


