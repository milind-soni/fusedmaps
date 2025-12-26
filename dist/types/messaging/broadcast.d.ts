/**
 * Viewport broadcast - notify other components when map bounds change
 */
export interface BroadcastOptions {
    channel?: string;
    dataset?: string;
}
/**
 * Enable viewport bounds broadcast on a map
 */
export declare function enableBroadcast(map: mapboxgl.Map, options?: BroadcastOptions): () => void;
