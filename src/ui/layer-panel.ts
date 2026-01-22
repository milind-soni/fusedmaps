/**
 * Layer visibility toggle panel
 * Matching the original map_utils.py design with eye icons and gradient strips
 * 
 * Now integrates with LayerStore for centralized state management.
 */

import type { LayerConfig, HexLayerConfig, VectorLayerConfig, PMTilesLayerConfig, WidgetPosition } from '../types';
import { isLeftPosition } from '../types';
import { getPaletteColors, toRgba } from '../color/palettes';
import type { LayerStore } from '../state';
import { getWidgetContainer } from './widget-container';

type VisibilityCallback = (layerId: string, visible: boolean) => void;

let visibilityCallback: VisibilityCallback | null = null;
let unsubscribeStore: (() => void) | null = null;
let installedListeners = false;
let clickHandlerInstalled = false;
let activeStore: LayerStore | null = null;
let activeVisibilityState: Record<string, boolean> = {};
let panelEl: HTMLElement | null = null;

function getCurrentVisible(layerId: string): boolean {
  if (activeStore) return activeStore.get(layerId)?.visible !== false;
  return activeVisibilityState[layerId] !== false;
}

function handlePanelClick(e: MouseEvent): void {
  const target = e.target as HTMLElement | null;
  if (!target) return;

  // Handle group header click (expand/collapse)
  const groupHeader = target.closest?.('.layer-group-header') as HTMLElement | null;
  if (groupHeader) {
    const groupName = groupHeader.getAttribute('data-group-name') || '';
    if (!groupName) return;

    const isEye = !!target.closest?.('.group-eye');

    if (isEye) {
      // Toggle visibility of all layers in this group
      const groupLayers = document.querySelectorAll(`.layer-item[data-group="${groupName}"]`);
      const layerIds: string[] = [];
      groupLayers.forEach(el => {
        const id = el.getAttribute('data-layer-id');
        if (id) layerIds.push(id);
      });

      // Determine target state: if any are visible, hide all; otherwise show all
      const anyVisible = layerIds.some(id => getCurrentVisible(id));
      layerIds.forEach(id => visibilityCallback?.(id, !anyVisible));
    } else {
      // Toggle expand/collapse
      groupExpandedState[groupName] = !groupExpandedState[groupName];
      const groupContent = groupHeader.nextElementSibling as HTMLElement | null;
      if (groupContent?.classList.contains('layer-group-content')) {
        groupContent.classList.toggle('collapsed', !groupExpandedState[groupName]);
      }
      // Update chevron
      const chevron = groupHeader.querySelector('.group-chevron');
      if (chevron) {
        chevron.innerHTML = groupExpandedState[groupName] ? CHEVRON_DOWN_SVG : CHEVRON_RIGHT_SVG;
      }
    }
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  // Handle regular layer item click
  const item = target.closest?.('.layer-item') as HTMLElement | null;
  if (!item) return;
  const layerId = item.getAttribute('data-layer-id') || '';
  if (!layerId) return;

  const isEye = !!target.closest?.('.layer-eye');

  // Clicking on the item body toggles; clicking on the eye also toggles.
  if (isEye || target.closest?.('.layer-item')) {
    const current = getCurrentVisible(layerId);
    visibilityCallback?.(layerId, !current);
    e.preventDefault();
    e.stopPropagation(); // Prevent dropdown from closing
  }
}

// Eye icon SVGs
const EYE_OPEN_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>';
const EYE_CLOSED_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>';
const LAYERS_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z"/></svg>';
const CLOSE_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
const CHEVRON_DOWN_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>';
const CHEVRON_RIGHT_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>';

// Track group expanded states (default to expanded)
const groupExpandedState: Record<string, boolean> = {};

/**
 * Setup the layer panel
 */
export function setupLayerPanel(
  layers: LayerConfig[],
  visibilityState: Record<string, boolean>,
  onVisibilityChange: VisibilityCallback,
  store?: LayerStore,
  position: WidgetPosition = 'top-right',
  expanded: boolean = false
): { destroy: () => void } {
  visibilityCallback = onVisibilityChange;
  const _store = store;
  activeStore = _store || null;
  activeVisibilityState = visibilityState || {};

  // Get widget container for proper stacking
  const widgetContainer = getWidgetContainer(position);

  // Determine if position is on left side for layout adjustments
  const isLeft = isLeftPosition(position);

  // Create panel container if it doesn't exist
  let panel = document.getElementById('layer-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'layer-panel';
    // Add is-left class for left-side positioning (reverses layer item layout)
    const positionClass = isLeft ? ' is-left' : '';
    panel.className = expanded ? `fm-dropdown-widget${positionClass}` : `fm-dropdown-widget collapsed${positionClass}`;
    panel.innerHTML = `
      <button id="layer-panel-toggle" class="fm-dropdown-toggle" title="Layers">
        ${LAYERS_ICON_SVG}
      </button>
      <div class="fm-dropdown-panel" id="layer-panel-dropdown">
        <div class="fm-dropdown-header">
          <span class="fm-dropdown-header-icon">${LAYERS_ICON_SVG}</span>
          <span class="fm-dropdown-title">Layers</span>
          <button class="fm-dropdown-close" id="layer-panel-close" title="Close">${CLOSE_ICON_SVG}</button>
        </div>
        <div id="layer-list"></div>
      </div>
    `;
    widgetContainer.appendChild(panel);

    // Add toggle click handler
    const toggleBtn = document.getElementById('layer-panel-toggle');
    toggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = panel?.classList.contains('collapsed');
      if (willOpen) {
        // Close other dropdowns (only one open at a time)
        document.querySelectorAll('.fm-dropdown-widget:not(#layer-panel)').forEach(el => {
          el.classList.add('collapsed');
        });
      }
      panel?.classList.toggle('collapsed');
    });

    // Add close button handler
    const closeBtn = document.getElementById('layer-panel-close');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      panel?.classList.add('collapsed');
    });

    // Close when clicking outside (but not when clicking on layer items)
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!panel?.contains(target)) {
        panel?.classList.add('collapsed');
      }
    });
  }
  panelEl = panel;
  
  // One delegated click handler for the whole panel (no window globals, no inline onclick)
  if (!clickHandlerInstalled) {
    panel.addEventListener('click', handlePanelClick as any);
    clickHandlerInstalled = true;
  }

  // Initial render
  if (_store) renderPanel(_store);
  else updateLayerPanel(layers, visibilityState);

  // Subscribe to store changes for automatic updates (when provided)
  if (_store) {
    unsubscribeStore = _store.on('*', (event) => {
      if (event.type === 'visibility' || event.type === 'reorder' || event.type === 'add' || event.type === 'remove' || event.type === 'batch') {
        renderPanel(_store);
      }
    });
  }

  // Keep the "gutter" gradient strips in sync when layer styles change
  if (!installedListeners) {
    installedListeners = true;
    window.addEventListener('fusedmaps:legend:update', () => {
      if (_store) renderPanel(_store);
    });
  }

  return {
    destroy: () => {
      if (unsubscribeStore) {
        unsubscribeStore();
        unsubscribeStore = null;
      }
      // Remove click handler if this is the last/only panel instance
      panelEl?.removeEventListener('click', handlePanelClick as any);
      clickHandlerInstalled = false;
      panelEl = null;
      activeStore = null;
    }
  };
}

/**
 * Render a single layer item HTML
 */
function renderLayerItem(layer: LayerConfig, visible: boolean, order: number, groupName?: string): string {
  const stripBg = getLayerStripGradient(layer);
  const eyeIcon = visible ? EYE_OPEN_SVG : EYE_CLOSED_SVG;
  const groupAttr = groupName ? ` data-group="${groupName}"` : '';
  const indentClass = groupName ? ' layer-item-grouped' : '';

  return `
    <div class="layer-item${indentClass} ${visible ? '' : 'disabled'}"
         data-layer-id="${layer.id}"
         data-order="${order}"${groupAttr}
         style="--layer-strip: ${stripBg};">
      <span class="layer-name">${layer.name}</span>
      <span class="layer-eye" title="Toggle visibility">${eyeIcon}</span>
    </div>
  `;
}

/**
 * Get group visibility state (all visible, none visible, or mixed)
 */
function getGroupVisibility(layerIds: string[]): 'all' | 'none' | 'mixed' {
  let visibleCount = 0;
  layerIds.forEach(id => {
    if (getCurrentVisible(id)) visibleCount++;
  });
  if (visibleCount === 0) return 'none';
  if (visibleCount === layerIds.length) return 'all';
  return 'mixed';
}

/**
 * Render the panel from store state
 */
function renderPanel(store: LayerStore): void {
  const list = document.getElementById('layer-list');
  if (!list) return;

  const allLayers = store.getAll();

  // Separate ungrouped and grouped layers, maintaining order
  const ungrouped: typeof allLayers = [];
  const groups = new Map<string, typeof allLayers>();
  const groupOrder: string[] = []; // Track first-appearance order

  allLayers.forEach(layerState => {
    const groupName = (layerState.config as any).group;
    if (groupName && typeof groupName === 'string') {
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
        groupOrder.push(groupName);
      }
      groups.get(groupName)!.push(layerState);
    } else {
      ungrouped.push(layerState);
    }
  });

  // Debug: log group detection
  console.log('[LayerPanel] Groups detected:', groupOrder, 'Ungrouped:', ungrouped.length);

  let html = '';

  // Render ungrouped layers first (in their original order)
  ungrouped.forEach(layerState => {
    html += renderLayerItem(layerState.config, layerState.visible, layerState.order);
  });

  // Render groups (in first-appearance order)
  groupOrder.forEach(groupName => {
    const groupLayers = groups.get(groupName)!;
    const layerIds = groupLayers.map(ls => ls.config.id);

    // Initialize group state if not set (default: expanded)
    if (groupExpandedState[groupName] === undefined) {
      groupExpandedState[groupName] = true;
    }
    const isExpanded = groupExpandedState[groupName];

    // Calculate group visibility state
    const groupVis = getGroupVisibility(layerIds);
    let groupEyeIcon = EYE_OPEN_SVG;
    let groupEyeClass = '';
    if (groupVis === 'none') {
      groupEyeIcon = EYE_CLOSED_SVG;
      groupEyeClass = ' group-hidden';
    } else if (groupVis === 'mixed') {
      groupEyeClass = ' group-mixed';
    }

    const chevronIcon = isExpanded ? CHEVRON_DOWN_SVG : CHEVRON_RIGHT_SVG;

    // Group header
    html += `
      <div class="layer-group-header" data-group-name="${groupName}">
        <span class="group-chevron">${chevronIcon}</span>
        <span class="group-name">${groupName}</span>
        <span class="group-count">(${groupLayers.length})</span>
        <span class="group-eye${groupEyeClass}" title="Toggle group visibility">${groupEyeIcon}</span>
      </div>
    `;

    // Group content (collapsible)
    html += `<div class="layer-group-content${isExpanded ? '' : ' collapsed'}">`;
    groupLayers.forEach(layerState => {
      html += renderLayerItem(layerState.config, layerState.visible, layerState.order, groupName);
    });
    html += `</div>`;
  });

  // Debug: log final HTML structure
  console.log('[LayerPanel] Rendered groups:', groupOrder.length, 'HTML group headers:', (html.match(/layer-group-header/g) || []).length);

  list.innerHTML = html;
}

/**
 * Update the layer panel UI (legacy interface for compatibility)
 */
export function updateLayerPanel(
  layers: LayerConfig[],
  visibilityState: Record<string, boolean>
): void {
  const list = document.getElementById('layer-list');
  if (!list) return;
  activeVisibilityState = visibilityState || {};

  // Separate ungrouped and grouped layers, maintaining order
  const ungrouped: LayerConfig[] = [];
  const groups = new Map<string, LayerConfig[]>();
  const groupOrder: string[] = [];

  layers.forEach(layer => {
    const groupName = (layer as any).group;
    if (groupName && typeof groupName === 'string') {
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
        groupOrder.push(groupName);
      }
      groups.get(groupName)!.push(layer);
    } else {
      ungrouped.push(layer);
    }
  });

  let html = '';

  // Render ungrouped layers first
  ungrouped.forEach((layer, idx) => {
    const visible = visibilityState[layer.id] !== false;
    html += renderLayerItem(layer, visible, idx);
  });

  // Render groups
  groupOrder.forEach(groupName => {
    const groupLayers = groups.get(groupName)!;
    const layerIds = groupLayers.map(l => l.id);

    if (groupExpandedState[groupName] === undefined) {
      groupExpandedState[groupName] = true;
    }
    const isExpanded = groupExpandedState[groupName];

    const groupVis = getGroupVisibility(layerIds);
    let groupEyeIcon = EYE_OPEN_SVG;
    let groupEyeClass = '';
    if (groupVis === 'none') {
      groupEyeIcon = EYE_CLOSED_SVG;
      groupEyeClass = ' group-hidden';
    } else if (groupVis === 'mixed') {
      groupEyeClass = ' group-mixed';
    }

    const chevronIcon = isExpanded ? CHEVRON_DOWN_SVG : CHEVRON_RIGHT_SVG;

    html += `
      <div class="layer-group-header" data-group-name="${groupName}">
        <span class="group-chevron">${chevronIcon}</span>
        <span class="group-name">${groupName}</span>
        <span class="group-count">(${groupLayers.length})</span>
        <span class="group-eye${groupEyeClass}" title="Toggle group visibility">${groupEyeIcon}</span>
      </div>
    `;

    html += `<div class="layer-group-content${isExpanded ? '' : ' collapsed'}">`;
    groupLayers.forEach((layer, idx) => {
      const visible = visibilityState[layer.id] !== false;
      html += renderLayerItem(layer, visible, idx, groupName);
    });
    html += `</div>`;
  });

  list.innerHTML = html;
}

/**
 * Get the gradient strip background for a layer
 */
function getLayerStripGradient(layer: LayerConfig): string {
  let stripBg = '#0090ff';
  
  const toGradient = (cols: string[]): string | null => {
    if (!cols || !cols.length) return null;
    if (cols.length === 1) return cols[0];
    const stops = cols.map((c, i) => `${c} ${(i / (cols.length - 1)) * 100}%`).join(', ');
    return `linear-gradient(to bottom, ${stops})`;
  };
  
  if (layer.layerType === 'hex') {
    const hexLayer = layer as HexLayerConfig;
    const cfg = hexLayer.hexLayer || {};
    const colorCfg = (cfg.filled === false && cfg.getLineColor) 
      ? cfg.getLineColor 
      : cfg.getFillColor;
    
    if (Array.isArray(colorCfg)) {
      const rgba = toRgba(colorCfg, 1);
      if (rgba) stripBg = rgba;
    } else if (colorCfg && typeof colorCfg === 'object') {
      const fn = (colorCfg as any)['@@function'];
      if (fn === 'colorContinuous' || fn === 'colorCategories') {
        const paletteName = (colorCfg as any).colors || (fn === 'colorCategories' ? 'Bold' : 'TealGrn');
        let cols = getPaletteColors(paletteName, (colorCfg as any).steps || 7);
        if (cols?.length) {
          // Handle domain reversal
          const dom = (colorCfg as any).domain;
          const domainReversed = Array.isArray(dom) && dom.length >= 2 && dom[0] > dom[dom.length - 1];
          const wantsReverse = !!(colorCfg as any).reverse;
          const shouldReverse = domainReversed ? !wantsReverse : wantsReverse;
          if (shouldReverse) cols = [...cols].reverse();
          stripBg = toGradient(cols) || stripBg;
        }
      }
    }
  } else if (layer.layerType === 'vector') {
    const vecLayer = layer as VectorLayerConfig;
    // Check if fill is transparent - prefer line color in that case
    const fillOpacity = (vecLayer as any).vectorLayer?.opacity ?? (vecLayer as any).opacity ?? 1;
    const isFillTransparent = fillOpacity < 0.1 || !vecLayer.isFilled;

    // Determine which color config to use (same logic as legend.ts)
    let colorCfg: any = null;
    if (isFillTransparent && vecLayer.lineColorConfig) {
      colorCfg = vecLayer.lineColorConfig;
    } else if (vecLayer.fillColorConfig) {
      colorCfg = vecLayer.fillColorConfig;
    } else if (vecLayer.lineColorConfig) {
      colorCfg = vecLayer.lineColorConfig;
    }

    // Handle color config (continuous or categorical)
    if (colorCfg && typeof colorCfg === 'object') {
      const fn = colorCfg['@@function'];
      if (fn === 'colorContinuous' || fn === 'colorCategories') {
        const paletteName = colorCfg.colors || (fn === 'colorCategories' ? 'Bold' : 'TealGrn');
        let cols = getPaletteColors(paletteName, colorCfg.steps || 7);
        if (cols?.length) {
          const dom = colorCfg.domain;
          const domainReversed = Array.isArray(dom) && dom.length >= 2 && dom[0] > dom[dom.length - 1];
          const wantsReverse = !!colorCfg.reverse;
          const shouldReverse = domainReversed ? !wantsReverse : wantsReverse;
          if (shouldReverse) cols = [...cols].reverse();
          stripBg = toGradient(cols) || stripBg;
        }
      }
    } else if (isFillTransparent && vecLayer.lineColorRgba) {
      stripBg = vecLayer.lineColorRgba;
    } else if (vecLayer.fillColorRgba) {
      stripBg = vecLayer.fillColorRgba;
    }
  } else if (layer.layerType === 'pmtiles') {
    const pmLayer = layer as PMTilesLayerConfig;
    if (pmLayer.fillColorConfig && typeof pmLayer.fillColorConfig === 'object') {
      const paletteName = (pmLayer.fillColorConfig as any).colors;
      if (paletteName) {
        let cols = getPaletteColors(paletteName, 7);
        if (cols?.length) {
          const wantsReverse = !!(pmLayer.fillColorConfig as any).reverse;
          if (wantsReverse) cols = [...cols].reverse();
          stripBg = toGradient(cols) || stripBg;
        }
      }
    }
  } else if (layer.layerType === 'raster') {
    stripBg = 'linear-gradient(to bottom, #888, #444)';
  }
  
  return stripBg;
}
