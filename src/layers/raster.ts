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
    // Add image source directly - Mapbox handles loading internally
    // We use a sourcedata event listener to ensure the image is loaded before showing
    const coords = boundsToCoordinates(layer.imageBounds as any);
    const sourceId = layer.id;
    const layerIdRaster = `${layer.id}-raster`;

    // Add the source
    map.addSource(sourceId, {
      type: 'image',
      url: layer.imageUrl as string,
      coordinates: coords as any
    } as any);

    // Add the layer (initially hidden to prevent flicker)
    map.addLayer({
      id: layerIdRaster,
      type: 'raster',
      source: sourceId,
      paint: { 'raster-opacity': clamp01(opacity) },
      layout: { visibility: 'none' }
    });

    // Listen for source data to know when image is loaded
    const onSourceData = (e: any) => {
      if (e.sourceId === sourceId && e.isSourceLoaded) {
        map.off('sourcedata', onSourceData);
        // Now show the layer if it should be visible
        if (visible) {
          try {
            map.setLayoutProperty(layerIdRaster, 'visibility', 'visible');
          } catch (_) {}
        }
      }
    };
    map.on('sourcedata', onSourceData);

    // Fallback: show after timeout if sourcedata doesn't fire
    setTimeout(() => {
      map.off('sourcedata', onSourceData);
      if (visible && map.getLayer(layerIdRaster)) {
        try {
          map.setLayoutProperty(layerIdRaster, 'visibility', 'visible');
        } catch (_) {}
      }
    }, 3000);
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





