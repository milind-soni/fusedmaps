/**
 * Map sync - synchronize multiple maps' viewports
 */

import { createBus, generateComponentId } from './bus';
import { getViewState } from '../core/map';
import type { ViewState } from '../types';

export interface SyncOptions {
  channel?: string;
}

interface SyncState extends ViewState {
  id: string;
  ts: number;
}

/**
 * Enable map sync on a map
 */
export function enableSync(
  map: mapboxgl.Map,
  options: SyncOptions = {}
): () => void {
  let channel = options.channel || 'default';
  if (!channel.includes('::')) {
    channel = `map-sync::${channel}`;
  }
  
  const mapId = generateComponentId('map');
  const bus = createBus(channel);
  
  let isSyncing = false;
  let userInteracting = false;
  let lastBroadcast = { x: NaN, y: NaN, z: NaN };
  
  const eq = (a: number, b: number, e: number) => Math.abs(a - b) < e;
  
  function getState(): SyncState {
    const center = map.getCenter();
    return {
      longitude: +center.lng.toFixed(6),
      latitude: +center.lat.toFixed(6),
      zoom: +map.getZoom().toFixed(3),
      bearing: +map.getBearing().toFixed(1),
      pitch: +map.getPitch().toFixed(1),
      id: mapId,
      ts: Date.now()
    };
  }
  
  function broadcast(): void {
    if (isSyncing) return;
    
    const state = getState();
    const { longitude: x, latitude: y, zoom: z } = state;
    
    if (eq(x, lastBroadcast.x, 1e-6) &&
        eq(y, lastBroadcast.y, 1e-6) &&
        eq(z, lastBroadcast.z, 1e-3)) {
      return;
    }
    
    lastBroadcast = { x, y, z };
    bus.send({ type: 'sync', ...state });
  }
  
  function applySync(state: SyncState): void {
    if (!state || state.id === mapId) return;
    if (isSyncing || userInteracting) return;
    
    isSyncing = true;
    map.jumpTo({
      center: [state.longitude, state.latitude],
      zoom: state.zoom,
      bearing: state.bearing,
      pitch: state.pitch
    });
    
    requestAnimationFrame(() => {
      isSyncing = false;
    });
  }
  
  let moveTimeout: ReturnType<typeof setTimeout> | null = null;
  
  function scheduleBroadcast(): void {
    if (moveTimeout) clearTimeout(moveTimeout);
    moveTimeout = setTimeout(broadcast, 0);
  }
  
  const startInteraction = () => {
    userInteracting = true;
  };
  
  const finishInteraction = () => {
    if (!userInteracting) return;
    userInteracting = false;
    broadcast();
  };
  
  // Event listeners
  map.on('dragstart', startInteraction);
  map.on('zoomstart', startInteraction);
  map.on('rotatestart', startInteraction);
  map.on('pitchstart', startInteraction);
  map.on('moveend', finishInteraction);
  
  map.on('move', () => {
    if (userInteracting && !isSyncing) scheduleBroadcast();
  });
  
  // Listen for sync messages
  bus.onMessage((msg) => {
    if (msg.type === 'sync' && (msg as unknown as SyncState).id !== mapId) {
      applySync(msg as unknown as SyncState);
    }
  });
  
  // Initial sync on load
  map.on('load', () => {
    setTimeout(() => bus.send({ type: 'sync', ...getState() }), 100 + Math.random() * 100);
  });
  
  // Handle visibility change
  const onVisibilityChange = () => {
    if (document.hidden) {
      isSyncing = false;
      userInteracting = false;
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  
  // Return cleanup function
  return () => {
    map.off('dragstart', startInteraction);
    map.off('zoomstart', startInteraction);
    map.off('rotatestart', startInteraction);
    map.off('pitchstart', startInteraction);
    map.off('moveend', finishInteraction);
    try { document.removeEventListener('visibilitychange', onVisibilityChange); } catch (_) {}
    bus.destroy();
  };
}

