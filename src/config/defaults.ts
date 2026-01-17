/**
 * Smart defaults for AI-agent-generated configs.
 *
 * Applies sensible defaults to minimize required fields,
 * making it easier for AI agents to generate valid configs.
 */

import type { FusedMapsConfig, LayerConfig, ViewState } from '../types';

let layerCounter = 0;

/**
 * Reset the layer counter (useful for testing)
 */
export function resetLayerCounter(): void {
  layerCounter = 0;
}

/**
 * Generate a unique layer ID
 */
export function generateLayerId(): string {
  return `layer-${++layerCounter}`;
}

/**
 * Simplified config format that AI agents can easily generate
 */
export interface SimpleMapConfig {
  /** Map center [longitude, latitude]. Omit to auto-fit to data. */
  center?: [number, number];
  /** Zoom level 0-22 */
  zoom?: number;
  /** Map pitch (tilt) in degrees */
  pitch?: number;
  /** Map bearing (rotation) in degrees */
  bearing?: number;
  /** Base map style */
  basemap?: 'dark' | 'light' | 'streets' | 'satellite' | 'none';
  /** Data layers */
  layers: Array<Partial<LayerConfig> & { layerType: LayerConfig['layerType'] }>;
  /** Mapbox access token (optional - uses default if not provided) */
  mapboxToken?: string;
  /** UI options */
  ui?: {
    legend?: boolean;
    layerPanel?: boolean;
    tooltip?: boolean;
    controls?: boolean;
    scale?: boolean;
  };
}

/**
 * Apply smart defaults to a simplified config.
 * Converts SimpleMapConfig to full FusedMapsConfig.
 */
export function applyDefaults(config: SimpleMapConfig): FusedMapsConfig {
  // Apply defaults to each layer
  const layers = config.layers.map((layer, index) => applyLayerDefaults(layer, index));

  // Build initialViewState from simplified center/zoom
  const initialViewState: ViewState = config.center
    ? {
        longitude: config.center[0],
        latitude: config.center[1],
        zoom: config.zoom ?? 10,
        pitch: config.pitch ?? 0,
        bearing: config.bearing ?? 0
      }
    : {
        longitude: 0,
        latitude: 0,
        zoom: 1,
        pitch: 0,
        bearing: 0
      };

  // Map basemap names to Mapbox style URLs
  const styleUrl = getStyleUrl(config.basemap);

  // Get mapbox token from config or try to find a default
  const mapboxToken = config.mapboxToken || getDefaultToken();

  return {
    containerId: 'map',
    mapboxToken,
    styleUrl,
    initialViewState,
    layers: layers as LayerConfig[],
    hasCustomView: !!config.center,
    ui: {
      tooltip: config.ui?.tooltip !== false,
      legend: config.ui?.legend !== false,
      layerPanel: config.ui?.layerPanel !== false,
      screenshot: true,
      basemapSwitcher: true
    }
  };
}

/**
 * Apply defaults to a single layer config
 */
export function applyLayerDefaults(
  layer: Partial<LayerConfig> & { layerType: LayerConfig['layerType'] },
  index: number
): LayerConfig {
  const id = layer.id || generateLayerId();
  const name = layer.name || layer.id || `Layer ${index + 1}`;

  // Base layer with defaults
  const baseLayer = {
    id,
    name,
    visible: layer.visible !== false,
    ...layer
  };

  // Apply type-specific defaults
  switch (layer.layerType) {
    case 'hex':
      return {
        ...baseLayer,
        layerType: 'hex',
        style: {
          opacity: 0.8,
          filled: true,
          stroked: true,
          ...layer.style
        }
      } as LayerConfig;

    case 'vector':
      return {
        ...baseLayer,
        layerType: 'vector',
        style: {
          opacity: 0.8,
          filled: true,
          stroked: true,
          lineWidth: 1,
          pointRadius: 5,
          ...layer.style
        }
      } as LayerConfig;

    case 'mvt':
      return {
        ...baseLayer,
        layerType: 'mvt',
        style: {
          opacity: 0.8,
          filled: true,
          stroked: true,
          ...layer.style
        }
      } as LayerConfig;

    case 'raster':
      return {
        ...baseLayer,
        layerType: 'raster',
        opacity: (layer as any).opacity ?? 1
      } as LayerConfig;

    case 'pmtiles':
      return {
        ...baseLayer,
        layerType: 'pmtiles',
        style: {
          opacity: 0.8,
          filled: true,
          stroked: true,
          ...layer.style
        }
      } as LayerConfig;

    default:
      return baseLayer as LayerConfig;
  }
}

/**
 * Get Mapbox style URL from basemap name
 */
function getStyleUrl(basemap?: string): string {
  const styles: Record<string, string> = {
    dark: 'mapbox://styles/mapbox/dark-v11',
    light: 'mapbox://styles/mapbox/light-v11',
    streets: 'mapbox://styles/mapbox/streets-v12',
    satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
    none: 'mapbox://styles/mapbox/empty-v9'
  };

  return styles[basemap || 'dark'] || styles.dark;
}

/**
 * Try to get a default Mapbox token from common locations
 */
function getDefaultToken(): string {
  if (typeof window === 'undefined') return '';

  // Check various common locations
  const w = window as any;

  return (
    w.MAPBOX_TOKEN ||
    w.MAPBOX_ACCESS_TOKEN ||
    w.mapboxToken ||
    w.mapboxAccessToken ||
    (w.mapboxgl?.accessToken) ||
    ''
  );
}

/**
 * Infer view state from layer data bounds
 */
export function inferViewStateFromData(layers: LayerConfig[]): ViewState | null {
  // This is a placeholder - actual implementation would compute
  // bounds from layer data and return appropriate center/zoom
  // The main init() function handles this via auto-fit
  return null;
}

/**
 * Check if config has explicit view state
 */
export function hasExplicitViewState(config: SimpleMapConfig): boolean {
  return !!(config.center && config.zoom !== undefined);
}
