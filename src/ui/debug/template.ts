/**
 * Debug panel DOM template + element lookup
 *
 * Keeps `ui/debug.ts` focused on behavior rather than giant HTML strings and querySelector boilerplate.
 */

export type SidebarMode = 'show' | 'hide' | null;

export const DEBUG_SHELL_ID = 'debug-shell';

export function getDebugShellHtml(): string {
  // NOTE: Keep IDs stable; many callers query by id.
  return `
      <div id="debug-panel">
        <div id="debug-content">
          <div class="debug-tabs" role="tablist" aria-label="Debug tabs">
            <button type="button" class="debug-tab-btn active" id="dbg-tab-btn-ui" data-tab="ui" role="tab" aria-selected="true">UI</button>
            <button type="button" class="debug-tab-btn" id="dbg-tab-btn-sql" data-tab="sql" role="tab" aria-selected="false">SQL</button>
            <button type="button" class="debug-tab-btn" id="dbg-tab-btn-ai" data-tab="ai" role="tab" aria-selected="false">AI</button>
          </div>

          <div class="debug-tab-panel" id="dbg-tab-panel-ui" role="tabpanel" aria-label="UI tab">
          <div class="debug-section">
            <div class="debug-section-title">Editing Layer</div>
            <div class="debug-row">
              <span class="debug-label">Layer</span>
              <select class="debug-select" id="dbg-layer-select"></select>
            </div>
          </div>

          <div class="debug-section" id="dbg-hex-section">
            <div class="debug-section-title">Hex Layer</div>
            <div class="debug-toggles">
              <label class="debug-checkbox"><input type="checkbox" id="dbg-filled" checked /> Filled</label>
              <label class="debug-checkbox"><input type="checkbox" id="dbg-stroked" checked /> Stroked</label>
              <label class="debug-checkbox"><input type="checkbox" id="dbg-extruded" /> Extruded</label>
            </div>
            <div id="dbg-extrusion-controls" style="display:none;margin-top:8px;">
              <div class="debug-row">
                <span class="debug-label">Height attr</span>
                <select class="debug-select" id="dbg-elev-attr"></select>
              </div>
              <div class="debug-row">
                <span class="debug-label">Height scale</span>
                <input type="number" class="debug-input debug-input-sm" id="dbg-elev-scale" step="0.1" value="1" />
              </div>
            </div>
            <div class="debug-row" style="margin-top:8px;">
              <span class="debug-label">Opacity</span>
              <input type="range" class="debug-slider" id="dbg-opacity-slider" min="0" max="1" step="0.05" value="1" />
              <input type="number" class="debug-input debug-input-sm" id="dbg-opacity" step="0.1" min="0" max="1" value="1" />
            </div>
          </div>

          <div class="debug-section" id="fill-color-section">
            <div class="debug-section-title">Fill Color</div>
            <div class="debug-row">
              <span class="debug-label">Function</span>
              <select class="debug-select" id="dbg-fill-fn">
                <option value="colorContinuous">colorContinuous</option>
                <option value="static">Static Color</option>
              </select>
            </div>
            <div id="fill-fn-options">
              <div class="debug-row">
                <span class="debug-label">Attribute</span>
                <select class="debug-select" id="dbg-attr"></select>
              </div>
              <div class="debug-row">
                <span class="debug-label">Palette</span>
                <select class="debug-select pal-hidden" id="dbg-palette"></select>
                <div class="pal-dd" id="dbg-palette-dd">
                  <button type="button" class="pal-trigger" id="dbg-palette-trigger" title="Palette">
                    <span class="pal-name" id="dbg-palette-name">Palette</span>
                    <span class="pal-swatch" id="dbg-palette-swatch"></span>
                  </button>
                  <div class="pal-menu" id="dbg-palette-menu" style="display:none;"></div>
                </div>
              </div>
              <div class="debug-row">
                <span class="debug-label"></span>
                <label class="debug-checkbox" style="margin-left:auto;"><input type="checkbox" id="dbg-fill-reverse" /> Reverse</label>
              </div>
              <div class="debug-row">
                <span class="debug-label">Domain</span>
                <input type="number" class="debug-input debug-input-sm" id="dbg-domain-min" step="0.1" placeholder="min" />
                <span style="color:#666;">–</span>
                <input type="number" class="debug-input debug-input-sm" id="dbg-domain-max" step="0.1" placeholder="max" />
              </div>
            <div class="debug-row">
              <span class="debug-label"></span>
              <div class="debug-dual-range" aria-label="Domain range">
                <input type="range" class="debug-range-min" id="dbg-domain-range-min" min="0" max="100" step="0.1" value="0" />
                <input type="range" class="debug-range-max" id="dbg-domain-range-max" min="0" max="100" step="0.1" value="100" />
              </div>
            </div>
              <div class="debug-row">
                <span class="debug-label">Steps</span>
                <input type="number" class="debug-input debug-input-sm" id="dbg-steps" step="1" min="2" max="20" value="7" />
              </div>
              <div class="debug-row">
                <span class="debug-label">Null Color</span>
                <input type="color" class="debug-color" id="dbg-null-color" value="#b8b8b8" />
                <span class="debug-color-label" id="dbg-null-color-label">#b8b8b8</span>
              </div>
            </div>
            <div id="fill-static-options" style="display:none;">
              <div class="debug-row">
                <span class="debug-label">Color</span>
                <input type="color" class="debug-color" id="dbg-fill-static" value="#0090ff" />
                <span class="debug-color-label" id="dbg-fill-static-label">#0090ff</span>
              </div>
            </div>
          </div>

          <div class="debug-section" id="line-color-section">
            <div class="debug-section-title">Line Color</div>
            <div class="debug-row">
              <span class="debug-label">Function</span>
              <select class="debug-select" id="dbg-line-fn">
                <option value="colorContinuous">colorContinuous</option>
                <option value="static" selected>Static Color</option>
              </select>
            </div>
            <div id="line-fn-options" style="display:none;">
              <div class="debug-row">
                <span class="debug-label">Attribute</span>
                <select class="debug-select" id="dbg-line-attr"></select>
              </div>
              <div class="debug-row">
                <span class="debug-label">Palette</span>
                <select class="debug-select pal-hidden" id="dbg-line-palette"></select>
                <div class="pal-dd" id="dbg-line-palette-dd">
                  <button type="button" class="pal-trigger" id="dbg-line-palette-trigger" title="Palette">
                    <span class="pal-name" id="dbg-line-palette-name">Palette</span>
                    <span class="pal-swatch" id="dbg-line-palette-swatch"></span>
                  </button>
                  <div class="pal-menu" id="dbg-line-palette-menu" style="display:none;"></div>
                </div>
              </div>
              <div class="debug-row">
                <span class="debug-label"></span>
                <label class="debug-checkbox" style="margin-left:auto;"><input type="checkbox" id="dbg-line-reverse" /> Reverse</label>
              </div>
              <div class="debug-row">
                <span class="debug-label">Domain</span>
                <input type="number" class="debug-input debug-input-sm" id="dbg-line-domain-min" step="0.1" placeholder="min" />
                <span style="color:#666;">–</span>
                <input type="number" class="debug-input debug-input-sm" id="dbg-line-domain-max" step="0.1" placeholder="max" />
              </div>
            </div>
            <div id="line-static-options">
              <div class="debug-row">
                <span class="debug-label">Color</span>
                <input type="color" class="debug-color" id="dbg-line-static" value="#ffffff" />
                <span class="debug-color-label" id="dbg-line-static-label">#ffffff</span>
              </div>
              <div class="debug-row">
                <span class="debug-label">Line Width</span>
                <input type="range" class="debug-slider" id="dbg-line-width-slider" min="0" max="5" step="0.5" value="1" />
                <input type="number" class="debug-input debug-input-sm" id="dbg-line-width" step="0.5" min="0" max="10" value="1" />
              </div>
            </div>
          </div>

          <div class="debug-section" id="dbg-viewstate-section">
            <div class="debug-section-title">View State</div>
            <div class="debug-row">
              <span class="debug-label">Longitude</span>
              <input type="number" class="debug-input" id="dbg-lng" step="0.0001" />
            </div>
            <div class="debug-row">
              <span class="debug-label">Latitude</span>
              <input type="number" class="debug-input" id="dbg-lat" step="0.0001" />
            </div>
            <div class="debug-row">
              <span class="debug-label">Zoom</span>
              <input type="number" class="debug-input" id="dbg-zoom" step="0.1" min="0" max="22" />
            </div>
            <div class="debug-row">
              <span class="debug-label">Pitch</span>
              <input type="number" class="debug-input" id="dbg-pitch" step="1" min="0" max="85" />
            </div>
            <div class="debug-row">
              <span class="debug-label">Bearing</span>
              <input type="number" class="debug-input" id="dbg-bearing" step="1" />
            </div>
          </div>

          <div class="debug-section">
            <details id="dbg-view-details">
              <summary class="debug-section-title" style="cursor:pointer; user-select:none;">Current ViewState</summary>
              <textarea id="dbg-view-output" class="debug-output" readonly></textarea>
            </details>
          </div>

          <div class="debug-section">
            <div class="debug-section-title">Layer Config</div>
            <textarea id="dbg-output" class="debug-output" readonly></textarea>
          </div>
          </div>

          <div class="debug-tab-panel" id="dbg-tab-panel-sql" role="tabpanel" aria-label="SQL tab" style="display:none;">
            <div class="debug-section" id="sql-section">
              <div class="debug-section-title">SQL <span id="sql-status" style="float:right;font-weight:normal;color:var(--ui-muted-2);"></span></div>
              <textarea id="dbg-sql" class="debug-output" style="height:80px;font-family:monospace;font-size:11px;resize:vertical;" placeholder="WHERE expression (e.g. data = 111)\n—or—\nFull SQL (SELECT ... FROM data ...)"></textarea>
            </div>
          </div>

          <div class="debug-tab-panel" id="dbg-tab-panel-ai" role="tabpanel" aria-label="AI tab" style="display:none;">
            <div class="debug-section" id="ai-section">
              <div class="debug-section-title">AI SQL Assistant <span id="ai-status" style="float:right;font-weight:normal;color:var(--ui-muted-2);"></span></div>
              <div id="ai-chat" class="ai-chat-container"></div>
              <div id="ai-sql-preview" class="ai-sql-preview-container" style="display:none;"></div>
              <div class="ai-input-row">
                <textarea id="ai-input" class="debug-input ai-input" placeholder="Ask: &quot;Show hexes where pct > 50&quot;" rows="2"></textarea>
                <button type="button" id="ai-send" class="ai-send-btn" title="Send">&#10148;</button>
              </div>
            </div>
          </div>
        </div>
        <div id="debug-resize-handle" title="Drag to resize"></div>
      </div>
      <div id="debug-toggle" title="Toggle sidebar">&#x2039;</div>
  `;
}

export interface DebugShell {
  shell: HTMLElement;
  panel: HTMLElement;
  toggle: HTMLElement;
  resizeHandle: HTMLElement;
}

export function ensureDebugShell(): DebugShell {
  let shell = document.getElementById(DEBUG_SHELL_ID) as HTMLElement | null;
  if (!shell) {
    shell = document.createElement('div');
    shell.id = DEBUG_SHELL_ID;
    shell.innerHTML = getDebugShellHtml();
    document.body.appendChild(shell);
  }

  const panel = document.getElementById('debug-panel') as HTMLElement | null;
  const toggle = document.getElementById('debug-toggle') as HTMLElement | null;
  const resizeHandle = document.getElementById('debug-resize-handle') as HTMLElement | null;

  if (!panel || !toggle || !resizeHandle) {
    // Should never happen unless template IDs were changed.
    throw new Error('[FusedMaps] Debug panel DOM missing expected elements');
  }

  return { shell, panel, toggle, resizeHandle };
}

export interface DebugElements {
  layerSelect: HTMLSelectElement;

  hexSection: HTMLElement;
  viewStateSection: HTMLElement;
  fillColorSection: HTMLElement;
  lineColorSection: HTMLElement;

  filledEl: HTMLInputElement;
  strokedEl: HTMLInputElement;
  extrudedEl: HTMLInputElement;
  extrusionControls: HTMLElement;
  elevAttrEl: HTMLSelectElement;
  elevScaleEl: HTMLInputElement;
  opacitySliderEl: HTMLInputElement;
  opacityEl: HTMLInputElement;

  fillFnEl: HTMLSelectElement;
  fillFnOptions: HTMLElement;
  fillStaticOptions: HTMLElement;
  fillAttrEl: HTMLSelectElement;
  fillPaletteEl: HTMLSelectElement;
  fillPalTrigger: HTMLButtonElement;
  fillPalSwatch: HTMLElement;
  fillPalMenu: HTMLElement;
  fillDomainMinEl: HTMLInputElement;
  fillDomainMaxEl: HTMLInputElement;
  fillRangeMinEl: HTMLInputElement;
  fillRangeMaxEl: HTMLInputElement;
  fillStepsEl: HTMLInputElement;
  fillReverseEl: HTMLInputElement;
  fillNullEl: HTMLInputElement;
  fillNullLabel: HTMLElement;
  fillStaticEl: HTMLInputElement;
  fillStaticLabel: HTMLElement;

  lineFnEl: HTMLSelectElement;
  lineFnOptions: HTMLElement;
  lineStaticOptions: HTMLElement;
  lineAttrEl: HTMLSelectElement;
  linePaletteEl: HTMLSelectElement;
  linePalTrigger: HTMLButtonElement;
  linePalSwatch: HTMLElement;
  linePalMenu: HTMLElement;
  lineDomainMinEl: HTMLInputElement;
  lineDomainMaxEl: HTMLInputElement;
  lineReverseEl: HTMLInputElement;
  lineStaticEl: HTMLInputElement;
  lineStaticLabel: HTMLElement;
  lineWidthSliderEl: HTMLInputElement;
  lineWidthEl: HTMLInputElement;

  lngEl: HTMLInputElement;
  latEl: HTMLInputElement;
  zoomEl: HTMLInputElement;
  pitchEl: HTMLInputElement;
  bearingEl: HTMLInputElement;
  viewOut: HTMLTextAreaElement;
  layerOut: HTMLTextAreaElement;

  sqlSection: HTMLElement;
  sqlStatusEl: HTMLElement;
  sqlInputEl: HTMLTextAreaElement;

  aiSection: HTMLElement;
  aiChatEl: HTMLElement;
  aiInputEl: HTMLTextAreaElement;
  aiSendBtn: HTMLButtonElement;
  aiStatusEl: HTMLElement;
  aiSqlPreviewEl: HTMLElement;
}

const elementIds: Record<keyof DebugElements, string> = {
  layerSelect: 'dbg-layer-select',
  hexSection: 'dbg-hex-section',
  viewStateSection: 'dbg-viewstate-section',
  fillColorSection: 'fill-color-section',
  lineColorSection: 'line-color-section',
  filledEl: 'dbg-filled',
  strokedEl: 'dbg-stroked',
  extrudedEl: 'dbg-extruded',
  extrusionControls: 'dbg-extrusion-controls',
  elevAttrEl: 'dbg-elev-attr',
  elevScaleEl: 'dbg-elev-scale',
  opacitySliderEl: 'dbg-opacity-slider',
  opacityEl: 'dbg-opacity',
  fillFnEl: 'dbg-fill-fn',
  fillFnOptions: 'fill-fn-options',
  fillStaticOptions: 'fill-static-options',
  fillAttrEl: 'dbg-attr',
  fillPaletteEl: 'dbg-palette',
  fillPalTrigger: 'dbg-palette-trigger',
  fillPalSwatch: 'dbg-palette-swatch',
  fillPalMenu: 'dbg-palette-menu',
  fillDomainMinEl: 'dbg-domain-min',
  fillDomainMaxEl: 'dbg-domain-max',
  fillRangeMinEl: 'dbg-domain-range-min',
  fillRangeMaxEl: 'dbg-domain-range-max',
  fillStepsEl: 'dbg-steps',
  fillReverseEl: 'dbg-fill-reverse',
  fillNullEl: 'dbg-null-color',
  fillNullLabel: 'dbg-null-color-label',
  fillStaticEl: 'dbg-fill-static',
  fillStaticLabel: 'dbg-fill-static-label',
  lineFnEl: 'dbg-line-fn',
  lineFnOptions: 'line-fn-options',
  lineStaticOptions: 'line-static-options',
  lineAttrEl: 'dbg-line-attr',
  linePaletteEl: 'dbg-line-palette',
  linePalTrigger: 'dbg-line-palette-trigger',
  linePalSwatch: 'dbg-line-palette-swatch',
  linePalMenu: 'dbg-line-palette-menu',
  lineDomainMinEl: 'dbg-line-domain-min',
  lineDomainMaxEl: 'dbg-line-domain-max',
  lineReverseEl: 'dbg-line-reverse',
  lineStaticEl: 'dbg-line-static',
  lineStaticLabel: 'dbg-line-static-label',
  lineWidthSliderEl: 'dbg-line-width-slider',
  lineWidthEl: 'dbg-line-width',
  lngEl: 'dbg-lng',
  latEl: 'dbg-lat',
  zoomEl: 'dbg-zoom',
  pitchEl: 'dbg-pitch',
  bearingEl: 'dbg-bearing',
  viewOut: 'dbg-view-output',
  layerOut: 'dbg-output',
  sqlSection: 'sql-section',
  sqlStatusEl: 'sql-status',
  sqlInputEl: 'dbg-sql',
  aiSection: 'ai-section',
  aiChatEl: 'ai-chat',
  aiInputEl: 'ai-input',
  aiSendBtn: 'ai-send',
  aiStatusEl: 'ai-status',
  aiSqlPreviewEl: 'ai-sql-preview',
};

export function queryDebugElements(): DebugElements {
  const result = {} as DebugElements;
  for (const [key, id] of Object.entries(elementIds)) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`[FusedMaps] Debug panel missing element #${id}`);
    (result as any)[key] = el;
  }
  return result;
}


