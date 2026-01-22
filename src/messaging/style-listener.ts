/**
 * Style Listener - receives style parameters from JSON UI components
 * and applies them to layers without re-running the UDF.
 *
 * This enables dropdown/slider components to change layer styles (palette, opacity, etc.)
 * client-side without triggering UDF re-execution.
 *
 * @example Configuration:
 * {
 *   messaging: {
 *     styleListener: {
 *       enabled: true,
 *       channel: "fused-params",  // BroadcastChannel name
 *       layerId: "layer-0",       // Target layer ID (or "all" for all layers)
 *       mappings: {
 *         "palette": "style.fillColor.palette",  // param name -> layer property path
 *         "opacity": "style.opacity"
 *       }
 *     }
 *   }
 * }
 */

import { createBus, type BusMessage } from './bus';

export interface StyleListenerConfig {
  channel?: string;
  layerId?: string;  // Target layer ID, or "all" to apply to all layers
  mappings?: Record<string, string>;  // { paramName: "dotPath.to.property" }
}

interface StyleListenerState {
  destroy: () => void;
}

/**
 * Set a nested property on an object using dot notation path
 */
function setNestedProperty(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (current[key] === undefined || current[key] === null) {
      current[key] = {};
    }
    current = current[key];
  }

  const lastKey = parts[parts.length - 1];
  current[lastKey] = value;
}

/**
 * Deep clone an object (simple version for style objects)
 */
function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepClone) as any;
  const clone: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clone[key] = deepClone((obj as any)[key]);
    }
  }
  return clone;
}

/**
 * Enable style listener on a map instance
 */
export function enableStyleListener(
  instance: any,  // FusedMapsInstance
  layers: any[],
  config: StyleListenerConfig
): StyleListenerState {
  // Default to "parameter-updates" which is the channel used by JSON UI components
  const channel = config.channel || 'parameter-updates';
  const targetLayerId = config.layerId || 'all';
  const mappings = config.mappings || {};

  // If no mappings, provide sensible defaults for common style properties
  const effectiveMappings = Object.keys(mappings).length > 0 ? mappings : {
    'palette': 'style.fillColor.palette',
    'opacity': 'style.opacity',
    'fillColor': 'style.fillColor',
    'lineColor': 'style.lineColor',
    'lineWidth': 'style.lineWidth',
    'filled': 'style.filled',
    'stroked': 'style.stroked',
  };

  const bus = createBus(channel);

  console.log(`[FusedMaps] Style listener enabled on channel "${channel}" with mappings:`, effectiveMappings);

  bus.onMessage((msg: BusMessage) => {
    console.log('[FusedMaps] Style listener received message:', msg);

    // Check for parameter update messages
    // Format from JSON UI: { type: "param", parameter: "palette", values: "OrYel" }
    // Note: type is lowercase "param" not "PARAM"
    if (msg.type !== 'param' && msg.type !== 'PARAM' && msg.type !== 'style_update') {
      console.log('[FusedMaps] Style listener: ignoring message with type:', msg.type);
      return;
    }

    const paramName = (msg as any).parameter || (msg as any).param;
    const value = (msg as any).values ?? (msg as any).value;

    if (!paramName || value === undefined) {
      console.log('[FusedMaps] Style listener: missing paramName or value');
      return;
    }

    // Check if we have a mapping for this parameter
    const propertyPath = effectiveMappings[paramName];
    if (!propertyPath) {
      // Not a mapped style parameter, ignore
      console.log(`[FusedMaps] Style listener: no mapping for param "${paramName}"`);
      return;
    }

    console.log(`[FusedMaps] Style listener: applying ${paramName} -> ${propertyPath} = ${JSON.stringify(value)}`);

    try {
      // Get target layers
      const layersToUpdate = targetLayerId === 'all'
        ? instance.getLayers()
        : [instance.getLayer(targetLayerId)].filter(Boolean);

      for (const layerState of layersToUpdate) {
        if (!layerState?.config) continue;

        const layerId = layerState.config.id;
        const currentConfig = layerState.config;

        // Build the changes object by setting the nested property
        const changes: any = {};

        // Handle special case where the property path starts with "style."
        // We need to merge with existing style to avoid losing other properties
        if (propertyPath.startsWith('style.')) {
          const stylePath = propertyPath.slice(6); // Remove "style." prefix
          const currentStyle = deepClone(currentConfig.style || {});
          setNestedProperty(currentStyle, stylePath, value);
          changes.style = currentStyle;
        } else {
          setNestedProperty(changes, propertyPath, value);
        }

        // Apply the update
        instance.updateLayer(layerId, changes);
      }

      // Update legend after style changes
      try {
        instance.updateLegend();
      } catch (e) {
        // Legend update is optional
      }

    } catch (e) {
      console.warn('[FusedMaps] Style listener error:', e);
    }
  });

  return {
    destroy: () => {
      bus.destroy();
    }
  };
}
