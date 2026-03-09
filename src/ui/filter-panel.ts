/**
 * Data filter panel – per-layer dual-range slider.
 * No histogram; min/max computed once on init.
 */

import type { WidgetPosition } from '../types';
import { getWidgetContainer } from './widget-container';
import { isLeftPosition } from '../types';
import type { FilterableLayerInfo } from '../layers/hex-tiles';

type FilterCallback = (layerId: string, range: [number, number] | null) => void;

let filterCallback: FilterCallback | null = null;
let panelEl: HTMLElement | null = null;
let clickInstalled = false;

interface LayerFilterState {
  dataMin: number;
  dataMax: number;
  filterMin: number;
  filterMax: number;
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

function renderLayerFilter(info: FilterableLayerInfo): string {
  const state = filterStates[info.layerId];
  if (!state) return '';

  const { dataMin, dataMax, filterMin, filterMax } = state;
  const minPct = ((filterMin - dataMin) / (dataMax - dataMin)) * 100;
  const maxPct = ((filterMax - dataMin) / (dataMax - dataMin)) * 100;

  const trackLeft = minPct;
  const trackRight = 100 - maxPct;

  return `
    <div class="filter-layer-section" data-filter-layer="${info.layerId}">
      <div class="filter-layer-header">
        <span class="filter-layer-name">${info.layerName}</span>
        <span class="filter-attr-label">${info.attr}</span>
      </div>
      <div class="filter-dual-range">
        <div class="filter-track"></div>
        <div class="filter-track-fill" style="left:${trackLeft}%;right:${trackRight}%"></div>
        <input type="range" class="filter-range-min" data-layer="${info.layerId}"
          min="0" max="1000" value="${Math.round(minPct * 10)}" step="1">
        <input type="range" class="filter-range-max" data-layer="${info.layerId}"
          min="0" max="1000" value="${Math.round(maxPct * 10)}" step="1">
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

  const section = target.closest('.filter-layer-section');
  const minLabel = section?.querySelector('.filter-val-min');
  const maxLabel = section?.querySelector('.filter-val-max');
  if (minLabel) minLabel.textContent = fmtNum(state.filterMin);
  if (maxLabel) maxLabel.textContent = fmtNum(state.filterMax);

  const span = state.dataMax - state.dataMin;
  const fill = section?.querySelector('.filter-track-fill') as HTMLElement | null;
  if (fill && span > 0) {
    const lPct = ((state.filterMin - state.dataMin) / span) * 100;
    const rPct = 100 - ((state.filterMax - state.dataMin) / span) * 100;
    fill.style.left = lPct + '%';
    fill.style.right = rPct + '%';
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

/**
 * Compute min/max for a filterable layer from tile cache or inline data.
 * Called once (or when data first arrives), not on every map move.
 */
function computeMinMax(
  data: any[],
  attr: string
): { dataMin: number; dataMax: number } | null {
  let min = Infinity, max = -Infinity;
  for (const row of data) {
    const p = row?.properties || row;
    if (!p) continue;
    const raw = p[attr];
    const v = typeof raw === 'number' ? raw : (typeof raw === 'string' ? parseFloat(raw) : NaN);
    if (Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return null;
  return { dataMin: min, dataMax: max };
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
 * Initialize filter state for layers. Called once when data first becomes available.
 * For tiled layers, call when tiles load. For inline, call on init.
 */
export function initFilterMinMax(
  infos: FilterableLayerInfo[],
  getDataFn: (info: FilterableLayerInfo) => any[] | null
): void {
  let anyNew = false;

  for (const info of infos) {
    if (filterStates[info.layerId]) continue;

    const data = getDataFn(info);
    if (!data || !data.length) continue;

    const mm = computeMinMax(data, info.attr);
    if (!mm) continue;

    filterStates[info.layerId] = {
      dataMin: mm.dataMin,
      dataMax: mm.dataMax,
      filterMin: mm.dataMin,
      filterMax: mm.dataMax,
    };
    anyNew = true;
  }

  if (anyNew) renderFilterPanel(infos);
}
