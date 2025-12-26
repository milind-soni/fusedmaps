/**
 * Hover tooltip component
 */

import type { LayerConfig, HexLayerConfig, VectorLayerConfig } from '../types';

interface QueryableLayer {
  layerId: string;
  layerDef: LayerConfig;
}

/**
 * Setup tooltip for the map
 */
export function setupTooltip(
  map: mapboxgl.Map,
  layers: LayerConfig[],
  visibilityState: Record<string, boolean>,
  deckOverlay?: unknown
): void {
  // Create tooltip element if it doesn't exist
  let tt = document.getElementById('tooltip');
  if (!tt) {
    tt = document.createElement('div');
    tt.id = 'tooltip';
    document.body.appendChild(tt);
  }
  
  // Build list of queryable layers
  const allQueryableLayers: QueryableLayer[] = [];
  
  layers.forEach(layer => {
    // Skip tile layers for Mapbox querying (handled by Deck.gl pick)
    if ((layer as any).isTileLayer) return;
    
    const layerIds: string[] = [];
    
    if (layer.layerType === 'hex') {
      const hexLayer = layer as HexLayerConfig;
      const cfg = hexLayer.hexLayer || {};
      if (cfg.extruded) {
        layerIds.push(`${layer.id}-extrusion`);
      } else {
        layerIds.push(`${layer.id}-fill`);
      }
      layerIds.push(`${layer.id}-outline`);
    } else if (layer.layerType === 'vector') {
      layerIds.push(
        `${layer.id}-fill`,
        `${layer.id}-outline`,
        `${layer.id}-circle`,
        `${layer.id}-line`
      );
    } else if (layer.layerType === 'mvt') {
      layerIds.push(
        `${layer.id}-fill`,
        `${layer.id}-line`,
        `${layer.id}-extrusion`
      );
    }
    
    layerIds.forEach(layerId => {
      allQueryableLayers.push({ layerId, layerDef: layer });
    });
  });
  
  // Mouse move handler
  map.on('mousemove', (e: any) => {
    const queryIds = allQueryableLayers
      .map(x => x.layerId)
      .filter(id => map.getLayer(id));
    
    const layerOrderIndex = (layerId: string) => {
      const idx = layers.findIndex(l => l.id === layerId);
      return idx === -1 ? Number.POSITIVE_INFINITY : idx;
    };

    let best: { type: 'mapbox' | 'deck'; layerDef: LayerConfig; props: Record<string, any> } | null = null;
    let bestIdx = Number.POSITIVE_INFINITY;

    // 1) Mapbox layers
    if (queryIds.length) {
      const features = map.queryRenderedFeatures(e.point, { layers: queryIds });
      for (const f of features || []) {
        const match = allQueryableLayers.find(x => x.layerId === (f as any).layer?.id);
        if (!match) continue;
        if (visibilityState[match.layerDef.id] === false) continue;
        const idx = layerOrderIndex(match.layerDef.id);
        if (idx < bestIdx) {
          bestIdx = idx;
          best = { type: 'mapbox', layerDef: match.layerDef, props: (f as any).properties || {} };
        }
        break; // queryRenderedFeatures returns in z-order; take first visible
      }
    }

    // 2) Deck tile layers
    if (deckOverlay) {
      const state = (deckOverlay as any).__fused_hex_tiles__;
      const picker = state?.pickObject || (deckOverlay as any)?.pickObject;
      try {
        const info = picker?.({ x: e.point.x, y: e.point.y, radius: 4 });
        if (info?.object) {
          // Tile layer id looks like "<layerId>-tiles-..."; normalize
          const rawLayerId = String(info.layer?.id || '');
          const baseId = rawLayerId.includes('-tiles') ? rawLayerId.split('-tiles')[0] : rawLayerId;
          const layerDef = layers.find(l => l.id === baseId);
          if (layerDef && visibilityState[layerDef.id] !== false) {
            const idx = layerOrderIndex(layerDef.id);
            if (idx < bestIdx) {
              bestIdx = idx;
              best = { type: 'deck', layerDef, props: info.object.properties || info.object || {} };
            }
          }
        }
      } catch (err) {
        // ignore
      }
    }

    if (!best) {
      tt!.style.display = 'none';
      map.getCanvas().style.cursor = '';
      return;
    }

    map.getCanvas().style.cursor = 'pointer';

    // Build tooltip content
    const tooltipCols = getTooltipColumns(best.layerDef);
    const lines = buildTooltipLines(best.props, tooltipCols);
    
    if (lines.length) {
      tt!.innerHTML = `<strong class="tt-title">${best.layerDef.name}</strong>` + lines.join('');
      tt!.style.left = `${e.point.x + 10}px`;
      tt!.style.top = `${e.point.y + 10}px`;
      tt!.style.display = 'block';
    } else {
      tt!.style.display = 'none';
    }
  });
  
  // Mouse leave handler
  map.on('mouseleave', () => {
    map.getCanvas().style.cursor = '';
    tt!.style.display = 'none';
  });
}

/**
 * Get tooltip columns for a layer
 */
function getTooltipColumns(layer: LayerConfig): string[] {
  if (layer.layerType === 'hex') {
    const hexLayer = layer as HexLayerConfig;
    return hexLayer.hexLayer?.tooltipColumns || hexLayer.hexLayer?.tooltipAttrs || hexLayer.tooltipColumns || [];
  } else if (layer.layerType === 'vector') {
    const vecLayer = layer as VectorLayerConfig;
    return vecLayer.vectorLayer?.tooltipColumns || vecLayer.vectorLayer?.tooltipAttrs || vecLayer.tooltipColumns || [];
  }
  return layer.tooltipColumns || [];
}

/**
 * Build tooltip HTML lines
 */
function buildTooltipLines(props: Record<string, unknown>, cols: string[]): string[] {
  if (cols.length) {
    return cols
      .map(k => {
        const val = props[k];
        if (val == null) return '';
        const formatted = typeof val === 'number' ? val.toFixed(2) : String(val);
        return `<span class="tt-row"><span class="tt-key">${k}</span><span class="tt-val">${formatted}</span></span>`;
      })
      .filter(Boolean);
  }
  
  // Default: show hex or first 5 properties
  if (props.hex) {
    return [`<span class="tt-row"><span class="tt-key">hex</span><span class="tt-val">${String(props.hex).slice(0, 12)}...</span></span>`];
  }
  
  return Object.keys(props)
    .slice(0, 5)
    .map(k => `<span class="tt-row"><span class="tt-key">${k}</span><span class="tt-val">${props[k]}</span></span>`);
}

