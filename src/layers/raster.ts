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
 * Fetch an image with retry logic and convert to data URL
 * This avoids network issues by giving us full control over the fetch
 */
async function fetchImageAsDataUrl(
  url: string,
  maxRetries: number = 3,
  baseDelay: number = 500
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read blob'));
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      lastError = err as Error;
      // Exponential backoff: 500ms, 1000ms, 2000ms
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError || new Error('Failed to fetch image');
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
    const coords = boundsToCoordinates(layer.imageBounds as any);
    const sourceId = layer.id;
    const layerIdRaster = `${layer.id}-raster`;

    // Fetch image with retry, convert to data URL, then add to map
    // This avoids network issues since Mapbox receives a data URL (no network request needed)
    fetchImageAsDataUrl(layer.imageUrl as string)
      .then((dataUrl) => {
        // Check if source already exists (in case of race conditions)
        if (map.getSource(sourceId)) return;

        // Add the source with data URL
        map.addSource(sourceId, {
          type: 'image',
          url: dataUrl,
          coordinates: coords as any
        } as any);

        // Add the layer
        map.addLayer({
          id: layerIdRaster,
          type: 'raster',
          source: sourceId,
          paint: { 'raster-opacity': clamp01(opacity) },
          layout: { visibility: visible ? 'visible' : 'none' }
        });
      })
      .catch((err) => {
        console.warn(`[FusedMaps] Failed to load raster image after retries: ${layer.imageUrl}`, err);
      });
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





