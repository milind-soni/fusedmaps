/**
 * Click broadcast - sends click events when map features are clicked
 */

import type { LayerConfig } from '../types';
import { createBus, generateComponentId, type BusMessage } from './bus';

export interface ClickBroadcastConfig {
  channel?: string;
  messageType?: string;
  properties?: string[] | null;  // null = send all properties
  includeCoords?: boolean;
  includeLayer?: boolean;
}

interface ClickBroadcastState {
  destroy: () => void;
}

/**
 * Enable click broadcast on a map
 */
export function enableClickBroadcast(
  map: mapboxgl.Map,
  layers: LayerConfig[],
  deckOverlay: any | null,  // DeckTileOverlayState for hex tile layers
  config: ClickBroadcastConfig
): ClickBroadcastState {
  const channel = config.channel || 'fused-bus';
  const messageType = config.messageType || 'feature_click';
  const propertyFilter = config.properties || null;
  const includeCoords = config.includeCoords !== false;
  const includeLayer = config.includeLayer !== false;

  const componentId = generateComponentId('click-broadcast');
  const bus = createBus(channel);

  /**
   * Get all Mapbox layer IDs that should respond to clicks
   */
  function getClickableMapboxLayers(): string[] {
    const layerIds: string[] = [];

    for (const layerDef of layers) {
      // Skip tile layers (handled via deck.gl picking)
      if ((layerDef as any).isTileLayer) continue;

      if (layerDef.layerType === 'vector') {
        // Vector layers: fill, circle, line
        for (const suffix of ['-fill', '-circle', '-line']) {
          const id = `${layerDef.id}${suffix}`;
          try {
            if (map.getLayer(id)) layerIds.push(id);
          } catch {}
        }
      } else if (layerDef.layerType === 'hex') {
        // Non-tile hex layers: extrusion or fill
        const hexCfg = (layerDef as any).hexLayer || {};
        const ids = hexCfg.extruded
          ? [`${layerDef.id}-extrusion`]
          : [`${layerDef.id}-fill`];
        for (const id of ids) {
          try {
            if (map.getLayer(id)) layerIds.push(id);
          } catch {}
        }
      }
    }

    return layerIds;
  }

  /**
   * Find user-friendly layer name from layers config
   */
  function getLayerName(layerId: string): string {
    const layerDef = layers.find(l => layerId.startsWith(l.id));
    return layerDef?.name || layerDef?.id || layerId;
  }

  /**
   * Filter properties if specified, otherwise return all
   */
  function filterProperties(props: Record<string, any>): Record<string, any> {
    if (!propertyFilter || !Array.isArray(propertyFilter)) {
      return { ...props };
    }

    const filtered: Record<string, any> = {};
    for (const key of propertyFilter) {
      if (props[key] !== undefined) {
        filtered[key] = props[key];
      }
    }
    return filtered;
  }

  /**
   * Build and send click message
   */
  function broadcastClick(
    properties: Record<string, any>,
    layerName: string,
    lngLat?: { lng: number; lat: number }
  ): void {
    const message: BusMessage = {
      type: messageType,
      fromComponent: componentId,
      properties: filterProperties(properties),
      timestamp: Date.now()
    };

    if (includeCoords && lngLat) {
      message.lngLat = lngLat;
    }

    if (includeLayer) {
      message.layer = layerName;
    }

    bus.send(message);
  }

  /**
   * Handle click on Mapbox layers (vector, non-tile hex)
   */
  function handleMapboxClick(event: any): void {
    const clickableLayers = getClickableMapboxLayers();
    if (!clickableLayers.length) return;

    let features: any[] = [];
    try {
      features = map.queryRenderedFeatures(event.point, { layers: clickableLayers }) || [];
    } catch (err) {
      console.warn('[ClickBroadcast] Error querying features:', err);
      return;
    }

    if (!features.length) return;

    // Use the top-most feature
    const feature = features[0];
    const properties = feature.properties || {};
    const layerId = feature.layer?.id || '';
    const layerName = getLayerName(layerId);

    broadcastClick(properties, layerName, {
      lng: event.lngLat.lng,
      lat: event.lngLat.lat
    });
  }

  /**
   * Handle click on Deck.gl tile layers (hex tiles)
   */
  function handleDeckClick(event: any): void {
    if (!deckOverlay?.pickObject) return;

    // Check if we already handled this click via Mapbox layers
    const clickableLayers = getClickableMapboxLayers();
    if (clickableLayers.length) {
      try {
        const mapboxFeatures = map.queryRenderedFeatures(event.point, { layers: clickableLayers });
        if (mapboxFeatures?.length) return;  // Let Mapbox handler deal with it
      } catch {}
    }

    // Query Deck.gl for tile layer hits
    try {
      const pickInfo = deckOverlay.pickObject({
        x: event.point.x,
        y: event.point.y,
        radius: 1
      });

      if (!pickInfo?.object) return;

      const obj = pickInfo.object;
      const properties = obj.properties || obj || {};

      // Find the layer name from the pick info
      let layerName = 'hex-tiles';
      const pickLayerId = pickInfo.layer?.id || '';
      if (pickLayerId) {
        // Extract base layer ID from deck layer ID (e.g., "layer1-tiles-abc123-h3" -> "layer1")
        const match = pickLayerId.match(/^([^-]+)/);
        if (match) {
          const baseId = match[1];
          const layerDef = layers.find(l => l.id === baseId || l.id.startsWith(baseId));
          if (layerDef) {
            layerName = layerDef.name || layerDef.id;
          }
        }
      }

      broadcastClick(properties, layerName, {
        lng: event.lngLat.lng,
        lat: event.lngLat.lat
      });
    } catch (err) {
      console.warn('[ClickBroadcast] Error picking deck object:', err);
    }
  }

  /**
   * Combined click handler
   */
  function handleClick(event: any): void {
    // First try Mapbox layers
    handleMapboxClick(event);

    // Then try Deck.gl layers (will skip if Mapbox already handled)
    handleDeckClick(event);
  }

  // Set up click handler
  map.on('click', handleClick);

  function destroy(): void {
    map.off('click', handleClick);
    bus.destroy();
  }

  return { destroy };
}
