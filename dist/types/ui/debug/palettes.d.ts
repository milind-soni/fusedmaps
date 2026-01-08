/**
 * Debug panel palette dropdown helpers
 *
 * Encapsulates cartocolor palette listing + dropdown wiring (open/close, rebuild swatches).
 * Kept separate to reduce the size/coupling of `ui/debug.ts`.
 */
export declare function getPaletteNames(): string[];
export declare function setPaletteOptions(sel: HTMLSelectElement, palettes: string[]): void;
export interface PaletteDropdown {
    refresh: () => void;
    destroy: () => void;
}
interface DropdownOpts {
    palettes: string[];
    selectEl: HTMLSelectElement;
    menuEl: HTMLElement;
    swatchEl: HTMLElement;
    triggerEl: HTMLButtonElement;
    getSteps: () => number;
    getReverse: () => boolean;
    onPicked: () => void;
    closeAll: () => void;
}
export declare function createPaletteDropdownManager(palettes: string[]): {
    attach: (opts: Omit<DropdownOpts, 'palettes' | 'closeAll'>) => PaletteDropdown;
    refreshAll: () => void;
    destroy: () => void;
};
export {};
