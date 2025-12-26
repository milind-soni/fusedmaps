/**
 * Messaging module - cross-component communication
 */
import type { MessagingConfig, LayerConfig } from '../types';
export * from './bus';
export * from './broadcast';
export * from './sync';
/**
 * Setup all messaging based on config
 */
export declare function setupMessaging(map: mapboxgl.Map, config: MessagingConfig, layers: LayerConfig[]): void;
