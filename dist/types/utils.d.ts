/**
 * Shared utility functions
 */
/**
 * Clamp a number between min and max
 */
export declare function clamp(v: number, lo: number, hi: number): number;
/**
 * Safely execute a function, swallowing errors
 */
export declare function safe(fn: () => void): void;
/**
 * Parse hex color string to RGB array
 * @param hex - Color string like "#ff0000"
 * @param alpha - Optional alpha value (0-255)
 * @returns [r, g, b] or [r, g, b, a] array, or null if invalid
 */
export declare function parseHexColor(hex: string, alpha?: number): number[] | null;
/**
 * Convert RGB array to hex string
 */
export declare function rgbToHex(rgb: number[]): string;
/**
 * Format number with fixed decimal places
 */
export declare function fmt(n: number, digits: number): string;
