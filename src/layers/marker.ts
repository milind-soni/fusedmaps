/**
 * Marker layer — round colored circles with Lucide icon support.
 *
 * Icon sources (in priority order):
 *   1. "icon": "truck"  — fetches from Lucide CDN (https://lucide.dev/icons)
 *   2. "iconSvg": "<path d='...'/>"  — inline SVG markup
 *   3. "iconUrl": "https://..."  — external image URL
 *   4. (none) — plain colored circle
 */

import type { MarkerLayerConfig } from '../types';

const FALLBACK_COLORS = [
  '#E8A735', '#4CAF50', '#2196F3', '#FF5722', '#9C27B0',
  '#00BCD4', '#FF9800', '#795548', '#607D8B', '#E91E63',
];

const LUCIDE_CDN = 'https://cdn.jsdelivr.net/npm/lucide-static@latest/icons';

const _activeMarkers: Record<string, mapboxgl.Marker[]> = {};

// Cache fetched Lucide SVG content
const _iconCache: Record<string, string> = {};

async function fetchLucideIcon(name: string): Promise<string> {
  if (_iconCache[name]) return _iconCache[name];
  try {
    const res = await fetch(`${LUCIDE_CDN}/${name}.svg`);
    if (!res.ok) return '';
    const text = await res.text();
    // Extract inner paths from the SVG (strip outer <svg> tag)
    const inner = text.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '').replace(/<!--[^]*?-->/g, '').trim();
    _iconCache[name] = inner;
    return inner;
  } catch {
    return '';
  }
}

function circleMarkerHtml(
  fill: string,
  diameter: number,
  iconContent?: string,
  iconUrl?: string,
): string {
  const r = diameter / 2;

  let inner: string;
  if (iconUrl) {
    inner = `<img src="${iconUrl}" style="width:${r}px;height:${r}px;object-fit:contain;filter:brightness(0) invert(1);" alt=""/>`;
  } else if (iconContent) {
    const iconSize = Math.round(diameter * 0.5);
    inner = `<svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24"
      fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      ${iconContent}
    </svg>`;
  } else {
    inner = '';
  }

  return `<div style="
    width:${diameter}px;height:${diameter}px;border-radius:50%;
    background:${fill};
    display:flex;align-items:center;justify-content:center;
    cursor:pointer;
    box-shadow:0 2px 6px rgba(0,0,0,0.3);
    border:2px solid rgba(255,255,255,0.9);
  ">${inner}</div>`;
}

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
  const size = mc.size || 36;

  // Build color + icon maps
  const colorMap: Record<string, string> = {};
  const iconContentMap: Record<string, string> = {};
  const iconUrlMap: Record<string, string> = {};

  if (attr && mc.icons) {
    // Pre-fetch all Lucide icons in parallel
    const fetchJobs: Promise<void>[] = [];
    for (const [key, val] of Object.entries(mc.icons)) {
      colorMap[key] = val.color;
      if ((val as any).iconUrl) {
        iconUrlMap[key] = (val as any).iconUrl;
      } else if ((val as any).iconSvg) {
        iconContentMap[key] = (val as any).iconSvg;
      } else if ((val as any).icon) {
        const iconName = (val as any).icon;
        fetchJobs.push(
          fetchLucideIcon(iconName).then(content => {
            if (content) iconContentMap[key] = content;
          })
        );
      }
    }
    if (fetchJobs.length) await Promise.all(fetchJobs);
  }

  // Auto-assign colors for unmapped values
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
      const iconContent = attr ? iconContentMap[val] : undefined;
      const iconUrl = attr ? iconUrlMap[val] : undefined;

      const el = document.createElement('div');
      el.innerHTML = circleMarkerHtml(color, size, iconContent, iconUrl);
      el.style.display = visible ? '' : 'none';

      const marker = new mbgl.Marker({ element: el, anchor: 'center' })
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
          const popup = new mbgl.Popup({ offset: 20, closeButton: false })
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
