/**
 * Debug panel (minimal) - ported from map_utils.py.
 *
 * Goal: quick view-state editing + JSON dumps for debugging.
 */

import type { FusedMapsConfig, ViewState } from '../types';
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

export function setupDebugPanel(map: mapboxgl.Map, config: FusedMapsConfig): DebugHandle {
  let shell = document.getElementById('debug-shell');
  if (!shell) {
    shell = document.createElement('div');
    shell.id = 'debug-shell';
    shell.innerHTML = `
      <div id="debug-panel">
        <div id="debug-content">
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
            <div class="debug-section-title">Config</div>
            <textarea id="dbg-config-output" class="debug-output" readonly></textarea>
          </div>
        </div>
      </div>
      <div id="debug-toggle" title="Toggle debug panel">&#x2039;</div>
    `;
    document.body.appendChild(shell);
  }

  const panel = document.getElementById('debug-panel') as HTMLElement;
  const toggle = document.getElementById('debug-toggle') as HTMLElement;

  const lngEl = document.getElementById('dbg-lng') as HTMLInputElement;
  const latEl = document.getElementById('dbg-lat') as HTMLInputElement;
  const zoomEl = document.getElementById('dbg-zoom') as HTMLInputElement;
  const pitchEl = document.getElementById('dbg-pitch') as HTMLInputElement;
  const bearingEl = document.getElementById('dbg-bearing') as HTMLInputElement;
  const viewOut = document.getElementById('dbg-view-output') as HTMLTextAreaElement;
  const cfgOut = document.getElementById('dbg-config-output') as HTMLTextAreaElement;

  const initial: ViewState = config.initialViewState;
  cfgOut.value = JSON.stringify(
    {
      initialViewState: config.initialViewState,
      styleUrl: config.styleUrl,
      layers: config.layers
    },
    null,
    2
  );

  const updateFromMap = () => {
    try {
      const vs = getViewState(map);
      viewOut.value = JSON.stringify(vs, null, 2);
      // Don't stomp inputs while user is typing
      if (shell && isEditingInputs(shell)) return;
      lngEl.value = fmt(vs.longitude, 5);
      latEl.value = fmt(vs.latitude, 5);
      zoomEl.value = fmt(vs.zoom, 2);
      pitchEl.value = fmt(vs.pitch ?? 0, 1);
      bearingEl.value = fmt(vs.bearing ?? 0, 1);
    } catch (_) {}
  };

  const apply = () => {
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
    } catch (_) {
      // ignore
    }
  };

  const onToggle = () => {
    const collapsed = panel.classList.toggle('collapsed');
    toggle.innerHTML = collapsed ? '&#x203A;' : '&#x2039;';
  };

  const onApply = (e: any) => {
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch (_) {}
    apply();
  };

  const onCopy = async (e: any) => {
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch (_) {}
    await copyCurrent();
  };

  toggle.addEventListener('click', onToggle);
  (document.getElementById('dbg-apply') as HTMLElement).addEventListener('click', onApply);
  (document.getElementById('dbg-copy') as HTMLElement).addEventListener('click', onCopy);

  // Keep the panel width in sync with the toggle position
  try {
    (shell as any).style.setProperty('--debug-panel-w', `${panel.getBoundingClientRect().width}px`);
  } catch (_) {}

  const onMove = () => updateFromMap();
  try {
    map.on('move', onMove);
    map.on('moveend', onMove);
    map.on('pitch', onMove);
    map.on('rotate', onMove);
  } catch (_) {}

  updateFromMap();

  return {
    destroy: () => {
      try {
        toggle.removeEventListener('click', onToggle);
      } catch (_) {}
      try {
        (document.getElementById('dbg-apply') as HTMLElement).removeEventListener('click', onApply);
        (document.getElementById('dbg-copy') as HTMLElement).removeEventListener('click', onCopy);
      } catch (_) {}
      try {
        map.off('move', onMove);
        map.off('moveend', onMove);
        map.off('pitch', onMove);
        map.off('rotate', onMove);
      } catch (_) {}
      try {
        shell?.remove();
      } catch (_) {}
    }
  };
}


