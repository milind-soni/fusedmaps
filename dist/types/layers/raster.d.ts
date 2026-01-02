/**
 * Raster rendering
 *
 * Supports:
 * - Raster XYZ tiles (`tileUrl`)
 * - Static image overlay (`imageUrl` + `imageBounds`)
 */
import type { RasterLayerConfig } from '../types';
/**
 * Add a raster layer to the map
 */
export declare function addRasterLayer(map: mapboxgl.Map, layer: RasterLayerConfig, visible: boolean): void;
/**
 * Toggle visibility of raster layer
 */
export declare function setRasterLayerVisibility(map: mapboxgl.Map, layerId: string, visible: boolean): void;
