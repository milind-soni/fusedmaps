/**
 * Map widgets: scale, zoom/home, screenshot, and Cmd+drag orbit.
 * Ported from map_utils.py for UI parity.
 */
import type { ViewState } from '../types';
export interface WidgetsHandle {
    destroy: () => void;
    setHomeViewState?: (view: ViewState) => void;
}
export declare function setupWidgets(map: mapboxgl.Map, initialView: ViewState, screenshotEnabled: boolean): WidgetsHandle;
