/**
 * LayerStore - Centralized state management for all map layers.
 *
 * This is the single source of truth for:
 * - Layer configurations
 * - Visibility state
 * - Render order
 * - Computed GeoJSONs
 *
 * Components subscribe to changes via events instead of passing state around.
 */
import type { LayerConfig } from '../types';
import type { FeatureCollection } from 'geojson';
export interface LayerState {
    config: LayerConfig;
    visible: boolean;
    order: number;
    geojson?: FeatureCollection;
}
export type LayerEventType = 'add' | 'remove' | 'update' | 'visibility' | 'reorder' | 'geojson' | 'batch';
export interface LayerEvent {
    type: LayerEventType;
    layerId: string;
    layer?: LayerState;
    changes?: Partial<LayerConfig>;
    previousOrder?: number;
    newOrder?: number;
}
export type LayerEventCallback = (event: LayerEvent) => void;
export declare class LayerStore {
    private layers;
    private listeners;
    private nextOrder;
    constructor();
    /**
     * Initialize store with layers from config.
     * Clears existing state.
     */
    init(layers: LayerConfig[]): void;
    /**
     * Add a new layer.
     * @param config Layer configuration
     * @param options.order Insert at specific order (default: end)
     * @returns The new layer state
     */
    add(config: LayerConfig, options?: {
        order?: number;
    }): LayerState;
    /**
     * Remove a layer by ID.
     */
    remove(layerId: string): boolean;
    /**
     * Update a layer's configuration.
     * Merges with existing config.
     */
    update(layerId: string, changes: Partial<LayerConfig>): LayerState | undefined;
    /**
     * Update nested layer style (hexLayer, vectorLayer, etc.)
     */
    updateStyle(layerId: string, styleProp: string, styleChanges: Record<string, unknown>): LayerState | undefined;
    /**
     * Set layer visibility.
     */
    setVisible(layerId: string, visible: boolean): void;
    /**
     * Toggle layer visibility.
     */
    toggleVisible(layerId: string): boolean;
    /**
     * Set visibility for multiple layers.
     */
    setVisibleBatch(updates: Record<string, boolean>): void;
    /**
     * Move a layer to a specific order index.
     */
    reorder(layerId: string, newOrder: number): void;
    /**
     * Move layer up one position (renders on top).
     */
    moveUp(layerId: string): void;
    /**
     * Move layer down one position (renders below).
     */
    moveDown(layerId: string): void;
    /**
     * Move layer to top (highest render order).
     */
    moveToTop(layerId: string): void;
    /**
     * Move layer to bottom (lowest render order).
     */
    moveToBottom(layerId: string): void;
    /**
     * Set the computed GeoJSON for a layer.
     */
    setGeoJSON(layerId: string, geojson: FeatureCollection): void;
    /**
     * Get GeoJSON for a layer.
     */
    getGeoJSON(layerId: string): FeatureCollection | undefined;
    /**
     * Get all GeoJSONs as a record (for legend/tooltip compatibility).
     */
    getAllGeoJSONs(): Record<string, FeatureCollection>;
    /**
     * Get a layer by ID.
     */
    get(layerId: string): LayerState | undefined;
    /**
     * Get layer config by ID.
     */
    getConfig(layerId: string): LayerConfig | undefined;
    /**
     * Check if a layer exists.
     */
    has(layerId: string): boolean;
    /**
     * Get all layers ordered by render order.
     */
    getAll(): LayerState[];
    /**
     * Get all layer configs ordered by render order.
     */
    getAllConfigs(): LayerConfig[];
    /**
     * Get visible layers ordered by render order.
     */
    getVisible(): LayerState[];
    /**
     * Get visible layer configs.
     */
    getVisibleConfigs(): LayerConfig[];
    /**
     * Get visibility state as a record (for compatibility).
     */
    getVisibilityState(): Record<string, boolean>;
    /**
     * Get layers by type.
     */
    getByType(type: LayerConfig['layerType']): LayerState[];
    /**
     * Get total layer count.
     */
    get size(): number;
    /**
     * Subscribe to layer events.
     * @param event Event type or '*' for all events
     * @param callback Callback function
     * @returns Unsubscribe function
     */
    on(event: LayerEventType | '*', callback: LayerEventCallback): () => void;
    /**
     * Unsubscribe from layer events.
     */
    off(event: LayerEventType | '*', callback: LayerEventCallback): void;
    /**
     * Emit an event to all listeners.
     */
    private emit;
    /**
     * Shift all orders >= startOrder by delta.
     */
    private shiftOrdersFrom;
    /**
     * Recompute orders to be contiguous (0, 1, 2, ...).
     */
    private recomputeOrders;
    /**
     * Clone a layer with a new ID.
     */
    clone(layerId: string, newId: string, newName?: string): LayerState | undefined;
    /**
     * Rename a layer.
     */
    rename(layerId: string, newName: string): void;
    /**
     * Clear all layers.
     */
    clear(): void;
    /**
     * Export current state as serializable object.
     */
    export(): {
        layers: LayerConfig[];
        visibility: Record<string, boolean>;
    };
}
/**
 * Create a new LayerStore instance (for testing or isolated use).
 */
export declare function createLayerStore(): LayerStore;
