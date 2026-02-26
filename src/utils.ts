/**
 * Shared utility functions
 */

/**
 * Clamp a number between min and max
 */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}


/**
 * Parse hex color string to RGB array
 * @param hex - Color string like "#ff0000"
 * @param alpha - Optional alpha value (0-255)
 * @returns [r, g, b] or [r, g, b, a] array, or null if invalid
 */
export function parseHexColor(hex: string, alpha?: number): number[] | null {
  try {
    const c = String(hex || '').trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(c)) return null;
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    if (typeof alpha === 'number' && Number.isFinite(alpha)) {
      return [r, g, b, clamp(Math.round(alpha), 0, 255)];
    }
    return [r, g, b];
  } catch {
    return null;
  }
}

/**
 * Convert RGB array to hex string
 */
export function rgbToHex(rgb: number[]): string {
  if (!Array.isArray(rgb) || rgb.length < 3) return '#888888';
  return '#' + rgb.slice(0, 3)
    .map(x => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Format number with fixed decimal places
 */
export function fmt(n: number, digits: number): string {
  try {
    return Number.isFinite(n) ? n.toFixed(digits) : '';
  } catch {
    return '';
  }
}

// ============================================================
// Layer ID Utilities
// ============================================================
// Centralized logic for getting Mapbox layer IDs from layer configs.
// This avoids duplication across tooltip.ts, highlight.ts, and layers/index.ts.

import type { LayerConfig, HexLayerConfig, VectorLayerConfig } from './types';

/**
 * Layer ID suffix patterns for each layer type
 */
export const LAYER_ID_SUFFIXES = {
  hex: {
    fill: '-fill',
    extrusion: '-extrusion',
    outline: '-outline',
  },
  vector: {
    fill: '-fill',
    outline: '-outline',
    circle: '-circle',
    line: '-line',
  },
  mvt: {
    fill: '-fill',
    line: '-line',
    extrusion: '-extrusion',
  },
  raster: {
    raster: '-raster',
  },
  pmtiles: {
    fill: '-fill',
    line: '-line',
    circles: '-circles',
  },
} as const;

/**
 * Get all possible Mapbox layer IDs for a given layer config.
 * This is the single source of truth for layer ID generation.
 *
 * @param layer - The layer configuration
 * @param options - Optional settings
 * @returns Array of Mapbox layer IDs (may not all exist on map)
 */
export function getMapboxLayerIds(
  layer: LayerConfig,
  options?: { includeAll?: boolean }
): string[] {
  const { includeAll = false } = options || {};
  const ids: string[] = [];

  switch (layer.layerType) {
    case 'hex': {
      const hexLayer = layer as HexLayerConfig;
      // Skip tile layers - they use Deck.gl, not Mapbox layers
      if ((hexLayer as any).isTileLayer) return ids;

      const isExtruded = (hexLayer as any).hexLayer?.extruded === true;
      if (includeAll) {
        ids.push(`${layer.id}${LAYER_ID_SUFFIXES.hex.fill}`);
        ids.push(`${layer.id}${LAYER_ID_SUFFIXES.hex.extrusion}`);
        ids.push(`${layer.id}${LAYER_ID_SUFFIXES.hex.outline}`);
      } else {
        // Only add the layer that's actually rendered
        if (isExtruded) {
          ids.push(`${layer.id}${LAYER_ID_SUFFIXES.hex.extrusion}`);
        } else {
          ids.push(`${layer.id}${LAYER_ID_SUFFIXES.hex.fill}`);
        }
        ids.push(`${layer.id}${LAYER_ID_SUFFIXES.hex.outline}`);
      }
      break;
    }

    case 'vector': {
      ids.push(`${layer.id}${LAYER_ID_SUFFIXES.vector.fill}`);
      ids.push(`${layer.id}${LAYER_ID_SUFFIXES.vector.outline}`);
      ids.push(`${layer.id}${LAYER_ID_SUFFIXES.vector.circle}`);
      ids.push(`${layer.id}${LAYER_ID_SUFFIXES.vector.line}`);
      break;
    }

    case 'mvt': {
      ids.push(`${layer.id}${LAYER_ID_SUFFIXES.mvt.fill}`);
      ids.push(`${layer.id}${LAYER_ID_SUFFIXES.mvt.line}`);
      ids.push(`${layer.id}${LAYER_ID_SUFFIXES.mvt.extrusion}`);
      break;
    }

    case 'raster': {
      ids.push(`${layer.id}${LAYER_ID_SUFFIXES.raster.raster}`);
      break;
    }

    case 'pmtiles': {
      // PMTiles creates dynamic layers with prefixes.
      // Return the common pattern - actual IDs discovered at runtime.
      ids.push(`${layer.id}${LAYER_ID_SUFFIXES.pmtiles.fill}`);
      ids.push(`${layer.id}${LAYER_ID_SUFFIXES.pmtiles.line}`);
      ids.push(`${layer.id}${LAYER_ID_SUFFIXES.pmtiles.circles}`);
      break;
    }
  }

  return ids;
}

/**
 * Get layer IDs that can be queried for hover/click interactions.
 * Excludes tile layers (handled by Deck.gl) and non-queryable layers.
 *
 * @param layer - The layer configuration
 * @returns Array of queryable Mapbox layer IDs
 */
export function getQueryableLayerIds(layer: LayerConfig): string[] {
  // Skip tile layers - they're queried via Deck.gl pickObject
  if ((layer as any).isTileLayer) return [];

  // Raster layers aren't queryable
  if (layer.layerType === 'raster') return [];

  return getMapboxLayerIds(layer);
}

/**
 * Get the first (primary) Mapbox layer ID for a layer config.
 * Used for beforeId calculations in layer ordering.
 *
 * @param layer - The layer configuration
 * @returns The first layer ID, or null for tile layers
 */
export function getFirstMapboxLayerId(layer: LayerConfig): string | null {
  // Tile layers don't have Mapbox layers
  if ((layer as any).isTileLayer) return null;

  switch (layer.layerType) {
    case 'vector': {
      const vec = layer as VectorLayerConfig;
      const geojson = vec.geojson;
      // Check geometry types to determine which sublayer renders first
      if (geojson?.features?.length) {
        for (const f of geojson.features) {
          const t = f.geometry?.type;
          if (t === 'Polygon' || t === 'MultiPolygon') {
            return (vec as any).isFilled !== false
              ? `${layer.id}${LAYER_ID_SUFFIXES.vector.fill}`
              : `${layer.id}${LAYER_ID_SUFFIXES.vector.outline}`;
          }
        }
        for (const f of geojson.features) {
          const t = f.geometry?.type;
          if (t === 'LineString' || t === 'MultiLineString') {
            return `${layer.id}${LAYER_ID_SUFFIXES.vector.line}`;
          }
        }
        for (const f of geojson.features) {
          const t = f.geometry?.type;
          if (t === 'Point' || t === 'MultiPoint') {
            return `${layer.id}${LAYER_ID_SUFFIXES.vector.circle}`;
          }
        }
      }
      return `${layer.id}${LAYER_ID_SUFFIXES.vector.fill}`;
    }

    case 'hex': {
      const hex = layer as HexLayerConfig;
      const isExtruded = (hex as any).hexLayer?.extruded === true;
      return isExtruded
        ? `${layer.id}${LAYER_ID_SUFFIXES.hex.extrusion}`
        : `${layer.id}${LAYER_ID_SUFFIXES.hex.fill}`;
    }

    case 'mvt':
      return `${layer.id}${LAYER_ID_SUFFIXES.mvt.fill}`;

    case 'raster':
      return `${layer.id}${LAYER_ID_SUFFIXES.raster.raster}`;

    case 'pmtiles':
      return `${layer.id}${LAYER_ID_SUFFIXES.pmtiles.fill}`;

    default:
      return null;
  }
}

/**
 * Get all layer IDs to remove when removing a layer.
 * Includes all possible suffixes to ensure cleanup.
 */
export function getRemovableLayerIds(layer: LayerConfig): string[] {
  const id = layer.id;
  return [
    `${id}-fill`,
    `${id}-extrusion`,
    `${id}-outline`,
    `${id}-circle`,
    `${id}-line`,
    `${id}-raster`,
    `${id}-circles`,
  ];
}
