/**
 * Debug panel export helpers
 *
 * Pure utilities used to generate "paste-back" Python snippets and compact config deltas.
 */
/**
 * Pass-through for color config (already in new format with type: 'continuous' | 'categorical')
 */
export declare function colorToNewFormat(color: any): any;
/**
 * Convert a style object to the clean output format
 */
export declare function styleToNewFormat(style: any): any;
export declare function deepDelta(base: any, cur: any): any;
export declare function toPyLiteral(x: any, indent?: number): string;
