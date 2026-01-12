/**
 * Messaging module - cross-component communication
 */

import type { MessagingConfig, LayerConfig } from '../types';
import { enableBroadcast } from './broadcast';
import { enableClickBroadcast, type ClickBroadcastConfig } from './click-broadcast';
import { enableSync } from './sync';

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
export function setupMessaging(
  map: mapboxgl.Map,
  config: MessagingConfig,
  layers: LayerConfig[],
  deckOverlay?: any  // DeckTileOverlayState for hex tile layer picking
): MessagingState {
  const state: MessagingState = {};

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

  // Click broadcast
  if (config.clickBroadcast?.enabled) {
    const clickConfig: ClickBroadcastConfig = {
      channel: config.clickBroadcast.channel,
      messageType: config.clickBroadcast.messageType,
      properties: config.clickBroadcast.properties,
      includeCoords: config.clickBroadcast.includeCoords,
      includeLayer: config.clickBroadcast.includeLayer
    };
    const clickState = enableClickBroadcast(map, layers, deckOverlay || null, clickConfig);
    state.clickBroadcastDestroy = clickState.destroy;
  }

  // Location listener (TODO: implement)
  if (config.locationListener?.enabled) {
    // enableLocationListener(map, config.locationListener);
  }

  return state;
}






