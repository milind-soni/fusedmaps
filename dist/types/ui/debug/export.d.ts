/**
 * Debug panel export helpers
 *
 * Pure utilities used to generate "paste-back" Python snippets and compact config deltas.
 * Kept separate to reduce the size/coupling of `ui/debug.ts`.
 */
/**
 * Convert legacy color config (@@function format) to new clean format
 */
export declare function legacyColorToNewFormat(color: any): any;
/**
 * Convert legacy hexLayer/vectorLayer to new style format
 */
export declare function legacyStyleToNewFormat(legacy: any): any;
export declare function deepDelta(base: any, cur: any): any;
export declare function toPyLiteral(x: any, indent?: number): string;
