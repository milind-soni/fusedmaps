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
  allLayerNames: string[];
  bounds?: [number, number, number, number];
  center?: [number, number];
  minZoom?: number;
  maxZoom?: number;
}>>();

// In-flight loaders to avoid double-loading scripts/modules
let pmtilesLoadPromise: Promise<any> | null = null;
let mapboxPmtilesLoadPromise: Promise<any> | null = null;

// One-time debug probes per sourceId to avoid log spam / extra range requests
const pmtilesTileProbeDone = new Set<string>();

function lonLatToTileXY(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = Math.pow(2, z);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latClamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const latRad = (latClamped * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
}

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
  allLayerNames: string[];
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

    // Extract all layer names from metadata
    const allLayerNames: string[] = [];
    if (metadata?.vector_layers?.length > 0) {
      for (const vl of metadata.vector_layers) {
        if (vl.id) allLayerNames.push(vl.id);
      }
    }
    if (metadata?.tilestats?.layers?.length > 0) {
      for (const tl of metadata.tilestats.layers) {
        if (tl.layer && !allLayerNames.includes(tl.layer)) allLayerNames.push(tl.layer);
      }
    }
    
    // Use first layer as default
    const layerName = allLayerNames[0] || 'default';

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
      allLayerNames,
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
      // Use mapbox-pmtiles native getHeader() method - this is what the library docs recommend
      // This ensures we get the header the same way the library expects
      const header = await mapboxPmTiles.PmTilesSource.getHeader(layer.pmtilesUrl);
      const bounds: [number, number, number, number] = [
        header.minLon,
        header.minLat,
        header.maxLon,
        header.maxLat,
      ];
      
      // Also get our metadata for layer name detection
      const meta = await getPMTilesMetadata(layer.pmtilesUrl);
      
      // Log ALL available source layers for debugging
      console.log(`[FusedMaps] PMTiles available source-layers for ${layer.id}:`, 
        meta.allLayerNames.length > 0 ? meta.allLayerNames : ['(none detected - check metadata)']);
      
      const sourceLayerName = layer.sourceLayer || meta.layerName;
      if (!layer.sourceLayer && (meta.layerName === 'default' || meta.allLayerNames.length > 1)) {
        console.warn('[FusedMaps] PMTiles: you may need to set `source_layer` explicitly for:', layer.id, 
          meta.allLayerNames.length > 0 ? `Available: ${meta.allLayerNames.join(', ')}` : '');
      }
      console.log(`[FusedMaps] PMTiles using source-layer: "${sourceLayerName}" for ${layer.id}`);
      
      // Add source if not exists
      // IMPORTANT: Use header values from mapbox-pmtiles native getHeader() for correct tile fetching
      if (!map.getSource(sourceId)) {
        console.log(`[FusedMaps] PMTiles header for ${layer.id}:`, {
          minZoom: header.minZoom,
          maxZoom: header.maxZoom,
          bounds: bounds,
          layerName: sourceLayerName,
        });
        map.addSource(sourceId, {
          type: mapboxPmTiles.SOURCE_TYPE,
          url: layer.pmtilesUrl,
          minzoom: header.minZoom,
          maxzoom: header.maxZoom,
          bounds: bounds,
        } as any);
        
        // Debug: enable tile boundaries to visualize what tiles are being loaded
        (map as any).showTileBoundaries = true;
        console.log('[FusedMaps] PMTiles: tile boundaries enabled for debugging');
        
        // Debug: log zoom changes to see if Mapbox is requesting different zoom tiles
        if (!map._pmtilesZoomDebugAttached) {
          (map as any)._pmtilesZoomDebugAttached = true;
          map.on('zoomend', () => {
            const z = map.getZoom();
            console.log(`[FusedMaps] PMTiles zoom changed to: ${z.toFixed(2)} (tile zoom: ${Math.floor(z)})`);
          });
        }

        // Debug: probe whether tiles actually exist at multiple zooms around the current view.
        // This helps distinguish "tiles only exist at one zoom" vs "renderer bug".
        try {
          if (!pmtilesTileProbeDone.has(sourceId)) {
            pmtilesTileProbeDone.add(sourceId);
            // Probe around the dataset center (not the current map center),
            // otherwise you'll just probe empty tiles when the map starts elsewhere.
            const probeLon = (typeof header.centerLon === 'number' && Number.isFinite(header.centerLon))
              ? header.centerLon
              : ((bounds?.[0] ?? 0) + (bounds?.[2] ?? 0)) / 2;
            const probeLat = (typeof header.centerLat === 'number' && Number.isFinite(header.centerLat))
              ? header.centerLat
              : ((bounds?.[1] ?? 0) + (bounds?.[3] ?? 0)) / 2;

            const zNow = Math.round(map.getZoom());
            const zList = Array.from(new Set<number>([
              header.minZoom,
              Math.max(header.minZoom, Math.min(header.maxZoom, Math.floor((header.minZoom + header.maxZoom) / 2))),
              header.maxZoom,
              Math.max(header.minZoom, Math.min(header.maxZoom, zNow)),
            ])).sort((a, b) => a - b);

            const inst = await getPMTilesInstance(layer.pmtilesUrl);
            const canGetZxy = typeof inst?.getZxy === 'function';
            if (!canGetZxy) {
              console.warn('[FusedMaps] PMTiles probe: PMTiles instance has no getZxy(); cannot probe tiles.');
            } else {
              const results: any[] = [];
              for (const z of zList) {
                const { x, y } = lonLatToTileXY(probeLon, probeLat, z);
                let bytes: number | null = null;
                let ok = false;
                try {
                  const resp = await inst.getZxy(z, x, y);
                  const data = resp?.data ?? resp;
                  if (data) {
                    // data may be Uint8Array or ArrayBuffer
                    bytes = (data.byteLength ?? (data as any).length ?? null) as any;
                    ok = bytes != null ? bytes > 0 : true;
                  }
                } catch (e) {
                  ok = false;
                }
                results.push({ z, x, y, ok, bytes });
              }
              console.log(
                `[FusedMaps] PMTiles tile probe (${layer.id}) @ dataCenter=(${probeLon.toFixed(5)},${probeLat.toFixed(5)}) zNow=${zNow}:`,
                results
              );
              try {
                // Easier to read/copy
                console.table(results);
              } catch (_) {}
            }
          }
        } catch (_) {}
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
      
      // Circle layer for points (NO geometry-type filter - let Mapbox handle it)
      const circleLayerId = `${layer.id}-circles`;
      if (!map.getLayer(circleLayerId)) {
        const layerZoomProps: any = {};
        if (typeof layer.minzoom === 'number') layerZoomProps.minzoom = layer.minzoom;
        if (typeof layer.maxzoom === 'number') layerZoomProps.maxzoom = layer.maxzoom;
        map.addLayer({
          id: circleLayerId,
          type: 'circle',
          source: sourceId,
          'source-layer': sourceLayerName,
          ...layerZoomProps,
          // NO filter - circle layer will only render point geometries naturally
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
      
      // Fill layer for polygons (NO geometry-type filter)
      const fillLayerId = `${layer.id}-fill`;
      if (!map.getLayer(fillLayerId)) {
        const layerZoomProps: any = {};
        if (typeof layer.minzoom === 'number') layerZoomProps.minzoom = layer.minzoom;
        if (typeof layer.maxzoom === 'number') layerZoomProps.maxzoom = layer.maxzoom;
        map.addLayer({
          id: fillLayerId,
          type: 'fill',
          source: sourceId,
          'source-layer': sourceLayerName,
          ...layerZoomProps,
          // NO filter - fill layer will only render polygon geometries naturally
          paint: {
            'fill-color': fillColorExpr,
            'fill-opacity': effectiveFillOpacity,
          },
          layout: { visibility: visible ? 'visible' : 'none' },
        });
      }
      
      // Line layer for polygons (outlines) and lines (NO geometry-type filter)
      const lineLayerId = `${layer.id}-line`;
      if (!map.getLayer(lineLayerId)) {
        const layerZoomProps: any = {};
        if (typeof layer.minzoom === 'number') layerZoomProps.minzoom = layer.minzoom;
        if (typeof layer.maxzoom === 'number') layerZoomProps.maxzoom = layer.maxzoom;
        map.addLayer({
          id: lineLayerId,
          type: 'line',
          source: sourceId,
          'source-layer': sourceLayerName,
          ...layerZoomProps,
          // NO filter - line layer will render line and polygon outline geometries
          paint: {
            'line-color': lineColorExpr,
            'line-width': effectiveLineWidth,
            'line-opacity': opacity,
          },
          layout: { visibility: visible ? 'visible' : 'none' },
        });
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
