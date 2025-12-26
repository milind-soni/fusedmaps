/**
 * H3 Hexagon layer rendering
 *
 * Supports both static data (converted to GeoJSON) and tile-based loading via Deck.gl
 */
import type { HexLayerConfig } from '../types';
/**
 * Convert H3 hex ID to canonical string format
 */
export declare function toH3(hex: unknown): string | null;
/**
 * Convert H3 hex data array to GeoJSON FeatureCollection
 */
export declare function hexToGeoJSON(data: Array<Record<string, unknown>>): GeoJSON.FeatureCollection;
/**
 * Add a static hex layer to the map (using Mapbox GL)
 */
export declare function addStaticHexLayer(map: mapboxgl.Map, layer: HexLayerConfig, geojson: GeoJSON.FeatureCollection, visible: boolean): void;
/**
 * Toggle visibility of hex layer
 */
export declare function setHexLayerVisibility(map: mapboxgl.Map, layerId: string, visible: boolean, isExtruded: boolean): void;
