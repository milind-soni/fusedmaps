/**
 * Forgiving input normalization for AI-generated configs.
 *
 * AI agents make predictable mistakes. This module normalizes
 * common variations to valid formats, reducing errors.
 */

import { findClosestPalette } from '../schema/palettes';

/**
 * Normalize a complete map config, handling common AI mistakes
 */
export function normalizeInputs(config: any): any {
  if (!config || typeof config !== 'object') return config;

  return {
    ...config,
    // Normalize center if provided
    center: config.center ? normalizeCenter(config.center) : undefined,
    // Normalize basemap variations
    basemap: config.basemap ? normalizeBasemap(config.basemap) : undefined,
    // Normalize layers
    layers: Array.isArray(config.layers)
      ? config.layers.map(normalizeLayer)
      : config.layers
  };
}

/**
 * Normalize a single layer config
 */
export function normalizeLayer(layer: any): any {
  if (!layer || typeof layer !== 'object') return layer;

  return {
    ...layer,
    // Normalize layerType variations
    layerType: normalizeLayerType(layer.layerType),
    // Normalize data
    data: layer.data ? normalizeData(layer.data, layer.layerType) : undefined,
    // Normalize style
    style: layer.style ? normalizeStyle(layer.style) : undefined,
    // Normalize geojson alias
    geojson: layer.geojson ? normalizeGeoJSON(layer.geojson) : undefined
  };
}

/**
 * Normalize layer type variations
 */
export function normalizeLayerType(type: string): string {
  if (!type) return type;

  const mapping: Record<string, string> = {
    // Hex variations
    'hexagon': 'hex',
    'hexagons': 'hex',
    'h3': 'hex',
    'h3-hex': 'hex',
    'hex-layer': 'hex',

    // Vector variations
    'geojson': 'vector',
    'json': 'vector',
    'feature': 'vector',
    'features': 'vector',
    'points': 'vector',
    'point': 'vector',
    'polygons': 'vector',
    'polygon': 'vector',
    'lines': 'vector',
    'line': 'vector',
    'linestring': 'vector',

    // MVT variations
    'tiles': 'mvt',
    'tile': 'mvt',
    'vectortiles': 'mvt',
    'vector-tiles': 'mvt',
    'mapbox-vector-tiles': 'mvt',

    // Raster variations
    'image': 'raster',
    'xyz': 'raster',
    'tms': 'raster',
    'wms': 'raster',

    // PMTiles variations
    'pmtile': 'pmtiles',
    'pm-tiles': 'pmtiles'
  };

  const lower = type.toLowerCase().trim();
  return mapping[lower] || type;
}

/**
 * Normalize center coordinates
 */
export function normalizeCenter(center: any): [number, number] | undefined {
  if (!center) return undefined;

  // Array format [lng, lat]
  if (Array.isArray(center) && center.length >= 2) {
    return [Number(center[0]), Number(center[1])];
  }

  // Object format { lng, lat } or { longitude, latitude }
  if (typeof center === 'object') {
    const lng = center.lng ?? center.longitude ?? center.lon ?? center.x;
    const lat = center.lat ?? center.latitude ?? center.y;
    if (lng !== undefined && lat !== undefined) {
      return [Number(lng), Number(lat)];
    }
  }

  return undefined;
}

/**
 * Normalize basemap name
 */
export function normalizeBasemap(basemap: string): string {
  if (!basemap) return 'dark';

  const mapping: Record<string, string> = {
    'dark': 'dark',
    'dark-v11': 'dark',
    'mapbox-dark': 'dark',

    'light': 'light',
    'light-v11': 'light',
    'mapbox-light': 'light',

    'streets': 'streets',
    'streets-v12': 'streets',
    'mapbox-streets': 'streets',
    'road': 'streets',
    'roadmap': 'streets',

    'satellite': 'satellite',
    'satellite-streets': 'satellite',
    'satellite-v9': 'satellite',
    'aerial': 'satellite',

    'none': 'none',
    'empty': 'none',
    'blank': 'none',
    'transparent': 'none'
  };

  const lower = basemap.toLowerCase().trim();
  return mapping[lower] || basemap;
}

/**
 * Normalize style object
 */
export function normalizeStyle(style: any): any {
  if (!style || typeof style !== 'object') return style;

  return {
    ...style,
    fillColor: style.fillColor ? normalizeColor(style.fillColor) : undefined,
    lineColor: style.lineColor ? normalizeColor(style.lineColor) : undefined,
    strokeColor: style.strokeColor ? normalizeColor(style.strokeColor) : undefined,
    // Normalize opacity from percentage to decimal if needed
    opacity: normalizeOpacity(style.opacity),
    // Handle common aliases
    pointRadius: style.pointRadius ?? style.radius ?? style.circleRadius,
    lineWidth: style.lineWidth ?? style.strokeWidth ?? style.width
  };
}

/**
 * Normalize color value
 */
export function normalizeColor(color: any): any {
  // Null/undefined pass through
  if (color === null || color === undefined) return color;

  // String color - validate and pass through
  if (typeof color === 'string') {
    return normalizeColorString(color);
  }

  // RGB(A) array
  if (Array.isArray(color)) {
    return normalizeColorArray(color);
  }

  // Color scale object
  if (typeof color === 'object') {
    return normalizeColorScale(color);
  }

  return color;
}

/**
 * Normalize color string
 */
function normalizeColorString(color: string): string {
  const trimmed = color.trim();

  // Add # to hex colors if missing
  if (/^[0-9a-f]{6}$/i.test(trimmed)) {
    return `#${trimmed}`;
  }
  if (/^[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed}`;
  }

  return trimmed;
}

/**
 * Normalize color array
 */
function normalizeColorArray(color: number[]): number[] {
  if (color.length < 3) return color;

  // Detect 0-1 range and convert to 0-255
  const maxVal = Math.max(...color.slice(0, 3));
  if (maxVal <= 1 && color.slice(0, 3).some(v => v > 0 && v < 1)) {
    // Values are in 0-1 range, scale to 0-255
    return color.map((v, i) => {
      if (i < 3) return Math.round(v * 255);
      if (i === 3) return v <= 1 ? Math.round(v * 255) : v; // Alpha
      return v;
    });
  }

  return color.map(v => Math.round(v));
}

/**
 * Normalize color scale object
 */
function normalizeColorScale(color: any): any {
  const normalized: any = { ...color };

  // Normalize type
  if (color.type) {
    const typeMapping: Record<string, string> = {
      'linear': 'continuous',
      'gradient': 'continuous',
      'sequential': 'continuous',
      'discrete': 'categorical',
      'category': 'categorical',
      'categories': 'categorical',
      'qualitative': 'categorical'
    };
    normalized.type = typeMapping[color.type.toLowerCase()] || color.type;
  }

  // Normalize palette name
  if (color.palette) {
    const corrected = findClosestPalette(color.palette);
    if (corrected) {
      normalized.palette = corrected;
    }
  }

  // Handle color/colors alias for palette
  if (!normalized.palette && (color.colors || color.color)) {
    const paletteName = color.colors || color.color;
    if (typeof paletteName === 'string') {
      const corrected = findClosestPalette(paletteName);
      if (corrected) {
        normalized.palette = corrected;
      }
    }
  }

  // Normalize attribute aliases
  if (!normalized.attr) {
    normalized.attr = color.attribute || color.field || color.property || color.column;
  }

  // Normalize domain
  if (color.domain && !Array.isArray(color.domain)) {
    // Handle object domain { min, max }
    if (typeof color.domain === 'object' && color.domain.min !== undefined) {
      normalized.domain = [color.domain.min, color.domain.max];
    }
  }

  // Ensure domain is [min, max] not [max, min]
  if (Array.isArray(normalized.domain) && normalized.domain.length === 2) {
    const [a, b] = normalized.domain;
    if (a > b) {
      normalized.domain = [b, a];
    }
  }

  return normalized;
}

/**
 * Normalize opacity value
 */
function normalizeOpacity(opacity: any): number | undefined {
  if (opacity === undefined || opacity === null) return undefined;

  const num = Number(opacity);
  if (isNaN(num)) return undefined;

  // If > 1, assume it's a percentage
  if (num > 1 && num <= 100) {
    return num / 100;
  }

  // Clamp to 0-1
  return Math.max(0, Math.min(1, num));
}

/**
 * Normalize data array
 */
export function normalizeData(data: any, layerType?: string): any {
  if (!data) return data;

  // If it's an array for hex layer, normalize H3 keys
  if (Array.isArray(data) && (layerType === 'hex' || layerType === 'hexagon' || layerType === 'h3')) {
    return data.map(normalizeH3DataItem);
  }

  // If it's a GeoJSON object
  if (typeof data === 'object' && (data.type === 'FeatureCollection' || data.features)) {
    return normalizeGeoJSON(data);
  }

  return data;
}

/**
 * Normalize H3 data item
 */
function normalizeH3DataItem(item: any): any {
  if (!item || typeof item !== 'object') return item;

  // Normalize H3 key variations
  const h3 = item.h3 || item.H3 || item.hex || item.hexagon || item.h3_index || item.h3Index;

  if (h3 && !item.h3) {
    const { H3, hex, hexagon, h3_index, h3Index, ...rest } = item;
    return { h3, ...rest };
  }

  return item;
}

/**
 * Normalize GeoJSON structure
 */
export function normalizeGeoJSON(geojson: any): any {
  if (!geojson || typeof geojson !== 'object') return geojson;

  // If it's just features array, wrap in FeatureCollection
  if (Array.isArray(geojson)) {
    return {
      type: 'FeatureCollection',
      features: geojson.map(normalizeFeature)
    };
  }

  // If it has features but missing type
  if (geojson.features && !geojson.type) {
    return {
      type: 'FeatureCollection',
      features: geojson.features.map(normalizeFeature)
    };
  }

  // If it's a single feature, wrap in collection
  if (geojson.type === 'Feature') {
    return {
      type: 'FeatureCollection',
      features: [normalizeFeature(geojson)]
    };
  }

  // If it's a geometry directly (no Feature wrapper)
  if (geojson.type && geojson.coordinates) {
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: geojson,
        properties: {}
      }]
    };
  }

  // Already a FeatureCollection
  if (geojson.type === 'FeatureCollection') {
    return {
      ...geojson,
      features: (geojson.features || []).map(normalizeFeature)
    };
  }

  return geojson;
}

/**
 * Normalize a single GeoJSON feature
 */
function normalizeFeature(feature: any): any {
  if (!feature || typeof feature !== 'object') return feature;

  // If it's just a geometry, wrap in Feature
  if (feature.type && feature.coordinates && !feature.geometry) {
    return {
      type: 'Feature',
      geometry: feature,
      properties: {}
    };
  }

  // Ensure properties exists
  if (!feature.properties) {
    return { ...feature, properties: {} };
  }

  return feature;
}
