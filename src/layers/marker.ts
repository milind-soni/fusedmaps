/**
 * Marker layer rendering — uses mapboxgl.Marker with custom HTML pin elements.
 * Supports built-in icons, custom SVG, and image URLs.
 */

import type { MarkerLayerConfig } from '../types';

const FALLBACK_COLORS = [
  '#E8A735', '#4CAF50', '#2196F3', '#FF5722', '#9C27B0',
  '#00BCD4', '#FF9800', '#795548', '#607D8B', '#E91E63',
];

// Built-in white icon paths (24x24 viewBox, rendered at center of pin)
const BUILTIN_ICONS: Record<string, string> = {
  corn: `<path fill="white" d="M12 2c-1.5 0-3 1.5-3 5s1 6 1.5 8h3c.5-2 1.5-4 1.5-8s-1.5-5-3-5zm-1 3.5a.5.5 0 011 0v1a.5.5 0 01-1 0v-1zm0 3a.5.5 0 011 0v1a.5.5 0 01-1 0v-1zm-1.5-1.5a.5.5 0 01.5-.5h.5a.5.5 0 010 1H10a.5.5 0 01-.5-.5zm3 0a.5.5 0 01.5-.5h.5a.5.5 0 010 1H14a.5.5 0 01-.5-.5zM10 16c-.3 1.3-.5 2.5-.5 3.5 0 1.5.5 2.5 2.5 2.5s2.5-1 2.5-2.5c0-1-.2-2.2-.5-3.5h-4z"/>`,

  leaf: `<path fill="white" d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66S8 16 17 8zm-6.18 7.66c-1.72 1.82-3.32 4.06-4.32 6.34l1.89.66c.84-1.88 2.14-3.86 3.73-5.6l-1.3-1.4z"/>`,

  soybean: `<path fill="white" d="M12 3C7.03 3 3 7.03 3 12c0 2.76 1.24 5.23 3.19 6.89l.71-.71C5.12 16.74 4 14.5 4 12c0-4.41 3.59-8 8-8 2.5 0 4.74 1.12 6.18 2.9l.71-.71C17.23 4.24 14.76 3 12 3zm0 4a5 5 0 100 10 5 5 0 000-10zm0 2a3 3 0 110 6 3 3 0 010-6z"/>`,

  wheat: `<path fill="white" d="M12 1.5l-2 4h4l-2-4zm-3 5l-1.5 3H9l1-2 1 2h1.5l-1.5-3h-2zm6 0l-1.5 3H15l1-2 1 2h1.5l-1.5-3h-2zm-3 4l-2 4h4l-2-4zm0 5.5V22h1v-6h-1z"/>`,

  circle: '',
  pin: '',
};

const _activeMarkers: Record<string, mapboxgl.Marker[]> = {};

/**
 * Build a pin marker SVG. If iconPath is provided, it replaces the white dot
 * with the icon rendered inside a white circle background.
 */
function pinHtml(fill: string, size: number, iconPath?: string, iconUrl?: string): string {
  const w = Math.round(32 * size);
  const h = Math.round(40 * size);

  let inner: string;
  if (iconUrl) {
    inner = `<circle cx="16" cy="14" r="7" fill="white"/>
      <image href="${iconUrl}" x="9" y="7" width="14" height="14" clip-path="circle(7px at 7px 7px)"/>`;
  } else if (iconPath) {
    inner = `<circle cx="16" cy="14" r="7" fill="white"/>
      <g transform="translate(9.5,7.5) scale(0.55)">${iconPath}</g>`;
  } else {
    inner = `<circle cx="16" cy="14" r="5.5" fill="white" opacity="0.9"/>`;
  }

  return `<div style="width:${w}px;height:${h}px;cursor:pointer;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.3))">
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 32 40">
      <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 24 16 24s16-12 16-24C32 7.16 24.84 0 16 0z"
            fill="${fill}"/>
      ${inner}
    </svg>
  </div>`;
}

function resolveIcon(cfg?: { icon?: string; iconSvg?: string; iconUrl?: string }): { path?: string; url?: string } {
  if (!cfg) return {};
  if (cfg.iconSvg) return { path: cfg.iconSvg };
  if (cfg.icon) {
    const builtin = BUILTIN_ICONS[cfg.icon.toLowerCase()];
    if (builtin) return { path: builtin };
  }
  if (cfg.iconUrl) return { url: cfg.iconUrl };
  return {};
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

  const colorMap: Record<string, string> = {};
  const iconCfgMap: Record<string, { path?: string; url?: string }> = {};
  if (attr && mc.icons) {
    for (const [key, val] of Object.entries(mc.icons)) {
      colorMap[key] = val.color;
      iconCfgMap[key] = resolveIcon(val as any);
    }
  }
  if (attr) {
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
  const mbgl = (window as any).mapboxgl;

  for (const feature of geojson.features) {
    const geom = feature.geometry;
    if (!geom || (geom.type !== 'Point' && geom.type !== 'MultiPoint')) continue;

    const coords = geom.type === 'Point'
      ? [geom.coordinates as [number, number]]
      : (geom.coordinates as [number, number][]);

    for (const coord of coords) {
      const val = attr ? String(feature.properties?.[attr] ?? '') : '';
      const color = attr ? (colorMap[val] || defaultColor) : defaultColor;
      const iconCfg = attr ? (iconCfgMap[val] || {}) : {};

      const el = document.createElement('div');
      el.innerHTML = pinHtml(color, size, iconCfg.path, iconCfg.url);
      el.style.display = visible ? '' : 'none';

      const marker = new mbgl.Marker({ element: el, anchor: 'bottom' })
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
          const popup = new mbgl.Popup({ offset: 25, closeButton: false })
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
