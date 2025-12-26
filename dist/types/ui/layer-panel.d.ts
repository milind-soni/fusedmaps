/**
 * Layer visibility toggle panel
 * Matching the original map_utils.py design with eye icons and gradient strips
 */
import type { LayerConfig } from '../types';
type VisibilityCallback = (layerId: string, visible: boolean) => void;
/**
 * Setup the layer panel
 */
export declare function setupLayerPanel(layers: LayerConfig[], visibilityState: Record<string, boolean>, onVisibilityChange: VisibilityCallback): void;
/**
 * Update the layer panel UI
 */
export declare function updateLayerPanel(layers: LayerConfig[], visibilityState: Record<string, boolean>): void;
export {};
