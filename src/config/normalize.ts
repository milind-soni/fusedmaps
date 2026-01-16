/**
 * Config normalizer - converts new clean config format to internal format
 *
 * New format (user-facing):
 *   { type: 'continuous', attr: 'value', palette: 'Viridis', domain: [0, 100] }
 *
 * Internal format (renderer):
 *   { '@@function': 'colorContinuous', attr: 'value', colors: 'Viridis', domain: [0, 100] }
 */

import type {
  LayerConfig,
  HexLayer,
  VectorLayer,
  MVTLayer,
  RasterLayer,
  PMTilesLayer,
  ColorValue,
  ColorConfig,
  ContinuousColor,
  CategoricalColor,
} from '../types';

/**
 * Convert RGB/RGBA array to rgba() string
 */
function arrayToRgba(arr: number[]): string {
  if (arr.length >= 4) {
    // RGBA - alpha is 0-255, convert to 0-1
    return `rgba(${arr[0]},${arr[1]},${arr[2]},${arr[3] / 255})`;
  }
  return `rgb(${arr[0]},${arr[1]},${arr[2]})`;
}

/**
 * Convert new-style color config to legacy @@function format
 */
export function normalizeColor(color: ColorValue | undefined): ColorConfig | undefined {
  if (!color) return undefined;

  // Already a string - pass through
  if (typeof color === 'string') return color;

  // Array - convert to rgba string so it can be used as fillColorRgba/lineColorRgba
  if (Array.isArray(color)) return arrayToRgba(color);

  // New format: { type: 'continuous', ... }
  if ('type' in color) {
    if (color.type === 'continuous') {
      const c = color as ContinuousColor;
      return {
        '@@function': 'colorContinuous',
        attr: c.attr,
        domain: c.domain || [0, 1],
        colors: c.palette,
        steps: c.steps,
        nullColor: c.nullColor,
        reverse: c.reverse,
        autoDomain: c.autoDomain ?? true,
      };
    }
    if (color.type === 'categorical') {
      const c = color as CategoricalColor;
      return {
        '@@function': 'colorCategories',
        attr: c.attr,
        categories: c.categories,
        labelAttr: c.labelAttr,
        colors: c.palette,
        nullColor: c.nullColor,
      };
    }
  }

  // Legacy format: { '@@function': ... } - pass through
  if ('@@function' in color) {
    return color as ColorConfig;
  }

  return undefined;
}

/**
 * Normalize a layer config to internal format
 */
export function normalizeLayerConfig(config: LayerConfig): LayerConfig {
  switch (config.layerType) {
    case 'hex':
      return normalizeHexLayer(config);
    case 'vector':
      return normalizeVectorLayer(config);
    case 'mvt':
      return normalizeMVTLayer(config);
    case 'raster':
      return normalizeRasterLayer(config);
    case 'pmtiles':
      return normalizePMTilesLayer(config);
    default:
      return config;
  }
}

function normalizeHexLayer(layer: HexLayer): any {
  const style = layer.style || {};
  const tile = layer.tile || {};

  return {
    id: layer.id,
    name: layer.name,
    layerType: 'hex',
    visible: layer.visible,
    data: layer.data,
    tileUrl: layer.tileUrl,
    isTileLayer: !!layer.tileUrl,
    parquetUrl: layer.parquetUrl,
    parquetData: layer.parquetData,
    sql: layer.sql,
    dataRef: layer.dataRef,
    tooltipColumns: layer.tooltip,
    hexLayer: {
      filled: style.filled ?? true,
      stroked: style.stroked ?? true,
      extruded: style.extruded ?? false,
      opacity: style.opacity ?? 1,
      elevationProperty: style.elevationAttr,
      elevationScale: style.elevationScale ?? 1,
      getFillColor: normalizeColor(style.fillColor),
      getLineColor: normalizeColor(style.lineColor),
      lineWidthMinPixels: style.lineWidth ?? 1,
      tooltipColumns: layer.tooltip,
    },
    tileLayerConfig: Object.keys(tile).length > 0 ? {
      minZoom: tile.minZoom,
      maxZoom: tile.maxZoom,
      zoomOffset: tile.zoomOffset,
      tileSize: tile.tileSize,
      maxRequests: tile.maxRequests,
    } : undefined,
  };
}

/**
 * Check if a value is a color function config (continuous or categorical)
 */
function isColorFunctionConfig(c: unknown): c is Record<string, unknown> {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
  return '@@function' in c || 'type' in c;
}

function normalizeVectorLayer(layer: VectorLayer): any {
  const style = layer.style || {};

  const fillColor = normalizeColor(style.fillColor);
  const lineColor = normalizeColor(style.lineColor);

  return {
    id: layer.id,
    name: layer.name,
    layerType: 'vector',
    visible: layer.visible,
    geojson: layer.geojson,
    geojsonSource: layer.source,
    dataRef: layer.dataRef,
    tooltipColumns: layer.tooltip,
    vectorLayer: {
      filled: style.filled ?? true,
      stroked: style.stroked ?? true,
      opacity: style.opacity ?? 0.8,
      getFillColor: fillColor,
      getLineColor: lineColor,
      lineWidthMinPixels: style.lineWidth ?? 1,
      pointRadiusMinPixels: style.pointRadius ?? 6,
    },
    fillColorConfig: isColorFunctionConfig(fillColor) ? fillColor : undefined,
    fillColorRgba: typeof fillColor === 'string' ? fillColor : undefined,
    lineColorConfig: isColorFunctionConfig(lineColor) ? lineColor : undefined,
    lineColorRgba: typeof lineColor === 'string' ? lineColor : undefined,
    lineWidth: style.lineWidth ?? 1,
    pointRadius: style.pointRadius ?? 6,
    isFilled: style.filled ?? true,
    isStroked: style.stroked ?? true,
    opacity: style.opacity ?? 0.8,
  };
}

function normalizeMVTLayer(layer: MVTLayer): any {
  const style = layer.style || {};
  const tile = layer.tile || {};

  const fillColor = normalizeColor(style.fillColor);
  const lineColor = normalizeColor(style.lineColor);

  return {
    id: layer.id,
    name: layer.name,
    layerType: 'mvt',
    visible: layer.visible,
    tileUrl: layer.tileUrl,
    sourceLayer: layer.sourceLayer,
    dataRef: layer.dataRef,
    tooltipColumns: layer.tooltip,
    minzoom: tile.minZoom,
    maxzoom: tile.maxZoom,
    fillColorConfig: isColorFunctionConfig(fillColor) ? fillColor : undefined,
    fillColor: typeof fillColor === 'string' ? fillColor : undefined,
    fillOpacity: style.opacity ?? 0.8,
    isFilled: style.filled ?? true,
    lineColorConfig: isColorFunctionConfig(lineColor) ? lineColor : undefined,
    lineColor: typeof lineColor === 'string' ? lineColor : undefined,
    lineWidth: style.lineWidth ?? 1,
    isExtruded: style.extruded ?? false,
    heightProperty: style.elevationAttr,
    heightMultiplier: style.elevationScale,
  };
}

function normalizeRasterLayer(layer: RasterLayer): any {
  return {
    id: layer.id,
    name: layer.name,
    layerType: 'raster',
    visible: layer.visible,
    tileUrl: layer.tileUrl,
    imageUrl: layer.imageUrl,
    imageBounds: layer.imageBounds,
    dataRef: layer.dataRef,
    opacity: layer.opacity ?? 1,
    rasterLayer: {
      opacity: layer.opacity ?? 1,
    },
  };
}

function normalizePMTilesLayer(layer: PMTilesLayer): any {
  const style = layer.style || {};
  const tile = layer.tile || {};

  const fillColor = normalizeColor(style.fillColor);
  const lineColor = normalizeColor(style.lineColor);

  return {
    id: layer.id,
    name: layer.name,
    layerType: 'pmtiles',
    visible: layer.visible,
    pmtilesUrl: layer.pmtilesUrl,
    pmtilesPath: layer.pmtilesPath,
    sourceLayer: layer.sourceLayer,
    excludeSourceLayers: layer.excludeSourceLayers,
    dataRef: layer.dataRef,
    tooltipColumns: layer.tooltip,
    minzoom: tile.minZoom,
    maxzoom: tile.maxZoom,
    fillColorConfig: isColorFunctionConfig(fillColor) ? fillColor : undefined,
    lineColorConfig: isColorFunctionConfig(lineColor) ? lineColor : undefined,
    fillOpacity: style.opacity ?? 0.8,
    lineWidth: style.lineWidth ?? 1,
    pointRadiusMinPixels: style.pointRadius ?? 4,
    isFilled: style.filled ?? true,
    isStroked: style.stroked ?? true,
    renderPoints: layer.renderPoints,
    renderLines: layer.renderLines,
    renderPolygons: layer.renderPolygons,
    colorAttribute: (style.fillColor as ContinuousColor)?.attr,
  };
}

/**
 * Check if a layer config uses the new format (has `style` key)
 */
export function isNewFormat(config: any): boolean {
  return 'style' in config || 'tile' in config || 'tooltip' in config;
}

/**
 * Normalize all layers in a config
 */
export function normalizeConfig(config: any): any {
  if (!config?.layers) return config;

  return {
    ...config,
    layers: config.layers.map((layer: any) => {
      // Only normalize if using new format
      if (isNewFormat(layer)) {
        return normalizeLayerConfig(layer);
      }
      return layer;
    }),
  };
}
