/**
 * Marker layer rendering — renders point features as colored SVG pin markers
 * using Mapbox symbol layers.
 */

import type { MarkerLayerConfig } from '../types';

const PIN_SVG_SIZE = 40;
const PIN_WIDTH = 28;
const PIN_HEIGHT = 36;

function pinSvg(fill: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_WIDTH}" height="${PIN_HEIGHT}" viewBox="0 0 ${PIN_WIDTH} ${PIN_HEIGHT}">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z"
          fill="${fill}" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>
    <circle cx="14" cy="13" r="5" fill="white" opacity="0.9"/>
  </svg>`;
}

function renderSvgToImageData(
  svgStr: string,
  width: number,
  height: number
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(ctx.getImageData(0, 0, width, height));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load pin SVG'));
    };
    img.src = url;
  });
}

const FALLBACK_COLORS = [
  '#E8A735', '#4CAF50', '#2196F3', '#FF5722', '#9C27B0',
  '#00BCD4', '#FF9800', '#795548', '#607D8B', '#E91E63',
];

export async function addMarkerLayer(
  map: mapboxgl.Map,
  layer: MarkerLayerConfig,
  visible: boolean
): Promise<void> {
  const geojson = layer.geojson;
  if (!geojson?.features?.length) return;

  const mc = layer.markerConfig || {};
  const attr = mc.attr || (
    layer.style?.fillColor && typeof layer.style.fillColor === 'object' && !Array.isArray(layer.style.fillColor)
      ? (layer.style.fillColor as any).attr
      : null
  );
  const defaultColor = mc.defaultColor || '#E8A735';
  const pixelRatio = 2;
  const renderW = PIN_WIDTH * pixelRatio;
  const renderH = PIN_HEIGHT * pixelRatio;

  // Determine unique colors needed
  const colorMap: Record<string, string> = {};

  if (attr) {
    // Build color map from markerConfig.icons or categorical fillColor
    if (mc.icons) {
      for (const [key, val] of Object.entries(mc.icons)) {
        colorMap[key] = val.color;
      }
    } else if (layer.style?.fillColor && typeof layer.style.fillColor === 'object' && !Array.isArray(layer.style.fillColor)) {
      const fc = layer.style.fillColor as any;
      if (fc.categories) {
        for (const [key, val] of Object.entries(fc.categories as Record<string, any>)) {
          colorMap[key] = Array.isArray(val) ? `rgb(${val[0]},${val[1]},${val[2]})` : String(val);
        }
      }
    }

    // Auto-assign colors for values not yet mapped
    const uniqueValues = new Set<string>();
    for (const f of geojson.features) {
      const v = f.properties?.[attr];
      if (v != null) uniqueValues.add(String(v));
    }
    let colorIdx = 0;
    for (const v of uniqueValues) {
      if (!colorMap[v]) {
        colorMap[v] = FALLBACK_COLORS[colorIdx % FALLBACK_COLORS.length];
        colorIdx++;
      }
    }
  }

  // Generate and register pin images
  const uniqueColors = attr
    ? Object.entries(colorMap)
    : [['_default', defaultColor] as [string, string]];

  const imagePrefix = `fm-pin-${layer.id}`;

  for (const [key, color] of uniqueColors) {
    const imageName = `${imagePrefix}-${key}`;
    if (map.hasImage(imageName)) continue;

    try {
      const svg = pinSvg(color);
      const imageData = await renderSvgToImageData(svg, renderW, renderH);
      map.addImage(imageName, {
        width: renderW,
        height: renderH,
        data: new Uint8Array(imageData.data.buffer),
      }, { pixelRatio });
    } catch (e) {
      console.warn(`[FusedMaps] Failed to render pin image for "${key}":`, e);
    }
  }

  // Add GeoJSON source
  if (!map.getSource(layer.id)) {
    map.addSource(layer.id, { type: 'geojson', data: geojson });
  }

  // Build icon-image expression
  let iconImageExpr: any;
  if (attr && Object.keys(colorMap).length > 1) {
    const matchExpr: any[] = ['match', ['get', attr]];
    for (const [key] of Object.entries(colorMap)) {
      matchExpr.push(key, `${imagePrefix}-${key}`);
    }
    matchExpr.push(`${imagePrefix}-${Object.keys(colorMap)[0]}`); // fallback
    iconImageExpr = matchExpr;
  } else if (attr && Object.keys(colorMap).length === 1) {
    const key = Object.keys(colorMap)[0];
    iconImageExpr = `${imagePrefix}-${key}`;
  } else {
    iconImageExpr = `${imagePrefix}-_default`;
  }

  // Add symbol layer
  const symbolLayerId = `${layer.id}-symbol`;
  if (!map.getLayer(symbolLayerId)) {
    map.addLayer({
      id: symbolLayerId,
      type: 'symbol',
      source: layer.id,
      layout: {
        'icon-image': iconImageExpr,
        'icon-size': mc.size || 1,
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        visibility: visible ? 'visible' : 'none',
      },
      filter: ['any',
        ['==', ['geometry-type'], 'Point'],
        ['==', ['geometry-type'], 'MultiPoint'],
      ],
    });
  }
}

export function setMarkerLayerVisibility(
  map: mapboxgl.Map,
  layerId: string,
  visible: boolean
): void {
  const symbolId = `${layerId}-symbol`;
  if (map.getLayer(symbolId)) {
    map.setLayoutProperty(symbolId, 'visibility', visible ? 'visible' : 'none');
  }
}
