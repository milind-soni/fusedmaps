/**
 * PMTiles support for FusedMaps
 * 
 * Uses mapbox-pmtiles library with Mapbox GL JS v3's setSourceType()
 */

import type { PMTilesLayerConfig } from '../types';

// Library instances
let pmtilesLib: any = null;
let mapboxPmtilesLib: any = null;
let sourceTypeRegistered = false;

// Cache PMTiles instances by URL
const pmtilesCache = new Map<string, any>();
// Cache metadata reads by URL (avoid repeated HTTP range requests)
const pmtilesMetadataCache = new Map<string, Promise<{
  header: any;
  metadata: any;
  layerName: string;
  bounds?: [number, number, number, number];
  center?: [number, number];
  minZoom?: number;
  maxZoom?: number;
}>>();

// In-flight loaders to avoid double-loading scripts/modules
let pmtilesLoadPromise: Promise<any> | null = null;
let mapboxPmtilesLoadPromise: Promise<any> | null = null;

/**
 * Lazy load the PMTiles library (for metadata reading)
 */
async function ensurePMTilesLoaded(): Promise<any> {
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
 * Get or create a PMTiles instance for metadata reading
 */
async function getPMTilesInstance(url: string): Promise<any> {
  if (pmtilesCache.has(url)) {
    return pmtilesCache.get(url);
  }
  
  const pmtiles = await ensurePMTilesLoaded();
  const instance = new pmtiles.PMTiles(url);
  pmtilesCache.set(url, instance);
  return instance;
}

/**
 * Get metadata from a PMTiles file
 */
export async function getPMTilesMetadata(url: string): Promise<{
  header: any;
  metadata: any;
  layerName: string;
  bounds?: [number, number, number, number];
  center?: [number, number];
  minZoom?: number;
  maxZoom?: number;
}> {
  if (pmtilesMetadataCache.has(url)) return pmtilesMetadataCache.get(url)!;

  const p = (async () => {
    const instance = await getPMTilesInstance(url);
    const header = await instance.getHeader();

    let metadata: any = {};
    try {
      metadata = await instance.getMetadata();
    } catch (e) {
      // Metadata is optional
    }

    // Extract layer name from metadata
    let layerName = 'default';
    if (metadata?.vector_layers?.length > 0) {
      layerName = metadata.vector_layers[0].id;
    } else if (metadata?.tilestats?.layers?.length > 0) {
      layerName = metadata.tilestats.layers[0].layer;
    }

    // Extract bounds
    let bounds: [number, number, number, number] | undefined;
    if (header.minLon != null && header.minLat != null && header.maxLon != null && header.maxLat != null) {
      bounds = [header.minLon, header.minLat, header.maxLon, header.maxLat];
    }

    // Extract center
    let center: [number, number] | undefined;
    if (header.centerLon != null && header.centerLat != null) {
      center = [header.centerLon, header.centerLat];
    }

    return {
      header,
      metadata,
      layerName,
      bounds,
      center,
      minZoom: header.minZoom,
      maxZoom: header.maxZoom,
    };
  })();

  pmtilesMetadataCache.set(url, p);
  // If it fails, allow retries next time
  p.catch(() => pmtilesMetadataCache.delete(url));
  return p;
}

/**
 * Resolve a palette name (e.g., "Sunset", "Viridis") to an array of hex colors
 */
function resolvePalette(paletteName: string, steps: number = 7): string[] {
  const cartocolor = (window as any).cartocolor;
  
  // Default fallback colors
  const fallback = ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'];
  
  if (!cartocolor) {
    console.warn('[FusedMaps] cartocolor not loaded, using default colors');
    return fallback;
  }
  
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
function buildColorExpression(
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
    
    // Resolve palette name to colors array
    let colors = colorConfig.colors;
    if (typeof colors === 'string') {
      colors = resolvePalette(colors, steps);
    }
    if (!colors || !Array.isArray(colors)) {
      colors = ['#440154', '#21918c', '#fde725'];
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
      // Get metadata to find layer name and bounds
      const meta = await getPMTilesMetadata(layer.pmtilesUrl);
      const sourceLayerName = layer.sourceLayer || meta.layerName;
      if (!layer.sourceLayer && meta.layerName === 'default') {
        console.warn('[FusedMaps] PMTiles: could not detect sourceLayer from metadata; set `sourceLayer` explicitly for:', layer.id);
      }
      
      // Add source if not exists
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: mapboxPmTiles.SOURCE_TYPE,
          url: layer.pmtilesUrl,
          minzoom: layer.minzoom ?? meta.minZoom ?? 0,
          maxzoom: layer.maxzoom ?? meta.maxZoom ?? 14,
          bounds: meta.bounds,
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
      
      // Determine colors
      const fillColorExpr = buildColorExpression(
        layer.fillColorConfig || vectorStyle.getFillColor,
        layer.colorAttribute || 'value',
        '#ff8c00'
      );
      
      const lineColorExpr = buildColorExpression(
        layer.lineColorConfig || vectorStyle.getLineColor,
        layer.colorAttribute || 'value',
        '#ffffff'
      );
      
      // Circle layer for points
      const circleLayerId = `${layer.id}-circles`;
      if (!map.getLayer(circleLayerId)) {
        map.addLayer({
          id: circleLayerId,
          type: 'circle',
          source: sourceId,
          'source-layer': sourceLayerName,
          filter: ['==', ['geometry-type'], 'Point'],
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
      
      // Fill layer for polygons
      const fillLayerId = `${layer.id}-fill`;
      if (!map.getLayer(fillLayerId)) {
        map.addLayer({
          id: fillLayerId,
          type: 'fill',
          source: sourceId,
          'source-layer': sourceLayerName,
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: {
            'fill-color': fillColorExpr,
            'fill-opacity': effectiveFillOpacity,
          },
          layout: { visibility: visible ? 'visible' : 'none' },
        });
      }
      
      // Line layer for polygons (outlines) and lines
      const lineLayerId = `${layer.id}-line`;
      if (!map.getLayer(lineLayerId)) {
        map.addLayer({
          id: lineLayerId,
          type: 'line',
          source: sourceId,
          'source-layer': sourceLayerName,
          filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'LineString']],
          paint: {
            'line-color': lineColorExpr,
            'line-width': effectiveLineWidth,
            'line-opacity': opacity,
          },
          layout: { visibility: visible ? 'visible' : 'none' },
        });
      }
      
      // Fit to bounds if available and this is the first layer, and user didn't provide a custom view
      if (!hasCustomView && meta.bounds && i === 0) {
        map.fitBounds(meta.bounds as [number, number, number, number], {
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
  const layerIds = [`${layerId}-circles`, `${layerId}-fill`, `${layerId}-line`];
  
  for (const id of layerIds) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
  }
}

/**
 * Remove PMTiles layers from the map
 */
export function removePMTilesLayers(map: mapboxgl.Map, layerId: string): void {
  const layerIds = [`${layerId}-circles`, `${layerId}-fill`, `${layerId}-line`];
  
  for (const id of layerIds) {
    if (map.getLayer(id)) {
      map.removeLayer(id);
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
  return !!(
    map.getLayer(`${layerId}-circles`) ||
    map.getLayer(`${layerId}-fill`) ||
    map.getLayer(`${layerId}-line`)
  );
}
