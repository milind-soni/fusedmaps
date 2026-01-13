/**
 * Location search widget using Mapbox Geocoding API
 */
export interface GeocoderOptions {
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center';
    placeholder?: string;
    mapboxToken: string;
}
export interface GeocoderHandle {
    destroy: () => void;
}
/**
 * Setup the geocoder/location search widget
 */
export declare function setupGeocoder(map: mapboxgl.Map, options: GeocoderOptions): GeocoderHandle;
