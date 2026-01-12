import type { HexLayerConfig, VectorLayerConfig } from '../../types';

type AnyLayer = (HexLayerConfig | VectorLayerConfig) & Record<string, any>;

export interface SqlPanelDeps {
  sqlSection: HTMLElement;
  sqlStatusEl: HTMLElement;
  sqlInputEl: HTMLTextAreaElement;
  getActiveLayer: () => AnyLayer | null;
  updateLayerOutput: () => void;
}

export interface SqlPanel {
  onTabActivated: () => void;
  syncFromLayer: (layer: AnyLayer | null) => void;
  applySql: (sql: string) => void;
  destroy: () => void;
}

function isDuckDbHexLayer(layer: AnyLayer | null): boolean {
  try {
    if (!layer) return false;
    const isHex = layer.layerType === 'hex';
    const isTile = !!layer.isTileLayer;
    const hasParquet = !!layer.parquetData || !!layer.parquetUrl;
    return isHex && !isTile && hasParquet;
  } catch (_) {
    return false;
  }
}

export function createSqlPanel(deps: SqlPanelDeps): SqlPanel {
  const { sqlSection, sqlStatusEl, sqlInputEl, getActiveLayer, updateLayerOutput } = deps;

  // SQL tab always owns visibility.
  try { sqlSection.style.display = 'block'; } catch (_) {}

  let sqlTypingTimer: any = null;

  // Optional CodeMirror (lazy-loaded)
  let sqlCM: any = null;
  let sqlCMLoading = false;
  let sqlCMBound = false;

  const getEditorValue = (): string => {
    try {
      if (sqlCM) return String(sqlCM.getValue() || '').trim();
    } catch (_) {}
    return String(sqlInputEl.value || '').trim();
  };

  let isUpdatingSql = false; // Guard against infinite loop

  const dispatchSqlUpdate = () => {
    if (isUpdatingSql) return; // Prevent re-entry

    const layer = getActiveLayer();
    if (!isDuckDbHexLayer(layer)) return;
    const sql = getEditorValue() || 'SELECT * FROM data';

    // Update the layer config (don't touch editor - would cause infinite loop)
    try { (layer as any).sql = sql; } catch (_) {}
    try { updateLayerOutput(); } catch (_) {}

    try { sqlStatusEl.textContent = 'typing...'; } catch (_) {}
    clearTimeout(sqlTypingTimer);
    sqlTypingTimer = setTimeout(() => {
      try {
        window.dispatchEvent(new CustomEvent('fusedmaps:sql:update', { detail: { layerId: layer!.id, sql } }));
      } catch (_) {}
    }, 500);
  };

  const bindCodeMirrorChange = () => {
    try {
      if (!sqlCM || sqlCMBound) return;
      sqlCMBound = true;
      sqlCM.on('change', () => dispatchSqlUpdate());
    } catch (_) {}
  };

  const loadCodeMirror = async () => {
    try {
      if (sqlCM || sqlCMLoading) return;
      sqlCMLoading = true;

      // If already present, mount immediately
      if ((window as any).CodeMirror) {
        try {
          const CM = (window as any).CodeMirror;
          sqlCM = CM.fromTextArea(sqlInputEl, {
            mode: 'text/x-sql',
            theme: 'material-darker',
            lineNumbers: false,
            gutters: [],
            lineWrapping: true,
            indentUnit: 2,
            tabSize: 2,
            indentWithTabs: false,
          });
          sqlCM.setSize('100%', '180px');
        } catch (_) {}
        bindCodeMirrorChange();
        return;
      }

      const ensureCss = (href: string) => {
        if (document.querySelector(`link[href="${href}"]`)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
      };
      ensureCss('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css');
      ensureCss('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/material-darker.min.css');

      const loadScript = (src: string) =>
        new Promise<void>((resolve, reject) => {
          if (document.querySelector(`script[src="${src}"]`)) return resolve();
          const s = document.createElement('script');
          s.src = src;
          s.async = true;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error(`failed to load ${src}`));
          document.head.appendChild(s);
        });

      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/sql/sql.min.js');

      try {
        const CM = (window as any).CodeMirror;
        if (!CM) return;
        sqlCM = CM.fromTextArea(sqlInputEl, {
          mode: 'text/x-sql',
          theme: 'material-darker',
          lineNumbers: false,
          gutters: [],
          lineWrapping: true,
          indentUnit: 2,
          tabSize: 2,
          indentWithTabs: false,
        });
        sqlCM.setSize('100%', '180px');
      } catch (_) {}
      bindCodeMirrorChange();
    } finally {
      sqlCMLoading = false;
    }
  };

  // textarea fallback (when CodeMirror isn't mounted)
  const onTextareaInput = () => dispatchSqlUpdate();
  try { sqlInputEl.addEventListener('input', onTextareaInput); } catch (_) {}

  // status updates from runtime
  const onSqlStatus = (evt: any) => {
    try {
      const d = evt?.detail || {};
      const layerId = String(d.layerId || '');
      const status = String(d.status || '');
      const active = getActiveLayer();
      if (!active || String(active.id) !== layerId) return;
      sqlStatusEl.textContent = status;
    } catch (_) {}
  };
  try { window.addEventListener('fusedmaps:sql:status', onSqlStatus as any); } catch (_) {}

  const syncFromLayer = (layer: AnyLayer | null) => {
    const enabled = isDuckDbHexLayer(layer);

    // Guard to prevent change events during sync
    isUpdatingSql = true;
    try {
      sqlInputEl.disabled = !enabled;
      if (enabled) {
        sqlInputEl.value = String((layer as any).sql || 'SELECT * FROM data');
        sqlInputEl.placeholder = 'SELECT * FROM data';
      } else {
        sqlInputEl.value = '';
        sqlInputEl.placeholder = 'Select a DuckDB (parquetUrl/parquetData) hex layer to enable SQL.';
      }
    } catch (_) {}

    try {
      if (sqlCM) {
        if (enabled) {
          sqlCM.setValue(String((layer as any).sql || 'SELECT * FROM data'));
          sqlCM.setOption('readOnly', false);
        } else {
          sqlCM.setValue('-- Select a DuckDB-backed hex layer to enable SQL');
          sqlCM.setOption('readOnly', 'nocursor');
        }
        try { sqlCM.refresh?.(); } catch (_) {}
      }
    } catch (_) {}
    isUpdatingSql = false;

    try { sqlStatusEl.textContent = enabled ? '' : 'disabled'; } catch (_) {}
  };

  const applySql = (sql: string) => {
    const layer = getActiveLayer();
    if (!isDuckDbHexLayer(layer)) return;

    // Guard to prevent change events during programmatic update
    isUpdatingSql = true;
    try {
      // Update textarea and CodeMirror
      sqlInputEl.value = sql;
      if (sqlCM) {
        sqlCM.setValue(sql);
      }
      // Update layer config
      (layer as any).sql = sql;
      updateLayerOutput();
    } catch (_) {}
    isUpdatingSql = false;

    // Dispatch update event
    try {
      window.dispatchEvent(new CustomEvent('fusedmaps:sql:update', { detail: { layerId: layer!.id, sql } }));
    } catch (_) {}
  };

  return {
    onTabActivated: () => {
      loadCodeMirror().then(() => {
        try { sqlCM?.refresh?.(); } catch (_) {}
      });
    },
    syncFromLayer,
    applySql,
    destroy: () => {
      try { clearTimeout(sqlTypingTimer); } catch (_) {}
      try { sqlInputEl.removeEventListener('input', onTextareaInput); } catch (_) {}
      try { window.removeEventListener('fusedmaps:sql:status', onSqlStatus as any); } catch (_) {}
      try { sqlCM?.toTextArea?.(); } catch (_) {}
      sqlCM = null;
    }
  };
}

