/**
 * Core map initialization
 */

import type { ViewState } from '../types';

interface MapInitOptions {
  containerId: string;
  mapboxToken: string;
  styleUrl: string;
  initialViewState: ViewState;
  screenshotEnabled?: boolean;
}

/**
 * Initialize a Mapbox GL map
 */
export function initMap(options: MapInitOptions): mapboxgl.Map {
  const { containerId, mapboxToken, styleUrl, initialViewState, screenshotEnabled } = options;
  
  // Set access token
  (window.mapboxgl as any).accessToken = mapboxToken;
  
  // Create map with compact attribution by default
  const map = new window.mapboxgl.Map({
    container: containerId,
    style: styleUrl,
    center: [initialViewState.longitude, initialViewState.latitude],
    zoom: initialViewState.zoom,
    pitch: initialViewState.pitch || 0,
    bearing: initialViewState.bearing || 0,
    projection: 'mercator',
    // Match map_utils.py: enable pitch behavior; Cmd+drag orbit is implemented separately.
    pitchWithRotate: true,
    // Disable default attribution, we'll add compact one
    attributionControl: false,
    // Needed for reliable canvas capture (screenshot button). May increase GPU memory usage.
    ...(screenshotEnabled ? { preserveDrawingBuffer: true } : {})
  });

  // Add compact attribution control
  map.addControl(new window.mapboxgl.AttributionControl({ compact: true }));

  // Suppress benign Mapbox GL image loading errors (sprite/icon race conditions during style changes)
  map.on('error', (e: any) => {
    const msg = e?.error?.message || '';
    // Suppress known benign errors
    if (msg.includes('Could not load image') || msg.includes('not, or is no longer, usable')) {
      // Silently ignore - these are transient sprite loading issues during style switches
      return;
    }
    // Log other errors normally
    // eslint-disable-next-line no-console
    console.warn('[FusedMaps] Map error:', e?.error || e);
  });

  return map;
}

/**
 * Apply view state to an existing map
 */
export function applyViewState(map: mapboxgl.Map, viewState: Partial<ViewState>): void {
  if (viewState.longitude !== undefined && viewState.latitude !== undefined) {
    map.setCenter([viewState.longitude, viewState.latitude]);
  }
  if (viewState.zoom !== undefined) {
    map.setZoom(viewState.zoom);
  }
  if (viewState.pitch !== undefined) {
    map.setPitch(viewState.pitch);
  }
  if (viewState.bearing !== undefined) {
    map.setBearing(viewState.bearing);
  }
}

/**
 * Get current view state from map
 */
export function getViewState(map: mapboxgl.Map): ViewState {
  const center = map.getCenter();
  return {
    longitude: center.lng,
    latitude: center.lat,
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing()
  };
}

