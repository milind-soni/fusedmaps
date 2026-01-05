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

import type { LayerConfig, HexLayerConfig, VectorLayerConfig, PMTilesLayerConfig, RasterLayerConfig, MVTLayerConfig } from '../types';
import type { FeatureCollection } from 'geojson';

// ============================================================
// Types
// ============================================================

export interface LayerState {
  config: LayerConfig;
  visible: boolean;
  order: number;
  geojson?: FeatureCollection;
}

export type LayerEventType = 
  | 'add'
  | 'remove'
  | 'update'
  | 'visibility'
  | 'reorder'
  | 'geojson'
  | 'batch'; // For bulk updates

export interface LayerEvent {
  type: LayerEventType;
  layerId: string;
  layer?: LayerState;
  changes?: Partial<LayerConfig>;
  previousOrder?: number;
  newOrder?: number;
}

export type LayerEventCallback = (event: LayerEvent) => void;

// ============================================================
// LayerStore Class
// ============================================================

export class LayerStore {
  private layers: Map<string, LayerState> = new Map();
  private listeners: Map<LayerEventType | '*', Set<LayerEventCallback>> = new Map();
  private nextOrder: number = 0;

  constructor() {
    // Initialize listener maps
    this.listeners.set('*', new Set());
  }

  // ============================================================
  // Initialization
  // ============================================================

  /**
   * Initialize store with layers from config.
   * Clears existing state.
   */
  init(layers: LayerConfig[]): void {
    this.layers.clear();
    this.nextOrder = 0;

    layers.forEach((config, idx) => {
      const state: LayerState = {
        config,
        visible: config.visible !== false,
        order: idx,
      };
      this.layers.set(config.id, state);
      this.nextOrder = Math.max(this.nextOrder, idx + 1);
    });

    this.emit({ type: 'batch', layerId: '*' });
  }

  // ============================================================
  // CRUD Operations
  // ============================================================

  /**
   * Add a new layer.
   * @param config Layer configuration
   * @param options.order Insert at specific order (default: end)
   * @returns The new layer state
   */
  add(config: LayerConfig, options?: { order?: number }): LayerState {
    if (this.layers.has(config.id)) {
      console.warn(`[LayerStore] Layer ${config.id} already exists, updating instead`);
      return this.update(config.id, config) as LayerState;
    }

    const order = options?.order ?? this.nextOrder;
    
    // Shift existing layers if inserting
    if (options?.order !== undefined) {
      this.shiftOrdersFrom(order, 1);
    }

    const state: LayerState = {
      config,
      visible: config.visible !== false,
      order,
    };

    this.layers.set(config.id, state);
    this.nextOrder = Math.max(this.nextOrder, order + 1);

    this.emit({ type: 'add', layerId: config.id, layer: state });
    return state;
  }

  /**
   * Remove a layer by ID.
   */
  remove(layerId: string): boolean {
    const layer = this.layers.get(layerId);
    if (!layer) return false;

    this.layers.delete(layerId);
    
    // Compact orders
    this.recomputeOrders();

    this.emit({ type: 'remove', layerId, layer });
    return true;
  }

  /**
   * Update a layer's configuration.
   * Merges with existing config.
   */
  update(layerId: string, changes: Partial<LayerConfig>): LayerState | undefined {
    const layer = this.layers.get(layerId);
    if (!layer) {
      console.warn(`[LayerStore] Layer ${layerId} not found`);
      return undefined;
    }

    // Deep merge the config
    layer.config = { ...layer.config, ...changes } as LayerConfig;

    // Handle visibility if it was in the changes
    if ('visible' in changes) {
      layer.visible = changes.visible !== false;
    }

    this.emit({ type: 'update', layerId, layer, changes });
    return layer;
  }

  /**
   * Update nested layer style (hexLayer, vectorLayer, etc.)
   */
  updateStyle(layerId: string, styleProp: string, styleChanges: Record<string, unknown>): LayerState | undefined {
    const layer = this.layers.get(layerId);
    if (!layer) return undefined;

    const config = layer.config as any;
    if (!config[styleProp]) {
      config[styleProp] = {};
    }
    config[styleProp] = { ...config[styleProp], ...styleChanges };

    this.emit({ type: 'update', layerId, layer, changes: { [styleProp]: config[styleProp] } });
    return layer;
  }

  // ============================================================
  // Visibility
  // ============================================================

  /**
   * Set layer visibility.
   */
  setVisible(layerId: string, visible: boolean): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;

    if (layer.visible === visible) return; // No change

    layer.visible = visible;
    layer.config.visible = visible;

    this.emit({ type: 'visibility', layerId, layer });
  }

  /**
   * Toggle layer visibility.
   */
  toggleVisible(layerId: string): boolean {
    const layer = this.layers.get(layerId);
    if (!layer) return false;

    this.setVisible(layerId, !layer.visible);
    return layer.visible;
  }

  /**
   * Set visibility for multiple layers.
   */
  setVisibleBatch(updates: Record<string, boolean>): void {
    Object.entries(updates).forEach(([id, visible]) => {
      const layer = this.layers.get(id);
      if (layer && layer.visible !== visible) {
        layer.visible = visible;
        layer.config.visible = visible;
      }
    });
    this.emit({ type: 'batch', layerId: '*' });
  }

  // ============================================================
  // Ordering
  // ============================================================

  /**
   * Move a layer to a specific order index.
   */
  reorder(layerId: string, newOrder: number): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;

    const previousOrder = layer.order;
    if (previousOrder === newOrder) return;

    // Clamp to valid range
    const maxOrder = this.layers.size - 1;
    newOrder = Math.max(0, Math.min(maxOrder, newOrder));

    // Shift other layers
    this.layers.forEach((l, id) => {
      if (id === layerId) return;
      
      if (previousOrder < newOrder) {
        // Moving down: shift layers between previous and new up
        if (l.order > previousOrder && l.order <= newOrder) {
          l.order--;
        }
      } else {
        // Moving up: shift layers between new and previous down
        if (l.order >= newOrder && l.order < previousOrder) {
          l.order++;
        }
      }
    });

    layer.order = newOrder;

    this.emit({ type: 'reorder', layerId, layer, previousOrder, newOrder });
  }

  /**
   * Move layer up one position (renders on top).
   */
  moveUp(layerId: string): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;
    this.reorder(layerId, layer.order + 1);
  }

  /**
   * Move layer down one position (renders below).
   */
  moveDown(layerId: string): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;
    this.reorder(layerId, layer.order - 1);
  }

  /**
   * Move layer to top (highest render order).
   */
  moveToTop(layerId: string): void {
    this.reorder(layerId, this.layers.size - 1);
  }

  /**
   * Move layer to bottom (lowest render order).
   */
  moveToBottom(layerId: string): void {
    this.reorder(layerId, 0);
  }

  // ============================================================
  // GeoJSON (computed data)
  // ============================================================

  /**
   * Set the computed GeoJSON for a layer.
   */
  setGeoJSON(layerId: string, geojson: FeatureCollection): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;

    layer.geojson = geojson;
    this.emit({ type: 'geojson', layerId, layer });
  }

  /**
   * Get GeoJSON for a layer.
   */
  getGeoJSON(layerId: string): FeatureCollection | undefined {
    return this.layers.get(layerId)?.geojson;
  }

  /**
   * Get all GeoJSONs as a record (for legend/tooltip compatibility).
   */
  getAllGeoJSONs(): Record<string, FeatureCollection> {
    const result: Record<string, FeatureCollection> = {};
    this.layers.forEach((layer, id) => {
      if (layer.geojson) {
        result[id] = layer.geojson;
      }
    });
    return result;
  }

  // ============================================================
  // Queries
  // ============================================================

  /**
   * Get a layer by ID.
   */
  get(layerId: string): LayerState | undefined {
    return this.layers.get(layerId);
  }

  /**
   * Get layer config by ID.
   */
  getConfig(layerId: string): LayerConfig | undefined {
    return this.layers.get(layerId)?.config;
  }

  /**
   * Check if a layer exists.
   */
  has(layerId: string): boolean {
    return this.layers.has(layerId);
  }

  /**
   * Get all layers ordered by render order.
   */
  getAll(): LayerState[] {
    return [...this.layers.values()].sort((a, b) => a.order - b.order);
  }

  /**
   * Get all layer configs ordered by render order.
   */
  getAllConfigs(): LayerConfig[] {
    return this.getAll().map(l => l.config);
  }

  /**
   * Get visible layers ordered by render order.
   */
  getVisible(): LayerState[] {
    return this.getAll().filter(l => l.visible);
  }

  /**
   * Get visible layer configs.
   */
  getVisibleConfigs(): LayerConfig[] {
    return this.getVisible().map(l => l.config);
  }

  /**
   * Get visibility state as a record (for compatibility).
   */
  getVisibilityState(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    this.layers.forEach((layer, id) => {
      result[id] = layer.visible;
    });
    return result;
  }

  /**
   * Get layers by type.
   */
  getByType(type: LayerConfig['layerType']): LayerState[] {
    return this.getAll().filter(l => l.config.layerType === type);
  }

  /**
   * Get total layer count.
   */
  get size(): number {
    return this.layers.size;
  }

  // ============================================================
  // Event System
  // ============================================================

  /**
   * Subscribe to layer events.
   * @param event Event type or '*' for all events
   * @param callback Callback function
   * @returns Unsubscribe function
   */
  on(event: LayerEventType | '*', callback: LayerEventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from layer events.
   */
  off(event: LayerEventType | '*', callback: LayerEventCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  /**
   * Emit an event to all listeners.
   */
  private emit(event: LayerEvent): void {
    // Notify specific listeners
    this.listeners.get(event.type)?.forEach(cb => {
      try { cb(event); } catch (e) { console.error('[LayerStore] Event handler error:', e); }
    });

    // Notify wildcard listeners
    this.listeners.get('*')?.forEach(cb => {
      try { cb(event); } catch (e) { console.error('[LayerStore] Event handler error:', e); }
    });
  }

  // ============================================================
  // Utilities
  // ============================================================

  /**
   * Shift all orders >= startOrder by delta.
   */
  private shiftOrdersFrom(startOrder: number, delta: number): void {
    this.layers.forEach(layer => {
      if (layer.order >= startOrder) {
        layer.order += delta;
      }
    });
  }

  /**
   * Recompute orders to be contiguous (0, 1, 2, ...).
   */
  private recomputeOrders(): void {
    const sorted = this.getAll();
    sorted.forEach((layer, idx) => {
      layer.order = idx;
    });
    this.nextOrder = sorted.length;
  }

  /**
   * Clone a layer with a new ID.
   */
  clone(layerId: string, newId: string, newName?: string): LayerState | undefined {
    const layer = this.layers.get(layerId);
    if (!layer) return undefined;

    const clonedConfig = JSON.parse(JSON.stringify(layer.config)) as LayerConfig;
    clonedConfig.id = newId;
    if (newName) {
      clonedConfig.name = newName;
    }

    return this.add(clonedConfig, { order: layer.order + 1 });
  }

  /**
   * Rename a layer.
   */
  rename(layerId: string, newName: string): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;

    layer.config.name = newName;
    this.emit({ type: 'update', layerId, layer, changes: { name: newName } });
  }

  /**
   * Clear all layers.
   */
  clear(): void {
    this.layers.clear();
    this.nextOrder = 0;
    this.emit({ type: 'batch', layerId: '*' });
  }

  /**
   * Export current state as serializable object.
   */
  export(): { layers: LayerConfig[]; visibility: Record<string, boolean> } {
    return {
      layers: this.getAllConfigs(),
      visibility: this.getVisibilityState(),
    };
  }
}

/**
 * Create a new LayerStore instance (for testing or isolated use).
 */
export function createLayerStore(): LayerStore {
  return new LayerStore();
}

