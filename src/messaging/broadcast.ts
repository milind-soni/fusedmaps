/**
 * Viewport broadcast - notify other components when map bounds change
 */

import { createBus, generateComponentId, BusMessage } from './bus';
import { getBoundsArray, boundsEqual } from '../core/view';

export interface BroadcastOptions {
  channel?: string;
  dataset?: string;
}

/**
 * Enable viewport bounds broadcast on a map
 */
export function enableBroadcast(
  map: mapboxgl.Map,
  options: BroadcastOptions = {}
): () => void {
  const channel = options.channel || 'fused-bus';
  const dataset = options.dataset || 'all';
  const componentId = generateComponentId('map-broadcast');
  
  const bus = createBus(channel);
  let lastBounds: [number, number, number, number] | null = null;
  
  function broadcastBounds(): void {
    const bounds = getBoundsArray(map);
    if (boundsEqual(bounds, lastBounds)) return;
    lastBounds = bounds;

    const [west, south, east, north] = bounds;
    bus.send({
      type: 'filter',
      fromComponent: componentId,
      timestamp: Date.now(),
      dataset: dataset,
      filter: { type: 'spatial', field: 'geometry', values: [west, south, east, north] }
    });
  }
  
  // Listen for map movement
  map.on('move', broadcastBounds);
  map.on('moveend', broadcastBounds);
  
  // Initial broadcast on load
  map.on('load', () => {
    setTimeout(broadcastBounds, 300);
  });
  
  // If map is already loaded, broadcast now
  if (map.loaded()) {
    setTimeout(broadcastBounds, 100);
  }
  
  // Announce component ready
  setTimeout(() => {
    bus.send({
      type: 'component_ready',
      componentType: 'map',
      componentId: componentId,
      capabilities: ['spatial_filter'],
      dataSource: 'viewport',
      protocol: 'unified'
    });
  }, 200);
  
  // Return cleanup function
  return () => {
    map.off('move', broadcastBounds);
    map.off('moveend', broadcastBounds);
    bus.destroy();
  };
}

