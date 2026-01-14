/**
 * Raster rendering
 *
 * Supports:
 * - Raster XYZ tiles (`tileUrl`)
 * - Static image overlay (`imageUrl` + `imageBounds`)
 */

import type { RasterLayerConfig } from '../types';

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function boundsToCoordinates(b: [number, number, number, number]) {
  const [west, south, east, north] = b;
  // Mapbox image source expects [[w,n],[e,n],[e,s],[w,s]]
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south]
  ] as [number, number][];
}

/**
 * Add a raster layer to the map
 */
export function addRasterLayer(
  map: mapboxgl.Map,
  layer: RasterLayerConfig,
  visible: boolean
): void {
  const opacity = layer.opacity ?? layer.rasterLayer?.opacity ?? 1.0;

  const hasTileUrl = typeof layer.tileUrl === 'string' && layer.tileUrl.length > 0;
  const hasImage = typeof layer.imageUrl === 'string' && layer.imageUrl.length > 0
    && Array.isArray(layer.imageBounds) && layer.imageBounds.length === 4;

  if (!hasTileUrl && !hasImage) {
    // Nothing to render
    return;
  }

  if (hasImage) {
    // Preload image to ensure it's ready before adding to map
    // This prevents race conditions where the layer renders before image loads
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Only add source/layer if they don't already exist (in case of retries)
      if (map.getSource(layer.id)) return;

      const coords = boundsToCoordinates(layer.imageBounds as any);
      map.addSource(layer.id, {
        type: 'image',
        url: layer.imageUrl as string,
        coordinates: coords as any
      } as any);

      map.addLayer({
        id: `${layer.id}-raster`,
        type: 'raster',
        source: layer.id,
        paint: { 'raster-opacity': clamp01(opacity) },
        layout: { visibility: visible ? 'visible' : 'none' }
      });
    };
    img.onerror = () => {
      console.warn(`[FusedMaps] Failed to load raster image: ${layer.imageUrl}`);
    };
    img.src = layer.imageUrl as string;
  } else {
    map.addSource(layer.id, {
      type: 'raster',
      tiles: [layer.tileUrl as string],
      tileSize: 256
    });

    map.addLayer({
      id: `${layer.id}-raster`,
      type: 'raster',
      source: layer.id,
      paint: { 'raster-opacity': clamp01(opacity) },
      layout: { visibility: visible ? 'visible' : 'none' }
    });
  }
}

/**
 * Toggle visibility of raster layer
 */
export function setRasterLayerVisibility(
  map: mapboxgl.Map,
  layerId: string,
  visible: boolean
): void {
  const id = `${layerId}-raster`;
  try {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
  } catch (e) {
    // Ignore errors
  }
}





