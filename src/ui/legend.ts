/**
 * Color legend component
 */

import type { LayerConfig, HexLayerConfig, VectorLayerConfig, ColorContinuousConfig, ColorCategoriesConfig } from '../types';
import { getPaletteColors, FALLBACK_CATEGORICAL_COLORS, FALLBACK_CONTINUOUS_COLORS } from '../color/palettes';
import { getUniqueCategories } from '../color/expressions';
import { getWidgetContainer } from './widget-container';

type WidgetPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const LEGEND_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="5" width="4" height="3" rx="0.5"/><rect x="9" y="5" width="12" height="3" rx="0.5"/><rect x="3" y="10.5" width="4" height="3" rx="0.5"/><rect x="9" y="10.5" width="9" height="3" rx="0.5"/><rect x="3" y="16" width="4" height="3" rx="0.5"/><rect x="9" y="16" width="6" height="3" rx="0.5"/></svg>';
const CLOSE_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

function _detectGeometryKind(layer: LayerConfig): 'point' | 'line' | 'polygon' | 'unknown' {
  const gj = (layer as any).geojson;
  if (gj?.features?.length) {
    const t = gj.features[0]?.geometry?.type || '';
    if (t === 'Point' || t === 'MultiPoint') return 'point';
    if (t === 'LineString' || t === 'MultiLineString') return 'line';
    if (t === 'Polygon' || t === 'MultiPolygon') return 'polygon';
  }
  const style: any = (layer as any).style || {};
  if (style.pointRadiusMinPixels || style.pointRadius) return 'point';
  return 'unknown';
}

function isRgbAccessor(colorCfg: any): boolean {
  if (typeof colorCfg !== 'string') return false;
  if (!colorCfg.startsWith('@@=')) return false;
  const hasR = colorCfg.includes('properties.r') || colorCfg.includes('.r]') || colorCfg.includes('.r,');
  const hasG = colorCfg.includes('properties.g') || colorCfg.includes('.g]') || colorCfg.includes('.g,');
  const hasB = colorCfg.includes('properties.b') || colorCfg.includes('.b]') || colorCfg.includes('.b,');
  return hasR && hasG && hasB;
}

function buildRgbCategoryLegend(
  layerName: string,
  tileData: Map<string, any[]>,
  attr: string = 'taxsubgrp',
  maxCats: number = 40
): string {
  try {
    if (!tileData || tileData.size === 0) return '';
    const seen = new Map<string, number[]>();
    for (const rows of tileData.values()) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const props = row?.properties || row || {};
        const label = props[attr];
        if (label == null || label === '' || label === 'null') continue;
        const key = String(label);
        if (seen.has(key)) continue;
        const r = Number(props.r), g = Number(props.g), b = Number(props.b);
        if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) continue;
        const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
        seen.set(key, [clamp(r), clamp(g), clamp(b)]);
        if (seen.size >= maxCats) break;
      }
      if (seen.size >= maxCats) break;
    }
    if (seen.size === 0) return '';
    const labels = [...seen.keys()].sort((a, b) => a.localeCompare(b));
    const cats = labels.map(lbl => ({ label: lbl, rgb: seen.get(lbl)! }));
    return `
      <div class="legend-layer">
        <div class="legend-title">${layerName}</div>
        <div class="legend-categories">
          ${cats.map(c => `
            <div class="legend-cat-item">
              <div class="legend-cat-swatch" style="background:rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]});"></div>
              <span class="legend-cat-label" title="${c.label}">${c.label}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (_) {
    return '';
  }
}

export function setupLegend(
  layers: LayerConfig[],
  visibilityState: Record<string, boolean>,
  geojsons: Record<string, GeoJSON.FeatureCollection>,
  position: WidgetPosition = 'bottom-right',
  tileData?: Map<string, any[]>,
  expanded: boolean = false
): void {
  const widgetContainer = getWidgetContainer(position);
  let legend = document.getElementById('color-legend');
  if (!legend) {
    legend = document.createElement('div');
    legend.id = 'color-legend';
    legend.className = expanded ? 'color-legend fm-dropdown-widget' : 'color-legend fm-dropdown-widget collapsed';
    legend.style.display = 'none';
    legend.innerHTML = `
      <button id="legend-toggle" class="fm-dropdown-toggle" title="Legend">
        ${LEGEND_ICON_SVG}
      </button>
      <div class="fm-dropdown-panel" id="legend-dropdown">
        <div class="fm-dropdown-header">
          <span class="fm-dropdown-header-icon">${LEGEND_ICON_SVG}</span>
          <span class="fm-dropdown-title">Legend</span>
          <button class="fm-dropdown-close" id="legend-close" title="Close">${CLOSE_ICON_SVG}</button>
        </div>
        <div id="legend-content"></div>
      </div>
    `;
    widgetContainer.appendChild(legend);
    const toggleBtn = document.getElementById('legend-toggle');
    toggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = legend?.classList.contains('collapsed');
      if (willOpen) {
        document.querySelectorAll('.fm-dropdown-widget:not(#color-legend)').forEach(el => {
          el.classList.add('collapsed');
        });
      }
      legend?.classList.toggle('collapsed');
    });
    const closeBtn = document.getElementById('legend-close');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      legend?.classList.add('collapsed');
    });
    document.addEventListener('click', (e) => {
      if (!legend?.contains(e.target as Node)) {
        legend?.classList.add('collapsed');
      }
    });
  }
  updateLegend(layers, visibilityState, geojsons, tileData);
}

export function updateLegend(
  layers: LayerConfig[],
  visibilityState: Record<string, boolean>,
  geojsons: Record<string, GeoJSON.FeatureCollection>,
  tileData?: Map<string, any[]>
): void {
  const legend = document.getElementById('color-legend');
  const legendContent = document.getElementById('legend-content');
  if (!legend) return;

  const visibleLayers = layers.filter(l => visibilityState[l.id] !== false);
  if (!visibleLayers.length) {
    legend.style.display = 'none';
    return;
  }

  let html = '';
  visibleLayers.forEach(layer => {
    const legendHtml = buildLayerLegend(layer, geojsons, tileData);
    if (legendHtml) html += legendHtml;
  });

  if (html) {
    if (legendContent) legendContent.innerHTML = html;
    else legend.innerHTML = html;
    legend.style.display = 'block';
  } else {
    legend.style.display = 'none';
  }
}

function buildCustomLegend(layerName: string, cfg: any): string {
  const title = cfg.title || layerName;
  if (cfg.type === 'categorical' && Array.isArray(cfg.items) && cfg.items.length) {
    return `
      <div class="legend-layer">
        <div class="legend-title">${title}</div>
        <div class="legend-categories">
          ${cfg.items.map((item: any) => {
            const color = Array.isArray(item.color)
              ? (item.color.length >= 4
                ? `rgba(${item.color[0]},${item.color[1]},${item.color[2]},${item.color[3] / 255})`
                : `rgb(${item.color[0]},${item.color[1]},${item.color[2]})`)
              : (item.color || '#888');
            return `
              <div class="legend-cat-item">
                <div class="legend-cat-swatch" style="background:${color};"></div>
                <span class="legend-cat-label" title="${item.label}">${item.label}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }
  if (cfg.type === 'continuous') {
    const domain = cfg.domain || [0, 1];
    const [d0, d1] = domain;
    const steps = cfg.steps || 7;
    const paletteName = cfg.palette || cfg.colors || 'TealGrn';
    let colors = getPaletteColors(paletteName, steps);
    if (!colors?.length) colors = FALLBACK_CONTINUOUS_COLORS;
    if (cfg.reverse) colors = [...colors].reverse();
    const gradient = `linear-gradient(to right, ${colors.map((c, i) =>
      `${c} ${i / (colors!.length - 1) * 100}%`
    ).join(', ')})`;
    return `
      <div class="legend-layer">
        <div class="legend-title">${title}</div>
        <div class="legend-gradient" style="background:${gradient};"></div>
        <div class="legend-labels">
          <span>${Number(d0).toFixed(1)}</span>
          <span>${Number(d1).toFixed(1)}</span>
        </div>
      </div>
    `;
  }
  return '';
}

function buildLayerLegend(
  layer: LayerConfig,
  geojsons: Record<string, GeoJSON.FeatureCollection>,
  tileData?: Map<string, any[]>
): string {
  const custom = (layer as any).customLegend;
  if (custom === false) return '';
  if (custom && typeof custom === 'object') {
    return buildCustomLegend(layer.name, custom);
  }

  let colorCfg: any = null;

  if (layer.layerType === 'hex') {
    const hexLayer = layer as HexLayerConfig;
    const style = hexLayer.style || {};
    colorCfg = (style.filled === false && style.lineColor)
      ? style.lineColor
      : style.fillColor;

    // RGB accessor for tile layers
    if (hexLayer.isTileLayer && isRgbAccessor(colorCfg) && tileData && tileData.size > 0) {
      const legendAttr = (Array.isArray(hexLayer.tooltip) ? hexLayer.tooltip[0] : null) || 'taxsubgrp';
      return buildRgbCategoryLegend(layer.name, tileData, legendAttr, 40);
    }
  } else if (layer.layerType === 'vector' || layer.layerType === 'mvt' || layer.layerType === 'pmtiles') {
    const style = (layer as any).style || {};

    const fillOpacity = style.opacity ?? 1;
    const isFillTransparent = fillOpacity < 0.1 || style.filled === false;

    const hasColorFn = (cfg: any) => {
      if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return false;
      if (cfg.type === 'continuous' || cfg.type === 'categorical') return true;
      if (cfg.attr && (cfg.domain || cfg.colors || cfg.categories)) return true;
      return false;
    };

    if (isFillTransparent && hasColorFn(style.lineColor)) {
      colorCfg = style.lineColor;
    } else if (hasColorFn(style.fillColor)) {
      colorCfg = style.fillColor;
    } else if (hasColorFn(style.lineColor)) {
      colorCfg = style.lineColor;
    }

    // Simple line legend for stroke-only layers
    if (!hasColorFn(colorCfg) && style.lineColor && typeof style.lineColor === 'string' && style.filled === false) {
      return `
        <div class="legend-layer">
          <div class="legend-title">
            <span class="legend-line" style="background:${style.lineColor};"></span>
            ${layer.name}
          </div>
        </div>
      `;
    }
  }

  let fnType = colorCfg?.type;
  if (!colorCfg?.attr) {
    // Static color — show a simple swatch with the layer name
    const style: any = (layer as any).style || {};
    const staticFill = style.fillColor;
    const staticLine = style.lineColor;
    const color = Array.isArray(staticFill) ? staticFill : Array.isArray(staticLine) ? staticLine : null;
    if (color) {
      const rgba = `rgba(${color[0]},${color[1]},${color[2]},${color.length > 3 ? color[3] / 255 : 1})`;
      const isPoint = _detectGeometryKind(layer) === 'point';
      const shape = isPoint
        ? `<span class="legend-static-swatch" style="background:${rgba};border-radius:50%;"></span>`
        : `<span class="legend-static-swatch" style="background:${rgba};border-radius:2px;"></span>`;
      return `<div class="legend-layer"><div class="legend-title">${shape}${layer.name}</div></div>`;
    }
    return '';
  }
  // Infer type when not explicitly set
  if (!fnType) {
    if (colorCfg.categories) fnType = 'categorical';
    else if (colorCfg.domain || colorCfg.colors) fnType = 'continuous';
  }
  if (fnType !== 'continuous' && fnType !== 'categorical') return '';
  
  const paletteName = colorCfg.palette || colorCfg.colors || (fnType === 'categorical' ? 'Bold' : 'TealGrn');
  
  if (fnType === 'categorical') {
    try {
      const cc = colorCfg as any;
      const hasCats =
        (Array.isArray(cc._detectedCategories) && cc._detectedCategories.length) ||
        (Array.isArray(cc.categories) && cc.categories.length);
      if (!hasCats && cc.attr) {
        let rows: Array<Record<string, unknown>> = [];
        const gj = geojsons?.[(layer as any).id];
        if (gj?.features?.length) {
          rows = gj.features.map((f: any) => (f?.properties || {}));
        } else if (layer.layerType === 'hex') {
          rows = (((layer as any).data || []) as any[]);
        } else if (layer.layerType === 'vector') {
          const vgj = (layer as any).geojson;
          if (vgj?.features?.length) rows = vgj.features.map((f: any) => (f?.properties || {}));
        }
        const pairs = getUniqueCategories(rows, cc.attr, cc.labelAttr);
        cc._detectedCategories = pairs.slice(0, 50);
      }
    } catch (_) {}
    return buildCategoricalLegend(layer.name, colorCfg, paletteName);
  }
  
  if (fnType === 'continuous') {
    return buildContinuousLegend(layer.name, colorCfg, paletteName);
  }
  
  return '';
}

function buildCategoricalLegend(
  layerName: string,
  colorCfg: ColorCategoriesConfig,
  paletteName: string
): string {
  let catPairs = (colorCfg as any)._detectedCategories || colorCfg.categories || [];
  catPairs = catPairs.map((c: any) => 
    typeof c === 'object' && c.label ? c : { value: c, label: c }
  );
  if (!catPairs.length) return '';
  
  let colors = getPaletteColors(paletteName, Math.max(catPairs.length, 3));
  if (!colors?.length) colors = FALLBACK_CATEGORICAL_COLORS;
  
  return `
    <div class="legend-layer">
      <div class="legend-title">${layerName}</div>
      <div class="legend-categories">
        ${catPairs.map((cat: any, i: number) => `
          <div class="legend-cat-item">
            <div class="legend-cat-swatch" style="background:${colors![i % colors!.length]};"></div>
            <span class="legend-cat-label" title="${cat.label}">${cat.label}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function buildContinuousLegend(
  layerName: string,
  colorCfg: ColorContinuousConfig,
  paletteName: string
): string {
  const domain: any = (colorCfg as any)._dynamicDomain || colorCfg.domain;
  if (!domain?.length) return '';
  
  const [d0, d1] = domain;
  const isReversed = d0 > d1;
  const steps = colorCfg.steps || 7;
  
  let colors = getPaletteColors(paletteName, steps);
  if (!colors?.length) colors = FALLBACK_CONTINUOUS_COLORS;
  if (isReversed) colors = [...colors].reverse();
  
  const gradient = `linear-gradient(to right, ${colors.map((c, i) => 
    `${c} ${i / (colors!.length - 1) * 100}%`
  ).join(', ')})`;
  
  return `
    <div class="legend-layer">
      <div class="legend-title">${layerName}</div>
      <div class="legend-gradient" style="background:${gradient};"></div>
      <div class="legend-labels">
        <span>${d0.toFixed(1)}</span>
        <span>${d1.toFixed(1)}</span>
      </div>
    </div>
  `;
}
