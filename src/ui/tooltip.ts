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
  // Store reference to check if overlay is available
  const overlayRef = { current: deckOverlay };
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
    } else if (layer.layerType === 'pmtiles') {
      // PMTiles layers are generated dynamically (multiple Mapbox layers per source-layer),
      // so we discover their ids at hover time via the `${layer.id}-` prefix.
    }
    
    layerIds.forEach(layerId => {
      allQueryableLayers.push({ layerId, layerDef: layer });
    });
  });
  
  // Mouse move handler
  map.on('mousemove', (e: any) => {
    // Build query layer IDs dynamically so PMTiles layers (which may be added async) are included.
    const queryable: QueryableLayer[] = [...allQueryableLayers];
    try {
      const styleLayers: any[] = (map.getStyle?.()?.layers || []) as any[];
      for (const ldef of layers) {
        if (ldef.layerType !== 'pmtiles') continue;
        const prefix = `${ldef.id}-`;
        for (const sl of styleLayers) {
          const id = sl?.id;
          if (typeof id === 'string' && id.startsWith(prefix)) {
            queryable.push({ layerId: id, layerDef: ldef });
          }
        }
      }
    } catch (_) {}

    const queryIds = queryable.map(x => x.layerId).filter(id => map.getLayer(id));
    
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
        const match = queryable.find(x => x.layerId === (f as any).layer?.id);
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

    // 2) Deck tile layers - use pickObject directly (like legacy map_utils)
    const overlay = overlayRef.current;
    // Check for tile layers that need Deck picking
    const hasTileLayers = layers.some(l => (l as any).isTileLayer);
    if (overlay) {
      let info: any = null;
      const state = (overlay as any).__fused_hex_tiles__;

      // Try 1: Use getHoverInfo (populated by onHover callback)
      if (state?.getHoverInfo) {
        info = state.getHoverInfo();
        if (info?.object && Math.random() < 0.05) {
          console.log('[tooltip] getHoverInfo result:', info);
        }
      }

      // Try 2: Use pickObject if no hover info
      if (!info?.object) {
        try {
          if (typeof (overlay as any).pickObject === 'function') {
            info = (overlay as any).pickObject({ x: e.point.x, y: e.point.y, radius: 4 });
            // Debug: log pick results occasionally
            if (info?.object && Math.random() < 0.05) {
              console.log('[tooltip] pickObject result:', info);
            }
          } else {
            // Debug: log if pickObject isn't available (only once)
            if (hasTileLayers && !(overlay as any).__pickObjectWarned) {
              console.warn('[tooltip] pickObject not available on overlay, type:', typeof overlay);
              (overlay as any).__pickObjectWarned = true;
            }
          }
        } catch (err) {
          console.warn('[tooltip] pickObject error:', err);
        }
      }

      if (info?.object) {
        // Tile layer id looks like "<layerId>-tiles-..."; normalize
        const rawLayerId = String(info.layer?.id || '');
        // Handle sublayer ids: "slope-tiles-abc123-h3" -> "slope"
        const baseId = rawLayerId.includes('-tiles')
          ? rawLayerId.split('-tiles')[0]
          : rawLayerId.split('-')[0]; // Fallback for other patterns
        const layerDef = layers.find(l => l.id === baseId) || layers.find(l => rawLayerId.startsWith(l.id));
        if (layerDef && visibilityState[layerDef.id] !== false) {
          const idx = layerOrderIndex(layerDef.id);
          if (idx < bestIdx) {
            bestIdx = idx;
            best = { type: 'deck', layerDef, props: info.object.properties || info.object || {} };
          }
        }
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
    const lines = buildTooltipLines(best.props, tooltipCols, best.layerDef);
    
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
  const anyLayer = layer as any;

  if (layer.layerType === 'hex') {
    const hexLayer = layer as HexLayerConfig;
    return hexLayer.hexLayer?.tooltipColumns || hexLayer.hexLayer?.tooltipAttrs ||
           hexLayer.tooltipColumns || anyLayer.tooltip || [];
  } else if (layer.layerType === 'vector') {
    const vecLayer = layer as VectorLayerConfig;
    return vecLayer.vectorLayer?.tooltipColumns || vecLayer.vectorLayer?.tooltipAttrs ||
           vecLayer.tooltipColumns || anyLayer.tooltip || [];
  } else if (layer.layerType === 'pmtiles') {
    return anyLayer.vectorLayer?.tooltipColumns || anyLayer.vectorLayer?.tooltipAttrs ||
           anyLayer.tooltipColumns || anyLayer.tooltip || [];
  }
  return anyLayer.tooltipColumns || anyLayer.tooltip || [];
}

/**
 * Build tooltip HTML lines
 */
function buildTooltipLines(props: Record<string, unknown>, cols: string[], layerDef?: LayerConfig): string[] {
  const lines: string[] = [];

  // Match map_utils.py behavior: show hex first if present (even when cols are provided)
  if ((props as any).hex != null) {
    lines.push(
      `<span class="tt-row"><span class="tt-key">hex</span><span class="tt-val">${String((props as any).hex).slice(0, 12)}...</span></span>`
    );
  }

  // If columns specified, render them (skipping hex)
  if (cols.length) {
    cols.forEach((k) => {
      if (k === 'hex') return;
      const val = (props as any)[k];
      if (val == null) return;
      const formatted = typeof val === 'number' ? Number(val).toFixed(2) : String(val);
      lines.push(`<span class="tt-row"><span class="tt-key">${k}</span><span class="tt-val">${formatted}</span></span>`);
    });
    return lines;
  }

  // For hex tile layers with no cols specified, show the color attribute (like legacy)
  if (layerDef?.layerType === 'hex') {
    const hexLayer = layerDef as HexLayerConfig;
    const colorAttr = (hexLayer.hexLayer as any)?.getFillColor?.attr || 'metric';
    if ((props as any)[colorAttr] != null) {
      const val = (props as any)[colorAttr];
      const formatted = typeof val === 'number' ? Number(val).toFixed(2) : String(val);
      lines.push(`<span class="tt-row"><span class="tt-key">${colorAttr}</span><span class="tt-val">${formatted}</span></span>`);
      return lines;
    }
  }

  // Default fallback: if we didn't add anything yet, show first 5 properties
  if (lines.length === 0) {
    Object.keys(props)
      .filter(k => k !== 'hex' && k !== 'properties')
      .slice(0, 5)
      .forEach((k) => {
        const val = (props as any)[k];
        if (val == null) return;
        const formatted = typeof val === 'number' ? Number(val).toFixed(2) : String(val);
        lines.push(`<span class="tt-row"><span class="tt-key">${k}</span><span class="tt-val">${formatted}</span></span>`);
      });
  }

  return lines;
}

