/**
 * Messaging module - cross-component communication
 */
import type { MessagingConfig, LayerConfig } from '../types';
export * from './bus';
export * from './broadcast';
export * from './click-broadcast';
export * from './sync';
interface MessagingState {
    clickBroadcastDestroy?: () => void;
}
/**
 * Setup all messaging based on config
 */
export declare function setupMessaging(map: mapboxgl.Map, config: MessagingConfig, layers: LayerConfig[], deckOverlay?: any): MessagingState;
