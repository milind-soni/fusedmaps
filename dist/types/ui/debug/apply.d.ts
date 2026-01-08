/**
 * Debug panel "apply UI -> layer config + map style updates"
 *
 * Extracted from `ui/debug.ts` to reduce file size and make behavior testable in isolation.
 * This module mutates the in-memory layer config objects (same as legacy behavior).
 */
export interface DebugApplyElements {
    filledEl: HTMLInputElement;
    strokedEl: HTMLInputElement;
    extrudedEl: HTMLInputElement;
    extrusionControls: HTMLElement;
    elevAttrEl: HTMLSelectElement;
    elevScaleEl: HTMLInputElement;
    opacityEl: HTMLInputElement;
    fillFnEl: HTMLSelectElement;
    fillAttrEl: HTMLSelectElement;
    fillPaletteEl: HTMLSelectElement;
    fillReverseEl: HTMLInputElement;
    fillDomainMinEl: HTMLInputElement;
    fillDomainMaxEl: HTMLInputElement;
    fillStepsEl: HTMLInputElement;
    fillNullEl: HTMLInputElement;
    fillStaticEl: HTMLInputElement;
    lineFnEl: HTMLSelectElement;
    lineAttrEl: HTMLSelectElement;
    linePaletteEl: HTMLSelectElement;
    lineReverseEl: HTMLInputElement;
    lineDomainMinEl: HTMLInputElement;
    lineDomainMaxEl: HTMLInputElement;
    lineStaticEl: HTMLInputElement;
    lineWidthEl: HTMLInputElement;
}
export interface ApplyDebugUIOpts {
    map: mapboxgl.Map;
    layer: any;
    els: DebugApplyElements;
    updateLayerOutput: () => void;
    findDeckOverlayOnMap: () => void;
    rebuildDeck: () => void;
}
export declare function applyDebugUIToLayer(opts: ApplyDebugUIOpts): void;
