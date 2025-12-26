/**
 * Layer visibility toggle panel
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
