/**
 * Location listener - receives click/location messages and flies map to bounds
 *
 * This enables cross-widget navigation, e.g., clicking a point in a scatter plot
 * causes the map to fly to that feature's location.
 */

import { createBus, generateComponentId, type BusMessage } from './bus';

export interface LocationListenerConfig {
  channel?: string;
  zoomOffset?: number;   // Extra zoom after fitBounds (default: 0)
  padding?: number;      // Padding for fitBounds (default: 50)
  maxZoom?: number;      // Max zoom level (default: 18)
  idFields?: string[];   // Fields to use for feature matching
}

interface LocationListenerState {
  destroy: () => void;
}

/**
 * Enable location listener on a map
 *
 * Listens for messages with type 'feature_click', 'hex_click', or 'location_change'
 * that include bounds [west, south, east, north], and flies the map to those bounds.
 */
export function enableLocationListener(
  map: mapboxgl.Map,
  config: LocationListenerConfig = {}
): LocationListenerState {
  const channel = config.channel || 'fused-bus';
  const zoomOffset = config.zoomOffset ?? 0;
  const padding = config.padding ?? 100;  // More padding = less zoom
  const maxZoom = config.maxZoom ?? 16;   // Lower max zoom like legacy

  const componentId = generateComponentId('location-listener');
  const bus = createBus(channel);

  /**
   * Handle incoming location/click messages
   */
  function handleMessage(msg: BusMessage): void {
    if (!msg) return;

    // Skip messages from this component
    if (msg.fromComponent === componentId) return;

    const type = msg.type || (msg as any).message_type;

    // Handle clear selection
    if (type === 'clear_selection' || type === 'feature_deselect') {
      try {
        // Clear highlight if available
        if (typeof (window as any).__fusedHighlightClear === 'function') {
          (window as any).__fusedHighlightClear();
        } else if (map.getSource('feature-hl')) {
          const src = map.getSource('feature-hl') as any;
          if (src && typeof src.setData === 'function') {
            src.setData({ type: 'FeatureCollection', features: [] });
          }
        }
      } catch {}
      return;
    }

    // Handle location/click messages with bounds
    if (type === 'location_change' || type === 'feature_click' || type === 'hex_click') {
      // Support both top-level bounds and nested location.bounds (from selector.py)
      const bounds = (msg as any).bounds || (msg as any).location?.bounds;
      const properties = (msg as any).properties || (msg as any).location;

      const selectionType = (msg as any).selectionType;

      // Skip highlighting for feature_click messages from this map's click-broadcast
      // (the highlight handler already handles map clicks directly)
      const source = (msg as any).fromComponent || '';
      const isFromMapClick = type === 'feature_click' && source.startsWith('click-broadcast');

      // For FARM selection: zoom only, no highlighting
      // For FIELD selection and other messages: highlight the feature
      // Skip for map clicks (already highlighted by click handler)
      if (!isFromMapClick && selectionType !== 'farm' && properties && typeof (window as any).__fusedHighlightByProperties === 'function') {
        try {
          // Build a normalized properties object for matching
          const matchProps: Record<string, any> = {};

          // Handle explicit field selection (from dropdown)
          if (selectionType === 'field' && properties.field) {
            // Match by Field Name only
            matchProps['Field Name'] = properties.field;
            matchProps['field_name'] = properties.field;
            matchProps['name'] = properties.field;
            matchProps['Name'] = properties.field;
          }
          // Handle generic location messages (backwards compatibility)
          else {
            // Copy all properties
            Object.assign(matchProps, properties);

            // If location.name exists, add common name variants
            if (properties.name) {
              matchProps['name'] = properties.name;
              matchProps['Name'] = properties.name;
              matchProps['NAME'] = properties.name;
              matchProps['Field Name'] = properties.name;
              matchProps['field_name'] = properties.name;
            }

            // If location.farm exists, add common farm name variants
            if (properties.farm) {
              matchProps['farm'] = properties.farm;
              matchProps['Farm'] = properties.farm;
              matchProps['FARM'] = properties.farm;
              matchProps['Farm Name'] = properties.farm;
              matchProps['farm_name'] = properties.farm;
            }
          }

          (window as any).__fusedHighlightByProperties(matchProps, false);
        } catch {}

      }

      // Re-broadcast as feature_click so charts can highlight too
      // (charts listen for feature_click, not location_change)
      // Only re-broadcast for location_change from dropdown, NOT for feature_click from map
      if (type === 'location_change' && selectionType === 'field' && properties?.field) {
        const rebroadcast = {
          type: 'feature_click',
          fromComponent: componentId,
          source: 'fusedmaps-location-listener',
          properties: { 'Field Name': properties.field },
          bounds: bounds
        };
        console.log('[LocationListener] Re-broadcasting field selection:', rebroadcast);
        try {
          bus.send(rebroadcast);
        } catch (e) {
          console.warn('[LocationListener] Re-broadcast failed:', e);
        }
      }

      // Clear highlight when selecting a farm (zoom only)
      if (selectionType === 'farm') {
        try {
          if (typeof (window as any).__fusedHighlightClear === 'function') {
            (window as any).__fusedHighlightClear();
          }
        } catch {}
      }

      if (bounds && Array.isArray(bounds) && bounds.length === 4) {
        const [west, south, east, north] = bounds;

        // Validate bounds are finite numbers
        if (!Number.isFinite(west) || !Number.isFinite(south) ||
            !Number.isFinite(east) || !Number.isFinite(north)) {
          console.warn('[LocationListener] Invalid bounds:', bounds);
          return;
        }

        // Clamp padding to reasonable range
        const safePadding = Math.max(0, Math.min(padding, 250));

        // Apply zoom offset after fitBounds if configured
        if (zoomOffset > 0) {
          (map as any).once?.('moveend', () => {
            const currentZoom = map.getZoom();
            const targetZoom = Math.min(currentZoom + zoomOffset, maxZoom);
            (map as any).easeTo?.({ zoom: targetZoom, duration: 300 });
          });
        }

        // Fit map to bounds
        try {
          map.fitBounds(
            [[west, south], [east, north]],
            {
              padding: safePadding,
              duration: 800,
              maxZoom: maxZoom
            }
          );
        } catch (fitError) {
          console.warn('[LocationListener] fitBounds failed, using flyTo fallback:', fitError);
          // Fallback: fly to center
          const centerLng = (west + east) / 2;
          const centerLat = (south + north) / 2;
          (map as any).flyTo?.({ center: [centerLng, centerLat], zoom: 14, duration: 800 });
        }
      }
    }
  }

  // Listen via bus (BroadcastChannel + postMessage)
  bus.onMessage(handleMessage);

  function destroy(): void {
    bus.destroy();
  }

  return { destroy };
}
