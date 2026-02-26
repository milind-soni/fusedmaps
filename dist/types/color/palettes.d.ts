/**
 * Color palette utilities using CartoColor
 *
 * CartoColor is loaded via CDN and available on window.cartocolor
 */
/**
 * Get colors from a CartoColor palette
 */
export declare function getPaletteColors(name: string, steps: number): string[] | null;
/**
 * Convert RGB array to CSS rgba string
 */
export declare function toRgba(arr: number[] | unknown, defaultAlpha?: number): string | null;
/**
 * Default fallback colors
 */
export declare const FALLBACK_CONTINUOUS_COLORS: string[];
export declare const FALLBACK_CATEGORICAL_COLORS: string[];
