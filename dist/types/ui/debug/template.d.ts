/**
 * Debug panel DOM template + element lookup
 *
 * Keeps `ui/debug.ts` focused on behavior rather than giant HTML strings and querySelector boilerplate.
 */
export type SidebarMode = 'show' | 'hide' | null;
export declare const DEBUG_SHELL_ID = "debug-shell";
export declare function getDebugShellHtml(): string;
export interface DebugShell {
    shell: HTMLElement;
    panel: HTMLElement;
    toggle: HTMLElement;
    resizeHandle: HTMLElement;
}
export declare function ensureDebugShell(): DebugShell;
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
    fillExpressionInfo: HTMLElement;
    fillExpressionLabel: HTMLElement;
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
    lineExpressionInfo: HTMLElement;
    lineExpressionLabel: HTMLElement;
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
    pointSection: HTMLElement;
    pointRadiusSliderEl: HTMLInputElement;
    pointRadiusEl: HTMLInputElement;
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
    aiPromptRow: HTMLElement;
    aiPromptInput: HTMLInputElement;
    aiPromptBtn: HTMLButtonElement;
    aiPromptStatus: HTMLElement;
}
export declare function queryDebugElements(): DebugElements;
