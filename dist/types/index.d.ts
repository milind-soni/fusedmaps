/**
 * FusedMaps - Interactive map library for Fused.io
 *
 * Renders H3 hexagon layers, GeoJSON vectors, MVT tiles, and raster tiles
 * using Mapbox GL JS and Deck.gl.
 */
import type { FusedMapsConfig, FusedMapsInstance } from './types';
export * from './types';
/**
 * Initialize a FusedMaps instance
 */
export declare function init(config: FusedMapsConfig): FusedMapsInstance;
declare const _default: {
    init: typeof init;
};
export default _default;
