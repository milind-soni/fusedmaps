/**
 * Build Mapbox GL style expressions from color configurations
 */

import type { ColorConfig, ColorContinuousConfig, ColorCategoriesConfig } from '../types';
import { getPaletteColors, FALLBACK_CONTINUOUS_COLORS, FALLBACK_CATEGORICAL_COLORS } from './palettes';

interface CategoryPair {
  value: string | number;
  label: string;
}

/**
 * Extract unique categories from data for an attribute
 */
export function getUniqueCategories(
  data: Array<Record<string, unknown>> | undefined,
  attr: string,
  labelAttr?: string
): CategoryPair[] {
  const seen = new Map<string | number, string>();
  
  (data || []).forEach(d => {
    const val = d?.[attr] ?? (d as any)?.properties?.[attr];
    if (val != null && val !== '' && val !== 'null') {
      if (!seen.has(val as string | number)) {
        const label = labelAttr 
          ? (d?.[labelAttr] ?? (d as any)?.properties?.[labelAttr] ?? val) as string
          : val as string;
        seen.set(val as string | number, String(label));
      }
    }
  });
  
  // Sort by value
  const sorted = [...seen.entries()].sort((a, b) => {
    if (typeof a[0] === 'number' && typeof b[0] === 'number') return a[0] - b[0];
    return String(a[0]).localeCompare(String(b[0]));
  });
  
  return sorted.map(([value, label]) => ({ value, label }));
}

/**
 * Build a Mapbox GL color expression from a color config
 */
export function buildColorExpr(
  cfg: ColorConfig | undefined,
  data?: Array<Record<string, unknown>>
): unknown | null {
  if (!cfg) return null;
  
  // Handle static RGB array
  if (Array.isArray(cfg)) {
    return null; // Will use toRgba elsewhere
  }
  
  // Handle string color
  if (typeof cfg === 'string') {
    return cfg;
  }
  
  // Handle color functions
  const fnType = (cfg as any)['@@function'];
  const attr = (cfg as any).attr;
  
  if (!fnType || !attr) return null;
  
  // Handle colorCategories
  if (fnType === 'colorCategories') {
    return buildCategoricalExpr(cfg as ColorCategoriesConfig, data);
  }
  
  // Handle colorContinuous
  if (fnType === 'colorContinuous') {
    return buildContinuousExpr(cfg as ColorContinuousConfig);
  }
  
  return null;
}

/**
 * Build a categorical color expression
 */
function buildCategoricalExpr(
  cfg: ColorCategoriesConfig,
  data?: Array<Record<string, unknown>>
): unknown {
  // Get categories - either from config or auto-detect from data
  const domainCats: any[] = Array.isArray((cfg as any).domain) ? (cfg as any).domain : [];
  let catPairs: CategoryPair[] = cfg.categories
    ? cfg.categories.map(c =>
        typeof c === 'object' ? c : { value: c, label: String(c) }
      )
    : domainCats.length
      ? domainCats.map((c) => ({ value: c as any, label: String((c as any)?.label ?? c) }))
      : getUniqueCategories(data, cfg.attr, cfg.labelAttr);
  
  if (!catPairs.length) return 'rgba(128,128,128,0.5)';
  
  // Get palette colors
  const paletteName = cfg.colors || 'Bold';
  let colors = getPaletteColors(paletteName, Math.max(catPairs.length, 3));
  if (!colors || !colors.length) {
    colors = FALLBACK_CATEGORICAL_COLORS;
  }
  
  // Fallback color for null values
  const fallback = cfg.nullColor 
    ? `rgb(${cfg.nullColor.slice(0, 3).join(',')})` 
    : 'rgba(128,128,128,0.5)';
  
  // Build match expression: ['match', ['get', attr], val1, color1, val2, color2, ..., fallback]
  const expr: unknown[] = ['match', ['get', cfg.attr]];
  catPairs.forEach((cat, i) => {
    expr.push(cat.value);
    expr.push(colors![i % colors!.length]);
  });
  expr.push(fallback);
  
  // Store detected categories for legend
  (cfg as any)._detectedCategories = catPairs;
  
  return expr;
}

/**
 * Build a continuous color expression (interpolate)
 */
function buildContinuousExpr(cfg: ColorContinuousConfig): unknown {
  if (!cfg.domain?.length) return null;

  const [d0, d1] = cfg.domain;
  const isReversed = d0 > d1;
  let domain = isReversed ? [d1, d0] : [d0, d1];

  // Handle edge case where domain min equals max (single value or all same values)
  // Expand domain slightly so interpolation works
  if (domain[0] === domain[1]) {
    const val = domain[0];
    const epsilon = Math.abs(val) > 0 ? Math.abs(val) * 0.1 : 1;
    domain = [val - epsilon, val + epsilon];
  }
  const wantsReverse = !!(cfg as any).reverse;

  const steps = cfg.steps || 7;
  const paletteName = cfg.colors || 'TealGrn';

  // Null color - default to gray
  const nullColor = cfg.nullColor
    ? `rgb(${cfg.nullColor.slice(0, 3).join(',')})`
    : 'rgb(184,184,184)';

  let colors = getPaletteColors(paletteName, steps);
  if (!colors || !colors.length) {
    // Fallback gradient with null handling
    return [
      'case',
      ['==', ['get', cfg.attr], null], nullColor,
      ['interpolate', ['linear'], ['get', cfg.attr],
        domain[0], 'rgb(237,248,251)',
        domain[1], 'rgb(0,109,44)'
      ]
    ];
  }

  // `reverse` flips palette direction (low↔high). If the domain itself is reversed,
  // we already normalize it, so we invert the meaning of `reverse`.
  const shouldReverse = isReversed ? !wantsReverse : wantsReverse;
  if (shouldReverse) colors = [...colors].reverse();

  // Build interpolate expression
  const interpolateExpr: unknown[] = ['interpolate', ['linear'], ['get', cfg.attr]];
  colors.forEach((c, i) => {
    const value = domain[0] + (domain[1] - domain[0]) * i / (colors!.length - 1);
    interpolateExpr.push(value);
    interpolateExpr.push(c);
  });

  // Wrap with case expression to handle null values
  return [
    'case',
    ['==', ['get', cfg.attr], null], nullColor,
    interpolateExpr
  ];
}


