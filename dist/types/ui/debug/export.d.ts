/**
 * Debug panel export helpers
 *
 * Pure utilities used to generate "paste-back" Python snippets and compact config deltas.
 * Kept separate to reduce the size/coupling of `ui/debug.ts`.
 */
export declare function deepDelta(base: any, cur: any): any;
export declare function toPyLiteral(x: any, indent?: number): string;
