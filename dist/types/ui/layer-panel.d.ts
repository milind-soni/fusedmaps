/**
 * Layer visibility toggle panel
 * Matching the original map_utils.py design with eye icons and gradient strips
 *
 * Now integrates with LayerStore for centralized state management.
 */
import type { LayerConfig } from '../types';
import type { LayerStore } from '../state';
type VisibilityCallback = (layerId: string, visible: boolean) => void;
type WidgetPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
/**
 * Setup the layer panel
 */
export declare function setupLayerPanel(layers: LayerConfig[], visibilityState: Record<string, boolean>, onVisibilityChange: VisibilityCallback, store?: LayerStore, position?: WidgetPosition, expanded?: boolean): {
    destroy: () => void;
};
/**
 * Update the layer panel UI (legacy interface for compatibility)
 */
export declare function updateLayerPanel(layers: LayerConfig[], visibilityState: Record<string, boolean>): void;
export {};
