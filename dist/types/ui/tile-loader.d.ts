/**
 * Shared tile loader spinner for all tile-based layers (Deck.gl hex tiles, MVT, raster, PMTiles)
 */
/**
 * Update loading count and show/hide spinner
 */
export declare function setTileLoading(delta: number): void;
/**
 * Track Mapbox vector/raster source loading
 * Returns cleanup function
 */
export declare function trackMapboxTileLoading(map: mapboxgl.Map, sourceIds: string[]): () => void;
