/**
 * Map widgets: scale, zoom/home, screenshot, and Cmd+drag orbit.
 * Ported from map_utils.py for UI parity.
 */

import type { ViewState } from '../types';

export interface WidgetsHandle {
  destroy: () => void;
}

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

function addScaleControl(map: mapboxgl.Map) {
  try {
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left');
  } catch (_) {}
}

function addZoomHomeControl(map: mapboxgl.Map, initialView: ViewState, screenshotEnabled: boolean) {
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
            center: [initialView.longitude, initialView.latitude],
            zoom: Number.isFinite(initialView.zoom) ? initialView.zoom : m.getZoom(),
            pitch: Number.isFinite(initialView.pitch ?? 0) ? (initialView.pitch ?? 0) : m.getPitch(),
            bearing: Number.isFinite(initialView.bearing ?? 0) ? (initialView.bearing ?? 0) : m.getBearing(),
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
    map.addControl(new ZoomHomeControl() as any, 'bottom-left');
  } catch (_) {}
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

export function setupWidgets(map: mapboxgl.Map, initialView: ViewState, screenshotEnabled: boolean): WidgetsHandle {
  addScaleControl(map);
  addZoomHomeControl(map, initialView, screenshotEnabled);
  const cleanupOrbit = enableCmdDragOrbit(map);

  return {
    destroy: () => {
      try {
        cleanupOrbit();
      } catch (_) {}
    }
  };
}


