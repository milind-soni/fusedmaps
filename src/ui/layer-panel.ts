/**
 * Layer visibility toggle panel
 */

import type { LayerConfig, HexLayerConfig, VectorLayerConfig } from '../types';
import { getPaletteColors, toRgba } from '../color/palettes';

type VisibilityCallback = (layerId: string, visible: boolean) => void;

let visibilityCallback: VisibilityCallback | null = null;

/**
 * Setup the layer panel
 */
export function setupLayerPanel(
  layers: LayerConfig[],
  visibilityState: Record<string, boolean>,
  onVisibilityChange: VisibilityCallback
): void {
  visibilityCallback = onVisibilityChange;
  
  // Create panel container if it doesn't exist
  let panel = document.getElementById('layer-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'layer-panel';
    panel.innerHTML = `
      <h4>Layers</h4>
      <div id="layer-list"></div>
    `;
    document.body.appendChild(panel);
  }
  
  // Expose toggle function globally
  (window as any).toggleLayerVisibility = (layerId: string, visible: boolean) => {
    if (visibilityCallback) {
      visibilityCallback(layerId, visible);
    }
  };
  
  updateLayerPanel(layers, visibilityState);
}

/**
 * Update the layer panel UI
 */
export function updateLayerPanel(
  layers: LayerConfig[],
  visibilityState: Record<string, boolean>
): void {
  const list = document.getElementById('layer-list');
  if (!list) return;
  
  list.innerHTML = layers.map(layer => {
    const visible = visibilityState[layer.id] !== false;
    const colorPreview = getLayerColorPreview(layer);
    
    return `
      <div class="layer-item ${visible ? '' : 'disabled'}">
        <input type="checkbox" ${visible ? 'checked' : ''} 
               onchange="toggleLayerVisibility('${layer.id}', this.checked)" />
        <div class="layer-color" style="background:${colorPreview};"></div>
        <span class="layer-name">${layer.name}</span>
      </div>
    `;
  }).join('');
}

/**
 * Get a representative color for a layer (for the panel swatch)
 */
function getLayerColorPreview(layer: LayerConfig): string {
  let colorPreview = '#0090ff';
  
  if (layer.layerType === 'hex') {
    const hexLayer = layer as HexLayerConfig;
    const cfg = hexLayer.hexLayer || {};
    const colorCfg = (cfg.filled === false && cfg.getLineColor) 
      ? cfg.getLineColor 
      : cfg.getFillColor;
    
    if (Array.isArray(colorCfg)) {
      colorPreview = toRgba(colorCfg, 1) || colorPreview;
    } else if (colorCfg && typeof colorCfg === 'object') {
      const fn = (colorCfg as any)['@@function'];
      if (fn === 'colorContinuous' || fn === 'colorCategories') {
        const paletteName = (colorCfg as any).colors || (fn === 'colorCategories' ? 'Bold' : 'TealGrn');
        const cols = getPaletteColors(paletteName, (colorCfg as any).steps || 7);
        if (cols?.length) colorPreview = cols[Math.floor(cols.length / 2)];
      }
    }
  } else if (layer.layerType === 'vector') {
    const vecLayer = layer as VectorLayerConfig;
    if (vecLayer.lineColorRgba && !vecLayer.isFilled) {
      colorPreview = vecLayer.lineColorRgba;
    } else if (vecLayer.fillColorRgba) {
      colorPreview = vecLayer.fillColorRgba;
    } else if (vecLayer.fillColorConfig && typeof vecLayer.fillColorConfig === 'object') {
      const paletteName = (vecLayer.fillColorConfig as any).colors;
      if (paletteName) {
        const cols = getPaletteColors(paletteName, 7);
        if (cols?.length) colorPreview = cols[Math.floor(cols.length / 2)];
      }
    }
  }
  
  return colorPreview;
}

