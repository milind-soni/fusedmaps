/**
 * Data filter panel – per-layer dual-range slider with mini histogram.
 * Renders as a separate dropdown widget (like layers / legend).
 */

import type { WidgetPosition } from '../types';
import { getWidgetContainer } from './widget-container';
import { isLeftPosition } from '../types';
import type { FilterableLayerInfo, HistogramBin } from '../layers/hex-tiles';

type FilterCallback = (layerId: string, range: [number, number] | null) => void;

let filterCallback: FilterCallback | null = null;
let panelEl: HTMLElement | null = null;
let clickInstalled = false;

// Track current state per layer
interface LayerFilterState {
  dataMin: number;
  dataMax: number;
  filterMin: number;
  filterMax: number;
  bins: HistogramBin[];
  total: number;
}
const filterStates: Record<string, LayerFilterState> = {};

const FILTER_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg>';
const CLOSE_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

function fmtNum(v: number): string {
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'k';
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

function renderHistogramSVG(bins: HistogramBin[], filterMin: number, filterMax: number, dataMin: number, dataMax: number): string {
  if (!bins.length) return '';
  const maxCount = Math.max(...bins.map(b => b.count));
  if (maxCount === 0) return '';

  const w = 220;
  const h = 48;
  const barW = w / bins.length;
  const range = dataMax - dataMin;

  let bars = '';
  for (let i = 0; i < bins.length; i++) {
    const barH = (bins[i].count / maxCount) * h;
    const x = i * barW;
    const y = h - barH;
    const midVal = (bins[i].min + bins[i].max) / 2;
    const inRange = midVal >= filterMin && midVal <= filterMax;
    const opacity = inRange ? '0.85' : '0.15';
    bars += `<rect x="${x}" y="${y}" width="${barW - 0.5}" height="${barH}" rx="1" fill="var(--ui-accent, #4dabf7)" opacity="${opacity}"/>`;
  }

  return `<svg class="filter-histogram-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bars}</svg>`;
}

function renderLayerFilter(info: FilterableLayerInfo): string {
  const state = filterStates[info.layerId];
  if (!state) return '';

  const { dataMin, dataMax, filterMin, filterMax, bins } = state;
  const histSvg = renderHistogramSVG(bins, filterMin, filterMax, dataMin, dataMax);

  const minPct = ((filterMin - dataMin) / (dataMax - dataMin)) * 100;
  const maxPct = ((filterMax - dataMin) / (dataMax - dataMin)) * 100;

  return `
    <div class="filter-layer-section" data-filter-layer="${info.layerId}">
      <div class="filter-layer-header">
        <span class="filter-layer-name">${info.layerName}</span>
        <span class="filter-attr-label">${info.attr}</span>
      </div>
      <div class="filter-histogram-wrap">
        ${histSvg}
        <div class="filter-slider-wrap">
          <input type="range" class="filter-range-min" data-layer="${info.layerId}"
            min="0" max="1000" value="${Math.round(minPct * 10)}"
            step="1">
          <input type="range" class="filter-range-max" data-layer="${info.layerId}"
            min="0" max="1000" value="${Math.round(maxPct * 10)}"
            step="1">
        </div>
      </div>
      <div class="filter-range-labels">
        <span class="filter-val-min">${fmtNum(filterMin)}</span>
        <span class="filter-val-max">${fmtNum(filterMax)}</span>
      </div>
    </div>
  `;
}

function handlePanelInput(e: Event): void {
  const target = e.target as HTMLInputElement | null;
  if (!target) return;

  const isMin = target.classList.contains('filter-range-min');
  const isMax = target.classList.contains('filter-range-max');
  if (!isMin && !isMax) return;

  const layerId = target.getAttribute('data-layer') || '';
  const state = filterStates[layerId];
  if (!state) return;

  const pct = parseInt(target.value, 10) / 1000;
  const range = state.dataMax - state.dataMin;
  const val = state.dataMin + pct * range;

  if (isMin) {
    state.filterMin = Math.min(val, state.filterMax);
    // Prevent crossing
    const maxSlider = target.parentElement?.querySelector('.filter-range-max') as HTMLInputElement | null;
    if (maxSlider && parseInt(target.value, 10) > parseInt(maxSlider.value, 10)) {
      target.value = maxSlider.value;
      state.filterMin = state.filterMax;
    }
  } else {
    state.filterMax = Math.max(val, state.filterMin);
    const minSlider = target.parentElement?.querySelector('.filter-range-min') as HTMLInputElement | null;
    if (minSlider && parseInt(target.value, 10) < parseInt(minSlider.value, 10)) {
      target.value = minSlider.value;
      state.filterMax = state.filterMin;
    }
  }

  // Update labels
  const section = target.closest('.filter-layer-section');
  const minLabel = section?.querySelector('.filter-val-min');
  const maxLabel = section?.querySelector('.filter-val-max');
  if (minLabel) minLabel.textContent = fmtNum(state.filterMin);
  if (maxLabel) maxLabel.textContent = fmtNum(state.filterMax);

  // Update histogram bar highlighting
  const svgEl = section?.querySelector('.filter-histogram-svg');
  if (svgEl) {
    const rects = svgEl.querySelectorAll('rect');
    const bins = state.bins;
    rects.forEach((rect, i) => {
      if (i < bins.length) {
        const midVal = (bins[i].min + bins[i].max) / 2;
        const inRange = midVal >= state.filterMin && midVal <= state.filterMax;
        rect.setAttribute('opacity', inRange ? '0.85' : '0.15');
      }
    });
  }

  filterCallback?.(layerId, [state.filterMin, state.filterMax]);
}

function renderFilterPanel(infos: FilterableLayerInfo[]): void {
  const list = document.getElementById('filter-list');
  if (!list) return;

  if (infos.length === 0) {
    list.innerHTML = '<div class="filter-empty">No filterable layers</div>';
    return;
  }

  let html = '';
  for (const info of infos) {
    if (filterStates[info.layerId]) {
      html += renderLayerFilter(info);
    }
  }

  if (!html) {
    list.innerHTML = '<div class="filter-empty">Loading data…</div>';
    return;
  }

  list.innerHTML = html;
}

export function setupFilterPanel(
  onFilterChange: FilterCallback,
  position: WidgetPosition = 'top-right',
  expanded: boolean = true
): { destroy: () => void } {
  filterCallback = onFilterChange;

  const widgetContainer = getWidgetContainer(position);
  const isLeft = isLeftPosition(position);

  let panel = document.getElementById('filter-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'filter-panel';
    const posClass = isLeft ? ' is-left' : '';
    panel.className = expanded ? `fm-dropdown-widget${posClass}` : `fm-dropdown-widget collapsed${posClass}`;
    panel.innerHTML = `
      <button id="filter-panel-toggle" class="fm-dropdown-toggle" title="Data Filter">
        ${FILTER_ICON_SVG}
      </button>
      <div class="fm-dropdown-panel" id="filter-panel-dropdown">
        <div class="fm-dropdown-header">
          <span class="fm-dropdown-header-icon">${FILTER_ICON_SVG}</span>
          <span class="fm-dropdown-title">Filter</span>
          <button class="fm-dropdown-close" id="filter-panel-close" title="Close">${CLOSE_ICON_SVG}</button>
        </div>
        <div id="filter-list"></div>
      </div>
    `;
    widgetContainer.appendChild(panel);

    const toggleBtn = document.getElementById('filter-panel-toggle');
    toggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = panel?.classList.contains('collapsed');
      if (willOpen) {
        document.querySelectorAll('.fm-dropdown-widget:not(#filter-panel)').forEach(el => el.classList.add('collapsed'));
      }
      panel?.classList.toggle('collapsed');
    });

    const closeBtn = document.getElementById('filter-panel-close');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      panel?.classList.add('collapsed');
    });

    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!panel?.contains(target)) panel?.classList.add('collapsed');
    });
  }

  panelEl = panel;

  if (!clickInstalled) {
    panel.addEventListener('input', handlePanelInput as any);
    clickInstalled = true;
  }

  return {
    destroy: () => {
      panelEl?.removeEventListener('input', handlePanelInput as any);
      clickInstalled = false;
      panelEl = null;
      filterCallback = null;
    }
  };
}

/**
 * Refresh histogram data for all filterable layers.
 * Call this on tile load events and map move.
 */
export function updateFilterHistograms(
  infos: FilterableLayerInfo[],
  binFn: (tileUrl: string, attr: string, info?: FilterableLayerInfo) => ReturnType<typeof import('../layers/hex-tiles').binHistogram>
): void {
  let anyNew = false;

  for (const info of infos) {
    const result = binFn(info.tileUrl, info.attr, info);
    if (!result) continue;

    const existing = filterStates[info.layerId];
    if (!existing) {
      filterStates[info.layerId] = {
        dataMin: result.dataMin,
        dataMax: result.dataMax,
        filterMin: result.dataMin,
        filterMax: result.dataMax,
        bins: result.bins,
        total: result.total,
      };
      anyNew = true;
    } else {
      // Update bins and data range, keep user's filter if still valid
      const oldRange = existing.dataMax - existing.dataMin;
      const newRange = result.dataMax - result.dataMin;

      existing.bins = result.bins;
      existing.total = result.total;

      // Only expand data bounds, never shrink (prevents jarring slider jumps)
      if (result.dataMin < existing.dataMin) { existing.dataMin = result.dataMin; anyNew = true; }
      if (result.dataMax > existing.dataMax) { existing.dataMax = result.dataMax; anyNew = true; }

      // Clamp filter to valid range
      existing.filterMin = Math.max(existing.filterMin, existing.dataMin);
      existing.filterMax = Math.min(existing.filterMax, existing.dataMax);
    }
  }

  renderFilterPanel(infos);
}
