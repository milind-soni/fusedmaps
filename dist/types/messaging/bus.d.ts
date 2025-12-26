/**
 * Message bus utilities for cross-component communication
 *
 * Uses BroadcastChannel API + postMessage fallback for iframe communication
 */
export interface BusMessage {
    type: string;
    fromComponent?: string;
    timestamp?: number;
    [key: string]: unknown;
}
/**
 * Create a message bus for a channel
 */
export declare function createBus(channel: string): {
    send: (message: BusMessage) => void;
    onMessage: (callback: (message: BusMessage) => void) => void;
    destroy: () => void;
};
/**
 * Generate a unique component ID
 */
export declare function generateComponentId(prefix?: string): string;
