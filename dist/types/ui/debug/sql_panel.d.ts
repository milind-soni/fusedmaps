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
    destroy: () => void;
}
export declare function createSqlPanel(deps: SqlPanelDeps): SqlPanel;
export {};
