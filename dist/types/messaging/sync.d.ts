/**
 * Map sync - synchronize multiple maps' viewports
 */
export interface SyncOptions {
    channel?: string;
}
/**
 * Enable map sync on a map
 */
export declare function enableSync(map: mapboxgl.Map, options?: SyncOptions): () => void;
