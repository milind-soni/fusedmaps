/**
 * Color legend component
 */

import type { LayerConfig, HexLayerConfig, VectorLayerConfig, ColorContinuousConfig, ColorCategoriesConfig } from '../types';
import { getPaletteColors, FALLBACK_CATEGORICAL_COLORS, FALLBACK_CONTINUOUS_COLORS } from '../color/palettes';
import { getUniqueCategories } from '../color/expressions';

type WidgetPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * Setup the legend container
 */
export function setupLegend(
  layers: LayerConfig[],
  visibilityState: Record<string, boolean>,
  geojsons: Record<string, GeoJSON.FeatureCollection>,
  position: WidgetPosition = 'bottom-right'
): void {
  // Create legend container if it doesn't exist
  let legend = document.getElementById('color-legend');
  if (!legend) {
    legend = document.createElement('div');
    legend.id = 'color-legend';
    legend.className = 'color-legend';
    legend.style.display = 'none';
    document.body.appendChild(legend);
  }

  // Apply position styles
  const posStyles: Record<WidgetPosition, { top?: string; bottom?: string; left?: string; right?: string }> = {
    'top-left': { top: '12px', left: '12px', right: 'auto', bottom: 'auto' },
    'top-right': { top: '12px', right: '12px', left: 'auto', bottom: 'auto' },
    'bottom-left': { bottom: '12px', left: '12px', right: 'auto', top: 'auto' },
    'bottom-right': { bottom: '12px', right: '12px', left: 'auto', top: 'auto' },
  };
  const styles = posStyles[position];
  if (styles) {
    Object.assign(legend.style, styles);
  }

  updateLegend(layers, visibilityState, geojsons);
}

/**
 * Update the legend based on visible layers
 */
export function updateLegend(
  layers: LayerConfig[],
  visibilityState: Record<string, boolean>,
  geojsons: Record<string, GeoJSON.FeatureCollection>
): void {
  const legend = document.getElementById('color-legend');
  if (!legend) return;
  
  const visibleLayers = layers.filter(l => visibilityState[l.id] !== false);
  if (!visibleLayers.length) {
    legend.style.display = 'none';
    return;
  }
  
  let html = '';
  
  visibleLayers.forEach(layer => {
    const legendHtml = buildLayerLegend(layer, geojsons);
    if (legendHtml) {
      html += legendHtml;
    }
  });
  
  if (html) {
    legend.innerHTML = html;
    legend.style.display = 'block';
  } else {
    legend.style.display = 'none';
  }
}

/**
 * Build legend HTML for a single layer
 */
function buildLayerLegend(
  layer: LayerConfig,
  geojsons: Record<string, GeoJSON.FeatureCollection>
): string {
  let colorCfg: any = null;
  
  if (layer.layerType === 'hex') {
    const hexLayer = layer as HexLayerConfig;
    const cfg = hexLayer.hexLayer || {};
    colorCfg = (cfg.filled === false && cfg.getLineColor) 
      ? cfg.getLineColor 
      : cfg.getFillColor;
  } else if (layer.layerType === 'vector') {
    const vecLayer = layer as VectorLayerConfig;
    colorCfg = vecLayer.fillColorConfig;
    
    // Show simple line legend for stroke-only vector layers
    if (!colorCfg?.['@@function'] && vecLayer.lineColorRgba && !vecLayer.isFilled) {
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
  const fnType = colorCfg?.['@@function'];
  if (!fnType || !colorCfg?.attr) return '';
  if (fnType !== 'colorContinuous' && fnType !== 'colorCategories') return '';
  
  const paletteName = colorCfg.colors || (fnType === 'colorCategories' ? 'Bold' : 'TealGrn');
  
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
  
  const titleAttr = colorCfg.labelAttr || colorCfg.attr;
  
  return `
    <div class="legend-layer">
      <div class="legend-title">
        <span class="legend-dot" style="background:${colors[0]};"></span>
        ${layerName}: ${titleAttr}
      </div>
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
  
  const dotColor = colors[Math.floor(colors.length / 2)];
  
  return `
    <div class="legend-layer">
      <div class="legend-title">
        <span class="legend-dot" style="background:${dotColor};"></span>
        ${layerName}: ${colorCfg.attr}
      </div>
      <div class="legend-gradient" style="background:${gradient};"></div>
      <div class="legend-labels">
        <span>${d0.toFixed(1)}</span>
        <span>${d1.toFixed(1)}</span>
      </div>
    </div>
  `;
}

