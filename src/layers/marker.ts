/**
 * Marker layer rendering — uses mapboxgl.Marker with custom HTML pin elements.
 * Supports built-in icons (corn, leaf, wheat, etc.) and custom inline SVG.
 */

import type { MarkerLayerConfig } from '../types';

const FALLBACK_COLORS = [
  '#E8A735', '#4CAF50', '#2196F3', '#FF5722', '#9C27B0',
  '#00BCD4', '#FF9800', '#795548', '#607D8B', '#E91E63',
];

// Built-in icons — white SVG paths centered at (14, 13) inside 28x36 pin
const BUILTIN_ICONS: Record<string, string> = {
  corn: `<g transform="translate(14,13)" fill="white" stroke="white" stroke-width="0.3">
    <ellipse rx="4" ry="6.5" fill="#fff" opacity="0.9"/>
    <line x1="-3" y1="-2" x2="3" y2="-2" stroke="#D4911E" stroke-width="1" opacity="0.7"/>
    <line x1="-3.2" y1="0.5" x2="3.2" y2="0.5" stroke="#D4911E" stroke-width="1" opacity="0.7"/>
    <line x1="-3" y1="3" x2="3" y2="3" stroke="#D4911E" stroke-width="1" opacity="0.7"/>
    <path d="M0-6.5Q-3-3 0-2" fill="none" stroke="#5a8a32" stroke-width="1.2"/>
    <path d="M0-6.5Q3-3 0-2" fill="none" stroke="#5a8a32" stroke-width="1.2"/>
  </g>`,

  leaf: `<g transform="translate(14,13)">
    <path d="M0-7C-5-2-5 4 0 7 5 4 5-2 0-7z" fill="white" opacity="0.9"/>
    <line x1="0" y1="-5" x2="0" y2="6" stroke="#4a8c3f" stroke-width="0.8" opacity="0.6"/>
    <path d="M0-2Q-3 0 0 1" fill="none" stroke="#4a8c3f" stroke-width="0.6" opacity="0.5"/>
    <path d="M0-2Q3 0 0 1" fill="none" stroke="#4a8c3f" stroke-width="0.6" opacity="0.5"/>
    <path d="M0 1Q-3 3 0 4" fill="none" stroke="#4a8c3f" stroke-width="0.6" opacity="0.5"/>
    <path d="M0 1Q3 3 0 4" fill="none" stroke="#4a8c3f" stroke-width="0.6" opacity="0.5"/>
  </g>`,

  soybean: `<g transform="translate(14,13)">
    <path d="M0-7C-5-2-5 4 0 7 5 4 5-2 0-7z" fill="white" opacity="0.9"/>
    <line x1="0" y1="-5" x2="0" y2="6" stroke="#4a8c3f" stroke-width="0.8" opacity="0.6"/>
    <path d="M0-2Q-3 0 0 1" fill="none" stroke="#4a8c3f" stroke-width="0.6" opacity="0.5"/>
    <path d="M0-2Q3 0 0 1" fill="none" stroke="#4a8c3f" stroke-width="0.6" opacity="0.5"/>
  </g>`,

  wheat: `<g transform="translate(14,13)" fill="white">
    <ellipse cx="0" cy="-3" rx="2" ry="3.5" opacity="0.9"/>
    <ellipse cx="-2.5" cy="-1" rx="1.8" ry="3" transform="rotate(-20,-2.5,-1)" opacity="0.8"/>
    <ellipse cx="2.5" cy="-1" rx="1.8" ry="3" transform="rotate(20,2.5,-1)" opacity="0.8"/>
    <line x1="0" y1="1" x2="0" y2="7" stroke="white" stroke-width="1.2" opacity="0.9"/>
  </g>`,

  circle: `<circle cx="14" cy="13" r="5" fill="white" opacity="0.9"/>`,

  pin: `<circle cx="14" cy="13" r="5" fill="white" opacity="0.9"/>`,
};

// Store active markers per layer for cleanup and visibility toggling
const _activeMarkers: Record<string, mapboxgl.Marker[]> = {};

function pinHtml(fill: string, size: number, iconContent?: string): string {
  const w = Math.round(28 * size);
  const h = Math.round(36 * size);
  const inner = iconContent || '<circle cx="14" cy="13" r="5" fill="white" opacity="0.9"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 28 36" style="display:block;cursor:pointer;">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z"
          fill="${fill}" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>
    ${inner}
  </svg>`;
}

function resolveIcon(iconCfg?: { icon?: string; iconSvg?: string; iconUrl?: string }): string | undefined {
  if (!iconCfg) return undefined;
  if (iconCfg.iconSvg) return iconCfg.iconSvg;
  if (iconCfg.icon && BUILTIN_ICONS[iconCfg.icon]) return BUILTIN_ICONS[iconCfg.icon];
  if (iconCfg.iconUrl) {
    return `<image href="${iconCfg.iconUrl}" x="7" y="6" width="14" height="14" style="border-radius:50%"/>`;
  }
  return undefined;
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

  // Build color + icon maps
  const colorMap: Record<string, string> = {};
  const iconMap: Record<string, string | undefined> = {};
  if (attr) {
    if (mc.icons) {
      for (const [key, val] of Object.entries(mc.icons)) {
        colorMap[key] = val.color;
        iconMap[key] = resolveIcon(val as any);
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
      const icon = attr ? iconMap[val] : undefined;

      const el = document.createElement('div');
      el.innerHTML = pinHtml(color, size, icon);
      el.style.display = visible ? '' : 'none';

      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(coord)
        .addTo(map);

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
