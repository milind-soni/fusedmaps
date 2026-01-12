/**
 * Location listener - receives click/location messages and flies map to bounds
 *
 * This enables cross-widget navigation, e.g., clicking a point in a scatter plot
 * causes the map to fly to that feature's location.
 */
export interface LocationListenerConfig {
    channel?: string;
    zoomOffset?: number;
    padding?: number;
    maxZoom?: number;
    idFields?: string[];
}
interface LocationListenerState {
    destroy: () => void;
}
/**
 * Enable location listener on a map
 *
 * Listens for messages with type 'feature_click', 'hex_click', or 'location_change'
 * that include bounds [west, south, east, north], and flies the map to those bounds.
 */
export declare function enableLocationListener(map: mapboxgl.Map, config?: LocationListenerConfig): LocationListenerState;
export {};
