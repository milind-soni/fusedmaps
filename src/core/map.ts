/**
 * Core map initialization
 */

import type { ViewState } from '../types';

interface MapInitOptions {
  containerId: string;
  mapboxToken: string;
  styleUrl: string;
  initialViewState: ViewState;
}

/**
 * Initialize a Mapbox GL map
 */
export function initMap(options: MapInitOptions): mapboxgl.Map {
  const { containerId, mapboxToken, styleUrl, initialViewState } = options;
  
  // Set access token
  (window.mapboxgl as any).accessToken = mapboxToken;
  
  // Create map
  const map = new window.mapboxgl.Map({
    container: containerId,
    style: styleUrl,
    center: [initialViewState.longitude, initialViewState.latitude],
    zoom: initialViewState.zoom,
    pitch: initialViewState.pitch || 0,
    bearing: initialViewState.bearing || 0,
    projection: 'mercator'
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

