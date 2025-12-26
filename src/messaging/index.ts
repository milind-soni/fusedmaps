/**
 * Messaging module - cross-component communication
 */

import type { MessagingConfig, LayerConfig } from '../types';
import { enableBroadcast } from './broadcast';
import { enableSync } from './sync';

export * from './bus';
export * from './broadcast';
export * from './sync';

/**
 * Setup all messaging based on config
 */
export function setupMessaging(
  map: mapboxgl.Map,
  config: MessagingConfig,
  layers: LayerConfig[]
): void {
  // Viewport broadcast
  if (config.broadcast?.enabled) {
    enableBroadcast(map, {
      channel: config.broadcast.channel,
      dataset: config.broadcast.dataset
    });
  }
  
  // Map sync
  if (config.sync?.enabled) {
    enableSync(map, {
      channel: config.sync.channel
    });
  }
  
  // Click broadcast (TODO: implement)
  if (config.clickBroadcast?.enabled) {
    // enableClickBroadcast(map, layers, config.clickBroadcast);
  }
  
  // Location listener (TODO: implement)
  if (config.locationListener?.enabled) {
    // enableLocationListener(map, config.locationListener);
  }
}

