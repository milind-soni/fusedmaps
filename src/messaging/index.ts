/**
 * Messaging module - cross-component communication
 */

import type { MessagingConfig, LayerConfig } from '../types';
import { enableBroadcast } from './broadcast';
import { enableClickBroadcast, type ClickBroadcastConfig } from './click-broadcast';
import { enableSync } from './sync';
import { enableLocationListener, type LocationListenerConfig } from './location-listener';

export * from './bus';
export * from './broadcast';
export * from './click-broadcast';
export * from './sync';
export * from './location-listener';

interface MessagingState {
  clickBroadcastDestroy?: () => void;
  locationListenerDestroy?: () => void;
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

  // Location listener (receives feature_click messages and flies map to bounds)
  if (config.locationListener?.enabled) {
    const listenerConfig: LocationListenerConfig = {
      channel: config.locationListener.channel,
      zoomOffset: config.locationListener.zoomOffset,
      padding: config.locationListener.padding,
      maxZoom: config.locationListener.maxZoom,
      idFields: config.locationListener.idFields
    };
    const listenerState = enableLocationListener(map, listenerConfig);
    state.locationListenerDestroy = listenerState.destroy;
  }

  return state;
}






