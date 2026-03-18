/**
 * Marker layer rendering — uses mapboxgl.Marker with custom HTML pin elements.
 * This avoids map.addImage() issues and works reliably across Mapbox GL versions.
 */

import type { MarkerLayerConfig } from '../types';

const FALLBACK_COLORS = [
  '#E8A735', '#4CAF50', '#2196F3', '#FF5722', '#9C27B0',
  '#00BCD4', '#FF9800', '#795548', '#607D8B', '#E91E63',
];

// Store active markers per layer for cleanup and visibility toggling
const _activeMarkers: Record<string, mapboxgl.Marker[]> = {};

function pinHtml(fill: string, size: number): string {
  const w = Math.round(28 * size);
  const h = Math.round(36 * size);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 28 36" style="display:block;cursor:pointer;">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z"
          fill="${fill}" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>
    <circle cx="14" cy="13" r="5" fill="white" opacity="0.9"/>
  </svg>`;
}

export function addMarkerLayer(
  map: mapboxgl.Map,
  layer: MarkerLayerConfig,
  visible: boolean
): void {
  const geojson = layer.geojson;
  if (!geojson?.features?.length) return;

  const mc = layer.markerConfig || {};
  const attr = mc.attr || (
    layer.style?.fillColor && typeof layer.style.fillColor === 'object' && !Array.isArray(layer.style.fillColor)
      ? (layer.style.fillColor as any).attr
      : null
  );
  const defaultColor = mc.defaultColor || '#E8A735';
  const size = mc.size || 1;

  // Build color map
  const colorMap: Record<string, string> = {};
  if (attr) {
    if (mc.icons) {
      for (const [key, val] of Object.entries(mc.icons)) {
        colorMap[key] = val.color;
      }
    }
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

  // Remove existing markers for this layer
  removeMarkerLayer(layer.id);

  const markers: mapboxgl.Marker[] = [];
  const mapboxgl = (window as any).mapboxgl;

  for (const feature of geojson.features) {
    const geom = feature.geometry;
    if (!geom || (geom.type !== 'Point' && geom.type !== 'MultiPoint')) continue;

    const coords = geom.type === 'Point'
      ? [geom.coordinates as [number, number]]
      : (geom.coordinates as [number, number][]);

    for (const coord of coords) {
      const val = attr ? String(feature.properties?.[attr] ?? '') : '';
      const color = attr ? (colorMap[val] || defaultColor) : defaultColor;

      const el = document.createElement('div');
      el.innerHTML = pinHtml(color, size);
      el.style.display = visible ? '' : 'none';

      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(coord)
        .addTo(map);

      // Add popup with tooltip properties
      const tooltip = layer.tooltip;
      if (tooltip && tooltip.length > 0 && feature.properties) {
        const props = feature.properties;
        const rows = tooltip
          .filter((k: string) => props[k] != null && props[k] !== '')
          .map((k: string) => `<tr><td style="font-weight:600;padding:2px 8px 2px 0;color:#888;font-size:11px">${k}</td><td style="font-size:11px">${props[k]}</td></tr>`)
          .join('');
        if (rows) {
          const popup = new mapboxgl.Popup({ offset: 25, closeButton: false })
            .setHTML(`<table style="border-collapse:collapse">${rows}</table>`);
          marker.setPopup(popup);
        }
      }

      markers.push(marker);
    }
  }

  _activeMarkers[layer.id] = markers;
}

export function removeMarkerLayer(layerId: string): void {
  const markers = _activeMarkers[layerId];
  if (markers) {
    for (const m of markers) {
      try { m.remove(); } catch {}
    }
    delete _activeMarkers[layerId];
  }
}

export function setMarkerLayerVisibility(
  map: mapboxgl.Map,
  layerId: string,
  visible: boolean
): void {
  const markers = _activeMarkers[layerId];
  if (!markers) return;
  for (const m of markers) {
    const el = m.getElement();
    if (el) el.style.display = visible ? '' : 'none';
  }
}
