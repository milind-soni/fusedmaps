/**
 * Data filter panel – per-layer dual-range slider (continuous) + checkbox list (categorical).
 */

import type { WidgetPosition } from '../types';
import { getWidgetContainer } from './widget-container';
import { isLeftPosition } from '../types';
import type { FilterableLayerInfo } from '../layers/hex-tiles';
import { getPaletteColors, FALLBACK_CATEGORICAL_COLORS } from '../color/palettes';

type ContinuousFilterCallback = (layerId: string, range: [number, number] | null) => void;
type CategoricalFilterCallback = (layerId: string, selected: Set<string> | null) => void;

let continuousFilterCb: ContinuousFilterCallback | null = null;
let categoricalFilterCb: CategoricalFilterCallback | null = null;
let panelEl: HTMLElement | null = null;
let eventsInstalled = false;

// Track all filter infos for re-rendering
let allFilterInfos: FilterableLayerInfo[] = [];

// ── Continuous filter state ──────────────────────────────────────────────

interface LayerFilterState {
  dataMin: number;
  dataMax: number;
  filterMin: number;
  filterMax: number;
}
const filterStates: Record<string, LayerFilterState> = {};

// ── Categorical filter state ─────────────────────────────────────────────

interface CategoricalFilterState {
  allValues: string[];
  selected: Set<string>;
  palette: string;
}
const categoricalStates: Record<string, CategoricalFilterState> = {};

// ── Icons ────────────────────────────────────────────────────────────────

const FILTER_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg>';
const CLOSE_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

// ── Formatting ───────────────────────────────────────────────────────────

function fmtNum(v: number): string {
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'k';
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

// ── Continuous filter rendering ──────────────────────────────────────────

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

// ── Categorical filter rendering ─────────────────────────────────────────

function renderCategoricalFilter(info: FilterableLayerInfo): string {
  const state = categoricalStates[info.layerId];
  if (!state) return '';

  let colors = getPaletteColors(info.palette || 'Bold', Math.max(state.allValues.length, 3));
  if (!colors?.length) colors = FALLBACK_CATEGORICAL_COLORS;

  const allChecked = state.selected.size === state.allValues.length;

  const items = state.allValues.map((val, i) => {
    const checked = state.selected.has(val);
    const color = colors![i % colors!.length];
    return `
      <label class="filter-cat-item" title="${val}">
        <input type="checkbox" class="filter-cat-check" data-layer="${info.layerId}" data-value="${val}" ${checked ? 'checked' : ''}>
        <span class="filter-cat-swatch" style="background:${color}"></span>
        <span class="filter-cat-label">${val}</span>
      </label>`;
  }).join('');

  return `
    <div class="filter-layer-section" data-filter-layer="${info.layerId}">
      <div class="filter-layer-header">
        <span class="filter-layer-name">${info.layerName}</span>
        <span class="filter-attr-label">${info.attr}</span>
      </div>
      <div class="filter-cat-controls">
        <button class="filter-cat-toggle" data-layer="${info.layerId}" data-action="${allChecked ? 'none' : 'all'}">${allChecked ? 'Deselect all' : 'Select all'}</button>
      </div>
      <div class="filter-cat-list">${items}</div>
    </div>
  `;
}

// ── Input handlers ───────────────────────────────────────────────────────

function handlePanelInput(e: Event): void {
  const target = e.target as HTMLInputElement | null;
  if (!target) return;

  // Continuous range slider
  const isMin = target.classList.contains('filter-range-min');
  const isMax = target.classList.contains('filter-range-max');
  if (isMin || isMax) {
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

    continuousFilterCb?.(layerId, [state.filterMin, state.filterMax]);
    return;
  }

  // Categorical checkbox
  if (target.classList.contains('filter-cat-check')) {
    const layerId = target.getAttribute('data-layer') || '';
    const value = target.getAttribute('data-value') || '';
    const state = categoricalStates[layerId];
    if (!state) return;

    if (target.checked) state.selected.add(value);
    else state.selected.delete(value);

    _updateToggleButton(layerId, state);
    categoricalFilterCb?.(layerId, state.selected.size === state.allValues.length ? null : state.selected);
  }
}

function handlePanelClick(e: Event): void {
  const target = e.target as HTMLElement | null;
  if (!target?.classList.contains('filter-cat-toggle')) return;

  const layerId = target.getAttribute('data-layer') || '';
  const action = target.getAttribute('data-action') || '';
  const state = categoricalStates[layerId];
  if (!state) return;

  if (action === 'all') {
    state.selected = new Set(state.allValues);
  } else {
    state.selected = new Set();
  }

  // Re-render checkboxes in this section
  const section = target.closest('.filter-layer-section');
  if (section) {
    const checks = section.querySelectorAll('.filter-cat-check') as NodeListOf<HTMLInputElement>;
    checks.forEach(cb => { cb.checked = state.selected.has(cb.getAttribute('data-value') || ''); });
  }

  _updateToggleButton(layerId, state);
  categoricalFilterCb?.(layerId, state.selected.size === state.allValues.length ? null : state.selected);
}

function _updateToggleButton(layerId: string, state: CategoricalFilterState): void {
  const allChecked = state.selected.size === state.allValues.length;
  const btn = panelEl?.querySelector(`.filter-cat-toggle[data-layer="${layerId}"]`) as HTMLElement | null;
  if (btn) {
    btn.textContent = allChecked ? 'Deselect all' : 'Select all';
    btn.setAttribute('data-action', allChecked ? 'none' : 'all');
  }
}

// ── Panel rendering ──────────────────────────────────────────────────────

function renderFilterPanel(infos: FilterableLayerInfo[]): void {
  const list = document.getElementById('filter-list');
  if (!list) return;

  if (infos.length === 0) {
    list.innerHTML = '<div class="filter-empty">No filterable layers</div>';
    return;
  }

  let html = '';
  for (const info of infos) {
    if (info.colorType === 'categorical' && categoricalStates[info.layerId]) {
      html += renderCategoricalFilter(info);
    } else if (filterStates[info.layerId]) {
      html += renderLayerFilter(info);
    }
  }

  if (!html) {
    list.innerHTML = '<div class="filter-empty">Loading data…</div>';
    return;
  }

  list.innerHTML = html;
}

// ── Data extraction ──────────────────────────────────────────────────────

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

function extractUniqueValues(data: any[], attr: string, max: number = 50): string[] {
  const seen = new Set<string>();
  for (const row of data) {
    const p = row?.properties || row;
    if (!p) continue;
    const raw = p[attr];
    if (raw == null || raw === '') continue;
    seen.add(String(raw));
    if (seen.size >= max) break;
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

// ── Public API ───────────────────────────────────────────────────────────

export function setupFilterPanel(
  onContinuousChange: ContinuousFilterCallback,
  onCategoricalChange: CategoricalFilterCallback,
  position: WidgetPosition = 'top-right',
  expanded: boolean = true
): { destroy: () => void } {
  continuousFilterCb = onContinuousChange;
  categoricalFilterCb = onCategoricalChange;

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

  if (!eventsInstalled) {
    panel.addEventListener('input', handlePanelInput as any);
    panel.addEventListener('change', handlePanelInput as any);
    panel.addEventListener('click', handlePanelClick as any);
    eventsInstalled = true;
  }

  return {
    destroy: () => {
      panelEl?.removeEventListener('input', handlePanelInput as any);
      panelEl?.removeEventListener('change', handlePanelInput as any);
      panelEl?.removeEventListener('click', handlePanelClick as any);
      eventsInstalled = false;
      panelEl = null;
      continuousFilterCb = null;
      categoricalFilterCb = null;
    }
  };
}

/**
 * Initialize continuous filter state for layers.
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

  if (anyNew) renderFilterPanel(allFilterInfos.length ? allFilterInfos : infos);
}

/**
 * Initialize categorical filter state for layers.
 */
export function initCategoricalFilter(
  infos: FilterableLayerInfo[],
  getDataFn: (info: FilterableLayerInfo) => any[] | null
): void {
  let anyNew = false;

  for (const info of infos) {
    if (categoricalStates[info.layerId]) continue;

    let values: string[] = [];

    // For MVT layers, use categories from config since tile data isn't scannable
    if ((info as any).categories?.length) {
      values = (info as any).categories;
    } else {
      const data = getDataFn(info);
      if (!data || !data.length) continue;
      values = extractUniqueValues(data, info.attr);
    }
    if (!values.length) continue;

    const palette = (info as any).palette || 'Bold';

    categoricalStates[info.layerId] = {
      allValues: values,
      selected: new Set(values),
      palette,
    };
    anyNew = true;
  }

  if (anyNew) renderFilterPanel(allFilterInfos.length ? allFilterInfos : infos);
}

/**
 * Store the full list of filter infos so re-renders show everything.
 */
export function setAllFilterInfos(infos: FilterableLayerInfo[]): void {
  allFilterInfos = infos;
}
