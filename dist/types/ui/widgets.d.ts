/**
 * Map widgets: scale, zoom/home, screenshot, basemap switcher, and Cmd+drag orbit.
 * Ported from map_utils.py for UI parity.
 */
import type { ViewState } from '../types';
export interface WidgetsHandle {
    destroy: () => void;
    setHomeViewState?: (view: ViewState) => void;
}
export interface BasemapOption {
    id: string;
    label: string;
    style: string;
    thumbnail: string;
}
export declare const DEFAULT_BASEMAPS: BasemapOption[];
export interface WidgetsConfig {
    screenshot?: boolean;
    basemapSwitcher?: boolean;
    currentStyle?: string;
    onStyleChange?: (basemap: BasemapOption) => void;
}
export declare function setupWidgets(map: mapboxgl.Map, initialView: ViewState, configOrScreenshot?: boolean | WidgetsConfig): WidgetsHandle;
