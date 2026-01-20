/**
 * Core map initialization
 */
import type { ViewState } from '../types';
interface MapInitOptions {
    containerId: string;
    mapboxToken: string;
    styleUrl: string;
    initialViewState: ViewState;
    screenshotEnabled?: boolean;
    minZoom?: number;
    maxZoom?: number;
}
/**
 * Initialize a Mapbox GL map
 */
export declare function initMap(options: MapInitOptions): mapboxgl.Map;
/**
 * Apply view state to an existing map
 */
export declare function applyViewState(map: mapboxgl.Map, viewState: Partial<ViewState>): void;
/**
 * Get current view state from map
 */
export declare function getViewState(map: mapboxgl.Map): ViewState;
export {};
