/**
 * PMTiles support for FusedMaps
 * 
 * Uses mapbox-pmtiles library with Mapbox GL JS v3's setSourceType()
 */

import type { PMTilesLayerConfig } from '../types';

let mapboxPmtilesLib: any = null;
let sourceTypeRegistered = false;

// In-flight loaders to avoid double-loading scripts/modules
let mapboxPmtilesLoadPromise: Promise<any> | null = null;

// Optional: minimal metadata fallback. Some PMTiles do not expose `vector_layers`
// via mapbox-pmtiles `getHeader().json`, so we read PMTiles metadata only when needed.
let pmtilesLib: any = null;
let pmtilesLoadPromise: Promise<any> | null = null;
const pmtilesLayerNamesCache = new Map<string, Promise<string[]>>();

function extractVectorLayerNamesFromHeader(header: any): string[] {
  const json = header?.json || {};
  const names: string[] = [];
  // mapbox-pmtiles docs show `header.json.vector_layers`
  if (Array.isArray(json.vector_layers)) {
    for (const vl of json.vector_layers) {
      if (vl?.id) names.push(String(vl.id));
    }
  }
  // Sometimes tilestats exist
  if (json?.tilestats?.layers && Array.isArray(json.tilestats.layers)) {
    for (const tl of json.tilestats.layers) {
      const n = tl?.layer;
      if (n && !names.includes(String(n))) names.push(String(n));
    }
  }
  return names;
}

async function ensurePmtilesMetadataLibLoaded(): Promise<any> {
  if (pmtilesLib) return pmtilesLib;
  if (pmtilesLoadPromise) return pmtilesLoadPromise;
  const dynamicImport = (u: string) => (new Function('u', 'return import(u)') as any)(u);
  pmtilesLoadPromise = dynamicImport('https://cdn.jsdelivr.net/npm/pmtiles@3.0.6/+esm')
    .then((m: any) => {
      pmtilesLib = m;
      return pmtilesLib;
    })
    .finally(() => {
      pmtilesLoadPromise = null;
    });
  return pmtilesLoadPromise;
}

async function getVectorLayerNamesFallback(url: string): Promise<string[]> {
  if (pmtilesLayerNamesCache.has(url)) return pmtilesLayerNamesCache.get(url)!;
  const p = (async () => {
    const pmtiles = await ensurePmtilesMetadataLibLoaded();
    const inst = new pmtiles.PMTiles(url);
    let metadata: any = {};
    try {
      metadata = await inst.getMetadata();
    } catch (_) {
      metadata = {};
    }
    const names: string[] = [];
    if (metadata?.vector_layers?.length > 0) {
      for (const vl of metadata.vector_layers) {
        if (vl?.id) names.push(String(vl.id));
      }
    }
    if (metadata?.tilestats?.layers && Array.isArray(metadata.tilestats.layers)) {
      for (const tl of metadata.tilestats.layers) {
        const n = tl?.layer;
        if (n && !names.includes(String(n))) names.push(String(n));
      }
    }
    return names;
  })();
  pmtilesLayerNamesCache.set(url, p);
  p.catch(() => pmtilesLayerNamesCache.delete(url));
  return p;
}

/**
 * Lazy load the mapbox-pmtiles library for Mapbox GL JS v3
 */
async function ensureMapboxPMTilesLoaded(): Promise<any> {
  if (mapboxPmtilesLib) return mapboxPmtilesLib;
  if (mapboxPmtilesLoadPromise) return mapboxPmtilesLoadPromise;
  
  // Check if already loaded globally
  if ((window as any).mapboxPmTiles) {
    mapboxPmtilesLib = (window as any).mapboxPmTiles;
    return mapboxPmtilesLib;
  }
  
  // Load via script tag (UMD build)
  mapboxPmtilesLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mapbox-pmtiles@1.0.54/dist/mapbox-pmtiles.umd.min.js';
    script.onload = () => {
      mapboxPmtilesLib = (window as any).mapboxPmTiles;
      resolve(mapboxPmtilesLib);
    };
    script.onerror = () => reject(new Error('Failed to load mapbox-pmtiles library'));
    document.head.appendChild(script);
  }).finally(() => {
    mapboxPmtilesLoadPromise = null;
  });
  return mapboxPmtilesLoadPromise;
}

/**
 * Register PMTiles source type with Mapbox GL JS v3
 */
async function registerPMTilesSourceType(): Promise<void> {
  if (sourceTypeRegistered) return;
  
  const mapboxgl = (window as any).mapboxgl;
  if (!mapboxgl?.Style?.setSourceType) {
    throw new Error('Mapbox GL JS v3 with Style.setSourceType is required for PMTiles');
  }
  
  const mapboxPmTiles = await ensureMapboxPMTilesLoaded();
  mapboxgl.Style.setSourceType(mapboxPmTiles.SOURCE_TYPE, mapboxPmTiles.PmTilesSource);
  sourceTypeRegistered = true;
}

/**
 * Resolve a palette name (e.g., "Sunset", "Viridis") to an array of hex colors
 */
function resolvePalette(paletteName: string, steps: number = 7): string[] {
  const cartocolor = (window as any).cartocolor;
  
  // Default fallback colors
  const fallback = ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'];
  
  if (!cartocolor) return fallback;
  
  // Try to find the palette in cartocolor
  const palette = cartocolor[paletteName];
  if (palette) {
    // cartocolor palettes have different step counts (3-11 typically)
    const availableSteps = Object.keys(palette).map(Number).filter(n => !isNaN(n)).sort((a, b) => b - a);
    const bestMatch = availableSteps.find(s => s <= steps) || availableSteps[availableSteps.length - 1];
    return palette[bestMatch] || fallback;
  }
  
  return fallback;
}

/**
 * Build a Mapbox GL color expression from a color config
 */
export function buildPMTilesColorExpression(
  colorConfig: any,
  attribute: string,
  defaultColor: string = '#ff8c00'
): any {
  if (!colorConfig) return defaultColor;
  if (typeof colorConfig === 'string') return colorConfig;
  if (Array.isArray(colorConfig)) return colorConfig;
  
  const fn = colorConfig['@@function'];
  const attr = colorConfig.attr || attribute;
  
  if (fn === 'colorContinuous') {
    const domain = colorConfig.domain || [0, 100];
    const steps = colorConfig.steps || 7;
    const reverse = !!colorConfig.reverse;
    
    // Resolve palette name to colors array
    let colors = colorConfig.colors;
    if (typeof colors === 'string') {
      colors = resolvePalette(colors, steps);
    }
    if (!colors || !Array.isArray(colors)) {
      colors = ['#440154', '#21918c', '#fde725'];
    }
    if (reverse && colors.length > 1) {
      colors = [...colors].reverse();
    }
    
    // Build interpolate expression with all color stops
    const expr: any[] = ['interpolate', ['linear'], ['coalesce', ['to-number', ['get', attr]], 0]];
    
    const numColors = colors.length;
    for (let i = 0; i < numColors; i++) {
      const t = i / (numColors - 1);
      const value = domain[0] + t * (domain[1] - domain[0]);
      expr.push(value, colors[i]);
    }
    
    return expr;
  }
  
  if (fn === 'colorCategories') {
    const categories = colorConfig.categories || {};
    const fallback = colorConfig.othersColor || '#888888';
    
    const expr: any[] = ['match', ['get', attr]];
    for (const [cat, color] of Object.entries(categories)) {
      expr.push(cat, color);
    }
    expr.push(fallback);
    
    return expr;
  }
  
  return defaultColor;
}

/**
 * Add PMTiles layers to the map
 */
export async function addPMTilesLayers(
  map: mapboxgl.Map,
  layers: PMTilesLayerConfig[],
  visibilityState: Record<string, boolean>,
  hasCustomView: boolean = false
): Promise<void> {
  if (layers.length === 0) return;
  
  // Register PMTiles source type
  await registerPMTilesSourceType();
  const mapboxPmTiles = await ensureMapboxPMTilesLoaded();
  
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    if (!layer.pmtilesUrl) continue;
    
    const visible = visibilityState[layer.id] !== false;
    const sourceId = `${layer.id}-source`;
    
    try {
      // Use mapbox-pmtiles native getHeader() method - this is what the library docs recommend
      // This ensures we get the header the same way the library expects
      const header = await mapboxPmTiles.PmTilesSource.getHeader(layer.pmtilesUrl);
      const bounds: [number, number, number, number] = [
        header.minLon,
        header.minLat,
        header.maxLon,
        header.maxLat,
      ];
      let allLayerNames = extractVectorLayerNamesFromHeader(header);
      const defaultLayerName = allLayerNames[0] || 'default';

      const requestedSourceLayer =
        typeof (layer as any).sourceLayer === 'string' ? ((layer as any).sourceLayer as string).trim() : '';

      // Minimal fallback: if we couldn't detect source-layers from header.json
      // and the user didn't specify one, try reading PMTiles metadata once.
      if (!requestedSourceLayer && allLayerNames.length === 0) {
        try {
          allLayerNames = await getVectorLayerNamesFallback(layer.pmtilesUrl);
        } catch (_) {}
      }
      const defaultLayerName2 = allLayerNames[0] || defaultLayerName;

      // New behavior:
      // - sourceLayer="*" => render ALL source-layers found in metadata
      // - sourceLayer unset/empty AND metadata has multiple layers => render ALL layers (acts like OL's "dynamic")
      // - otherwise render the single requested/detected layer
      // Optional exclusion list (useful when PMTiles contains helper layers like vertex/corner points)
      const exclude = new Set<string>([
        ...(((layer as any).excludeSourceLayers as string[]) || []),
        ...(((layer as any).exclude_source_layers as string[]) || []),
        ...(((layer.vectorLayer as any)?.excludeSourceLayers as string[]) || []),
        ...(((layer.vectorLayer as any)?.exclude_source_layers as string[]) || []),
      ].filter(Boolean));

      const filterExcluded = (names: string[]) => names.filter((n) => !exclude.has(n));
      const autoAll = !requestedSourceLayer && allLayerNames.length > 1;
      const autoAllFiltered = autoAll ? filterExcluded(allLayerNames) : allLayerNames;

      const sourceLayerNamesToRender: string[] =
        requestedSourceLayer === '*'
          ? filterExcluded(allLayerNames)
          : requestedSourceLayer
            ? [requestedSourceLayer]
            : (allLayerNames.length > 1 ? autoAllFiltered : [defaultLayerName2]);

      if (sourceLayerNamesToRender.length === 0) {
        console.warn('[FusedMaps] PMTiles: could not detect any source-layers; set `source_layer` explicitly for:', layer.id);
      }
      if (requestedSourceLayer && requestedSourceLayer !== '*' && allLayerNames.length > 0 && !allLayerNames.includes(requestedSourceLayer)) {
        console.warn('[FusedMaps] PMTiles: requested source-layer not found in header.json:', {
          requested: requestedSourceLayer,
          available: allLayerNames,
        });
      }
      
      // Add source if not exists
      // IMPORTANT: Use header values from mapbox-pmtiles native getHeader() for correct tile fetching
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: mapboxPmTiles.SOURCE_TYPE,
          url: layer.pmtilesUrl,
          minzoom: header.minZoom,
          maxzoom: header.maxZoom,
          bounds: bounds,
        } as any);
      }
      
      // Get styling config
      const vectorStyle = layer.vectorLayer || {};
      const opacity = layer.fillOpacity ?? vectorStyle.opacity ?? 0.8;
      const baseLineWidth = layer.lineWidth ?? 1;
      const pointRadius = layer.pointRadiusMinPixels ?? 4;
      
      // Check filled/stroked booleans
      const isFilled = (layer as any).isFilled !== false;
      const isStroked = (layer as any).isStroked !== false;
      const effectiveLineWidth = isStroked ? baseLineWidth : 0;
      const effectiveFillOpacity = isFilled ? opacity : 0;

      // Render toggles (default true). Helpful when PMTiles contains "helper" point layers.
      const renderPoints = (layer as any).renderPoints !== false && (layer.vectorLayer as any)?.renderPoints !== false;
      const renderLines = (layer as any).renderLines !== false && (layer.vectorLayer as any)?.renderLines !== false;
      const renderPolygons = (layer as any).renderPolygons !== false && (layer.vectorLayer as any)?.renderPolygons !== false;
      
      // Determine colors
      const fillColorExpr = buildPMTilesColorExpression(
        layer.fillColorConfig || vectorStyle.getFillColor,
        layer.colorAttribute || 'value',
        '#ff8c00'
      );
      
      const lineColorExpr = buildPMTilesColorExpression(
        layer.lineColorConfig || vectorStyle.getLineColor,
        layer.colorAttribute || 'value',
        '#ffffff'
      );
      
      const slugify = (s: string) => s.replace(/[^a-zA-Z0-9_-]+/g, '-');

      // NEW: render one set of Mapbox layers per source-layer name
      for (const sl of sourceLayerNamesToRender) {
        const slSlug = slugify(sl || 'default');
        const layerZoomProps: any = {};
        if (typeof layer.minzoom === 'number') layerZoomProps.minzoom = layer.minzoom;
        if (typeof layer.maxzoom === 'number') layerZoomProps.maxzoom = layer.maxzoom;

        if (renderPoints) {
          // Circle layer
          const circleLayerId = `${layer.id}-${slSlug}-circles`;
          if (!map.getLayer(circleLayerId)) {
            map.addLayer({
              id: circleLayerId,
              type: 'circle',
              source: sourceId,
              'source-layer': sl,
              ...layerZoomProps,
              paint: {
                'circle-radius': [
                  'interpolate', ['exponential', 2], ['zoom'],
                  0, pointRadius * 0.5,
                  10, pointRadius,
                  15, pointRadius * 4,
                  20, pointRadius * 20,
                ],
                'circle-color': fillColorExpr,
                'circle-opacity': effectiveFillOpacity,
                'circle-stroke-color': lineColorExpr,
                'circle-stroke-width': effectiveLineWidth,
              },
              layout: { visibility: visible ? 'visible' : 'none' },
            });
          }
        }

        if (renderPolygons) {
          // Fill layer
          const fillLayerId = `${layer.id}-${slSlug}-fill`;
          if (!map.getLayer(fillLayerId)) {
            map.addLayer({
              id: fillLayerId,
              type: 'fill',
              source: sourceId,
              'source-layer': sl,
              ...layerZoomProps,
              paint: {
                'fill-color': fillColorExpr,
                'fill-opacity': effectiveFillOpacity,
              },
              layout: { visibility: visible ? 'visible' : 'none' },
            });
          }
        }

        if (renderLines) {
          // Line layer
          const lineLayerId = `${layer.id}-${slSlug}-line`;
          if (!map.getLayer(lineLayerId)) {
            map.addLayer({
              id: lineLayerId,
              type: 'line',
              source: sourceId,
              'source-layer': sl,
              ...layerZoomProps,
              paint: {
                'line-color': lineColorExpr,
                'line-width': effectiveLineWidth,
                'line-opacity': opacity,
              },
              layout: { visibility: visible ? 'visible' : 'none' },
            });
          }
        }
      }
      
      // Fit to bounds if available and this is the first layer, and user didn't provide a custom view
      // IMPORTANT: use the header bounds directly (SW/NE pairs) so the map starts on the dataset.
      if (!hasCustomView && bounds && i === 0) {
        map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], {
          padding: 50,
          duration: 0,
        });
      }
      
    } catch (e) {
      console.error(`[FusedMaps] Failed to add PMTiles layer ${layer.id}:`, e);
    }
  }
}

/**
 * Update visibility of PMTiles layers
 */
export function updatePMTilesVisibility(
  map: mapboxgl.Map,
  layerId: string,
  visible: boolean
): void {
  const prefix = `${layerId}-`;
  // We now create multiple Mapbox layers per PMTiles source-layer (e.g. `${layerId}-input10-fill`)
  // So visibility toggling is prefix-based.
  const styleLayers = (map.getStyle()?.layers || []) as any[];
  for (const l of styleLayers) {
    const id = l?.id as string | undefined;
    if (id && id.startsWith(prefix)) {
      try {
        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      } catch (_) {}
    }
  }
}

/**
 * Remove PMTiles layers from the map
 */
export function removePMTilesLayers(map: mapboxgl.Map, layerId: string): void {
  const prefix = `${layerId}-`;
  const styleLayers = (map.getStyle()?.layers || []) as any[];
  // Remove from end to avoid style index shifting issues
  for (let i = styleLayers.length - 1; i >= 0; i--) {
    const id = styleLayers[i]?.id as string | undefined;
    if (id && id.startsWith(prefix)) {
      try {
        if (map.getLayer(id)) map.removeLayer(id);
      } catch (_) {}
    }
  }
  
  const sourceId = `${layerId}-source`;
  if (map.getSource(sourceId)) {
    map.removeSource(sourceId);
  }
}

/**
 * Check if PMTiles layers exist for a given layer ID
 */
export function hasPMTilesLayers(map: mapboxgl.Map, layerId: string): boolean {
  const prefix = `${layerId}-`;
  const styleLayers = (map.getStyle()?.layers || []) as any[];
  return styleLayers.some(l => {
    const id = l?.id as string | undefined;
    return !!(id && id.startsWith(prefix));
  });
}
