/**
 * Shared utility functions
 */

/**
 * Clamp a number between min and max
 */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Safely execute a function, swallowing errors
 */
export function safe(fn: () => void): void {
  try { fn(); } catch {}
}

/**
 * Parse hex color string to RGB array
 * @param hex - Color string like "#ff0000"
 * @param alpha - Optional alpha value (0-255)
 * @returns [r, g, b] or [r, g, b, a] array, or null if invalid
 */
export function parseHexColor(hex: string, alpha?: number): number[] | null {
  try {
    const c = String(hex || '').trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(c)) return null;
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    if (typeof alpha === 'number' && Number.isFinite(alpha)) {
      return [r, g, b, clamp(Math.round(alpha), 0, 255)];
    }
    return [r, g, b];
  } catch {
    return null;
  }
}

/**
 * Convert RGB array to hex string
 */
export function rgbToHex(rgb: number[]): string {
  if (!Array.isArray(rgb) || rgb.length < 3) return '#888888';
  return '#' + rgb.slice(0, 3)
    .map(x => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Format number with fixed decimal places
 */
export function fmt(n: number, digits: number): string {
  try {
    return Number.isFinite(n) ? n.toFixed(digits) : '';
  } catch {
    return '';
  }
}
