/**
 * Color palette utilities using CartoColor
 * 
 * CartoColor is loaded via CDN and available on window.cartocolor
 */

/**
 * Get colors from a CartoColor palette
 */
export function getPaletteColors(name: string, steps: number): string[] | null {
  const cartocolor = window.cartocolor;
  if (!cartocolor) return null;
  
  const pal = cartocolor[name];
  if (!pal) return null;
  
  // Find the best matching step count
  const keys = Object.keys(pal)
    .map(Number)
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);
  
  const best = keys.find(n => n >= steps) || keys[keys.length - 1];
  return pal[best] ? [...pal[best]] : null;
}

/**
 * Convert RGB array to CSS rgba string
 */
export function toRgba(arr: number[] | unknown, defaultAlpha?: number): string | null {
  if (!Array.isArray(arr) || arr.length < 3) return null;
  const [r, g, b] = arr as number[];
  const a = arr.length >= 4 ? (arr[3] as number) / 255 : (defaultAlpha ?? 1);
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * Default fallback colors
 */
export const FALLBACK_CONTINUOUS_COLORS = [
  '#e0f3db', '#ccebc5', '#a8ddb5', '#7bccc4', 
  '#4eb3d3', '#2b8cbe', '#0868ac', '#084081'
];

export const FALLBACK_CATEGORICAL_COLORS = [
  '#7F3C8D', '#11A579', '#3969AC', '#F2B701', '#E73F74',
  '#80BA5A', '#E68310', '#008695', '#CF1C90', '#f97b72'
];


