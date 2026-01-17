/**
 * Location search widget using Mapbox Geocoding API
 */
import type { WidgetPosition } from '../types';
export interface GeocoderOptions {
    position?: WidgetPosition;
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
