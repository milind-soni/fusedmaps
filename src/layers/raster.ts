/**
 * Raster tile layer rendering
 */

import type { RasterLayerConfig } from '../types';

/**
 * Add a raster tile layer to the map
 */
export function addRasterLayer(
  map: mapboxgl.Map,
  layer: RasterLayerConfig,
  visible: boolean
): void {
  const opacity = layer.opacity ?? layer.rasterLayer?.opacity ?? 1.0;
  
  // Add raster tile source
  map.addSource(layer.id, {
    type: 'raster',
    tiles: [layer.tileUrl],
    tileSize: 256
  });
  
  // Add raster layer
  map.addLayer({
    id: `${layer.id}-raster`,
    type: 'raster',
    source: layer.id,
    paint: {
      'raster-opacity': Math.max(0, Math.min(1, opacity))
    },
    layout: { visibility: visible ? 'visible' : 'none' }
  });
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

