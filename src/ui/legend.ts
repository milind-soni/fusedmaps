/**
 * Color legend component
 */

import type { LayerConfig, HexLayerConfig, VectorLayerConfig, ColorContinuousConfig, ColorCategoriesConfig } from '../types';
import { getPaletteColors, FALLBACK_CATEGORICAL_COLORS, FALLBACK_CONTINUOUS_COLORS } from '../color/palettes';
import { getUniqueCategories } from '../color/expressions';
import { getWidgetContainer } from './widget-container';

type WidgetPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

// Legend icon (horizontal bars representing a legend)
const LEGEND_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="5" width="4" height="3" rx="0.5"/><rect x="9" y="5" width="12" height="3" rx="0.5"/><rect x="3" y="10.5" width="4" height="3" rx="0.5"/><rect x="9" y="10.5" width="9" height="3" rx="0.5"/><rect x="3" y="16" width="4" height="3" rx="0.5"/><rect x="9" y="16" width="6" height="3" rx="0.5"/></svg>';
const CLOSE_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

/**
 * Check if a color config is an RGB accessor (e.g., "@@=[properties.r,properties.g,properties.b]")
 */
function isRgbAccessor(colorCfg: any): boolean {
  if (typeof colorCfg !== 'string') return false;
  if (!colorCfg.startsWith('@@=')) return false;
  const hasR = colorCfg.includes('properties.r') || colorCfg.includes('.r]') || colorCfg.includes('.r,');
  const hasG = colorCfg.includes('properties.g') || colorCfg.includes('.g]') || colorCfg.includes('.g,');
  const hasB = colorCfg.includes('properties.b') || colorCfg.includes('.b]') || colorCfg.includes('.b,');
  return hasR && hasG && hasB;
}

/**
 * Build RGB categorical legend by scanning tile data
 */
function buildRgbCategoryLegend(
  layerName: string,
  tileData: Map<string, any[]>,
  attr: string = 'taxsubgrp',
  maxCats: number = 40
): string {
  try {
    if (!tileData || tileData.size === 0) return '';

    const seen = new Map<string, number[]>(); // label -> [r,g,b]

    for (const rows of tileData.values()) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const props = row?.properties || row || {};
        const label = props[attr];
        if (label == null || label === '' || label === 'null') continue;
        const key = String(label);
        if (seen.has(key)) continue;

        const r = Number(props.r);
        const g = Number(props.g);
        const b = Number(props.b);
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

/**
 * Setup the legend container
 */
export function setupLegend(
  layers: LayerConfig[],
  visibilityState: Record<string, boolean>,
  geojsons: Record<string, GeoJSON.FeatureCollection>,
  position: WidgetPosition = 'bottom-right',
  tileData?: Map<string, any[]>,
  expanded: boolean = false
): void {
  // Get widget container for proper stacking
  const widgetContainer = getWidgetContainer(position);

  // Create legend container if it doesn't exist
  let legend = document.getElementById('color-legend');
  if (!legend) {
    legend = document.createElement('div');
    legend.id = 'color-legend';
    legend.className = expanded ? 'color-legend fm-dropdown-widget' : 'color-legend fm-dropdown-widget collapsed'; // Start expanded or collapsed based on config
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

    // Add toggle click handler
    const toggleBtn = document.getElementById('legend-toggle');
    toggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = legend?.classList.contains('collapsed');
      if (willOpen) {
        // Close other dropdowns (only one open at a time)
        document.querySelectorAll('.fm-dropdown-widget:not(#color-legend)').forEach(el => {
          el.classList.add('collapsed');
        });
      }
      legend?.classList.toggle('collapsed');
    });

    // Add close button handler
    const closeBtn = document.getElementById('legend-close');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      legend?.classList.add('collapsed');
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!legend?.contains(e.target as Node)) {
        legend?.classList.add('collapsed');
      }
    });
  }

  updateLegend(layers, visibilityState, geojsons, tileData);
}

/**
 * Update the legend based on visible layers
 */
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
    if (legendHtml) {
      html += legendHtml;
    }
  });

  if (html) {
    // Put content in legend-content div if it exists, otherwise fallback to legend
    if (legendContent) {
      legendContent.innerHTML = html;
    } else {
      legend.innerHTML = html;
    }
    legend.style.display = 'block';
  } else {
    legend.style.display = 'none';
  }
}

/**
 * Build custom legend HTML from user-provided config
 */
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

/**
 * Build legend HTML for a single layer
 */
function buildLayerLegend(
  layer: LayerConfig,
  geojsons: Record<string, GeoJSON.FeatureCollection>,
  tileData?: Map<string, any[]>
): string {
  // If layer has a custom legend definition, use it directly
  const custom = (layer as any).customLegend;
  if (custom) {
    return buildCustomLegend(layer.name, custom);
  }

  let colorCfg: any = null;

  if (layer.layerType === 'hex') {
    const hexLayer = layer as HexLayerConfig;
    const cfg: any = hexLayer.hexLayer || {};
    colorCfg = (cfg.filled === false && cfg.getLineColor)
      ? cfg.getLineColor
      : cfg.getFillColor;

    // Special case: RGB accessor for tile layers (e.g., soil type with @@=[properties.r,properties.g,properties.b])
    if ((hexLayer as any).isTileLayer && isRgbAccessor(colorCfg) && tileData && tileData.size > 0) {
      // Get legend attribute from config or default to first tooltip attr
      const legendAttr = cfg.legendAttr ||
        (Array.isArray(cfg.tooltipColumns) ? cfg.tooltipColumns[0] : null) ||
        (Array.isArray((hexLayer as any).tooltipColumns) ? (hexLayer as any).tooltipColumns[0] : null) ||
        'taxsubgrp';
      const maxCats = Number.isFinite(cfg.legendMaxCategories) ? cfg.legendMaxCategories : 40;
      return buildRgbCategoryLegend(layer.name, tileData, legendAttr, maxCats);
    }
  } else if (layer.layerType === 'vector' || layer.layerType === 'mvt' || layer.layerType === 'pmtiles') {
    const vecLayer = layer as VectorLayerConfig;

    // Check if fill is transparent/disabled - if so, prefer line color config
    const fillOpacity = (vecLayer as any).vectorLayer?.opacity ?? (vecLayer as any).style?.opacity ?? 1;
    const isFillTransparent = fillOpacity < 0.1 || (vecLayer as any).vectorLayer?.filled === false || (vecLayer as any).style?.filled === false;

    // Helper to check if a color config has a color function (old or new format)
    const hasColorFn = (cfg: any) => cfg?.['@@function'] || cfg?.type === 'continuous' || cfg?.type === 'categorical';

    // Check both legacy format (fillColorConfig) and new format (style.fillColor)
    const fillColorCfg = vecLayer.fillColorConfig || (vecLayer as any).style?.fillColor;
    const lineColorCfg = vecLayer.lineColorConfig || (vecLayer as any).style?.lineColor;

    if (isFillTransparent && hasColorFn(lineColorCfg)) {
      colorCfg = lineColorCfg;
    } else if (hasColorFn(fillColorCfg)) {
      colorCfg = fillColorCfg;
    } else if (hasColorFn(lineColorCfg)) {
      // Fallback to lineColor if fillColor has no color function
      colorCfg = lineColorCfg;
    }

    // Show simple line legend for stroke-only vector layers (no color function)
    if (!hasColorFn(colorCfg) && vecLayer.lineColorRgba && !vecLayer.isFilled) {
      return `
        <div class="legend-layer">
          <div class="legend-title">
            <span class="legend-line" style="background:${vecLayer.lineColorRgba};"></span>
            ${layer.name}
          </div>
        </div>
      `;
    }
  }

  // Only show legend for layers with explicit color functions
  // Support both old format (@@function) and new format (type)
  const fnType = colorCfg?.['@@function'] ||
    (colorCfg?.type === 'continuous' ? 'colorContinuous' :
     colorCfg?.type === 'categorical' ? 'colorCategories' : null);
  if (!fnType || !colorCfg?.attr) return '';
  if (fnType !== 'colorContinuous' && fnType !== 'colorCategories') return '';
  
  const paletteName = colorCfg.colors || colorCfg.palette || (fnType === 'colorCategories' ? 'Bold' : 'TealGrn');
  
  // Handle categorical legend
  if (fnType === 'colorCategories') {
    // Auto-detect categories if they weren't provided and haven't been detected yet.
    // This fixes cases where a categorical style exists but the rendering path didn't
    // populate `_detectedCategories` (e.g., some tile flows).
    try {
      const cc = colorCfg as any;
      const hasCats =
        Array.isArray(cc._detectedCategories) && cc._detectedCategories.length
          ? true
          : Array.isArray(cc.categories) && cc.categories.length
            ? true
            : false;
      if (!hasCats && cc.attr) {
        let rows: Array<Record<string, unknown>> = [];
        // Prefer cached GeoJSON for the layer (includes SQL hex outputs).
        const gj = geojsons?.[(layer as any).id];
        if (gj?.features?.length) {
          rows = gj.features.map((f: any) => (f?.properties || {}));
        } else if ((layer as any).layerType === 'hex') {
          rows = (((layer as any).data || []) as any[]);
        } else if ((layer as any).layerType === 'vector') {
          const vgj = (layer as any).geojson;
          if (vgj?.features?.length) rows = vgj.features.map((f: any) => (f?.properties || {}));
        }
        const pairs = getUniqueCategories(rows, cc.attr, cc.labelAttr);
        // cap for UI sanity
        cc._detectedCategories = pairs.slice(0, 50);
      }
    } catch (_) {}
    return buildCategoricalLegend(layer.name, colorCfg, paletteName);
  }
  
  // Handle continuous legend
  if (fnType === 'colorContinuous') {
    return buildContinuousLegend(layer.name, colorCfg, paletteName);
  }
  
  return '';
}

/**
 * Build categorical legend HTML
 */
function buildCategoricalLegend(
  layerName: string,
  colorCfg: ColorCategoriesConfig,
  paletteName: string
): string {
  // Use detected categories or provided ones
  let catPairs = colorCfg._detectedCategories || colorCfg.categories || [];
  catPairs = catPairs.map((c: any) => 
    typeof c === 'object' && c.label ? c : { value: c, label: c }
  );
  
  if (!catPairs.length) return '';
  
  let colors = getPaletteColors(paletteName, Math.max(catPairs.length, 3));
  if (!colors?.length) {
    colors = FALLBACK_CATEGORICAL_COLORS;
  }
  
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

/**
 * Build continuous legend HTML
 */
function buildContinuousLegend(
  layerName: string,
  colorCfg: ColorContinuousConfig,
  paletteName: string
): string {
  // Prefer dynamic domain (autoDomain) when present
  const domain: any = (colorCfg as any)._dynamicDomain || colorCfg.domain;
  if (!domain?.length) return '';
  
  const [d0, d1] = domain;
  const isReversed = d0 > d1;
  const steps = colorCfg.steps || 7;
  
  let colors = getPaletteColors(paletteName, steps);
  if (!colors?.length) {
    colors = FALLBACK_CONTINUOUS_COLORS;
  }
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

