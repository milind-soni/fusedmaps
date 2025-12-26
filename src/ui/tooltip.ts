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
  visibilityState: Record<string, boolean>
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
    // Skip tile layers (they're handled by Deck.gl)
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
    
    if (!queryIds.length) return;
    
    const features = map.queryRenderedFeatures(e.point, { layers: queryIds });
    
    if (!features?.length) {
      tt!.style.display = 'none';
      map.getCanvas().style.cursor = '';
      return;
    }
    
    // Find the top visible feature
    let topFeature: any = null;
    let topLayerDef: LayerConfig | null = null;
    
    for (const f of features) {
      const match = allQueryableLayers.find(x => x.layerId === (f as any).layer?.id);
      if (match && visibilityState[match.layerDef.id] !== false) {
        topFeature = f;
        topLayerDef = match.layerDef;
        break;
      }
    }
    
    if (!topFeature || !topLayerDef) {
      tt!.style.display = 'none';
      map.getCanvas().style.cursor = '';
      return;
    }
    
    map.getCanvas().style.cursor = 'pointer';
    
    // Build tooltip content
    const props = topFeature.properties || {};
    const tooltipCols = getTooltipColumns(topLayerDef);
    
    const lines = buildTooltipLines(props, tooltipCols);
    
    if (lines.length) {
      tt!.innerHTML = `<strong class="tt-title">${topLayerDef.name}</strong>` + lines.join('');
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

