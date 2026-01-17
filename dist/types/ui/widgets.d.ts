/**
 * Map widgets: scale, zoom/home, screenshot, basemap switcher, and Cmd+drag orbit.
 * Ported from map_utils.py for UI parity.
 */
import type { ViewState, WidgetPosition } from '../types';
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
export interface WidgetsSetupConfig {
    screenshot?: boolean;
    basemapSwitcher?: boolean;
    currentStyle?: string;
    onStyleChange?: (basemap: BasemapOption) => void;
    positions?: {
        controls?: WidgetPosition | false;
        scale?: WidgetPosition | false;
        basemap?: WidgetPosition | false;
    };
}
export declare function setupWidgets(map: mapboxgl.Map, initialView: ViewState, configOrScreenshot?: boolean | WidgetsSetupConfig): WidgetsHandle;
