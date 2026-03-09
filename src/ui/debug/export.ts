/**
 * Debug panel export helpers
 *
 * Pure utilities used to generate "paste-back" Python snippets and compact config deltas.
 */

function isPlainObject(x: any) {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

/**
 * Convert a color config to the new clean format (no-op if already new format)
 */
export function colorToNewFormat(color: any): any {
  if (!color || typeof color !== 'object') return color;
  if (Array.isArray(color)) return color;
  // Already new format
  if (color.type === 'continuous' || color.type === 'categorical') return color;
  // Legacy @@function format - convert
  const fn = color['@@function'];
  if (fn === 'colorContinuous') {
    const result: any = { type: 'continuous', attr: color.attr, palette: color.palette || color.colors };
    if (color.domain) result.domain = color.domain;
    if (typeof color.steps === 'number') result.steps = color.steps;
    if (color.nullColor) result.nullColor = color.nullColor;
    if (color.reverse) result.reverse = color.reverse;
    return result;
  }
  if (fn === 'colorCategories') {
    const result: any = { type: 'categorical', attr: color.attr };
    if (color.palette || color.colors) result.palette = color.palette || color.colors;
    if (color.categories) result.categories = color.categories;
    if (color.labelAttr) result.labelAttr = color.labelAttr;
    if (color.nullColor) result.nullColor = color.nullColor;
    return result;
  }
  return color;
}

/**
 * Convert a style object to the clean output format
 */
export function styleToNewFormat(style: any): any {
  if (!style || typeof style !== 'object') return {};
  const out: any = {};
  if (style.fillColor !== undefined) out.fillColor = colorToNewFormat(style.fillColor);
  if (style.lineColor !== undefined) out.lineColor = colorToNewFormat(style.lineColor);
  if (typeof style.opacity === 'number') out.opacity = style.opacity;
  if (typeof style.filled === 'boolean') out.filled = style.filled;
  if (typeof style.stroked === 'boolean') out.stroked = style.stroked;
  if (typeof style.extruded === 'boolean') out.extruded = style.extruded;
  if (style.elevationAttr) out.elevationAttr = style.elevationAttr;
  if (typeof style.elevationScale === 'number') out.elevationScale = style.elevationScale;
  if (typeof style.lineWidth === 'number') out.lineWidth = style.lineWidth;
  if (typeof style.pointRadius === 'number') out.pointRadius = style.pointRadius;
  return out;
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!(k in b)) return false;
      if (!deepEqual(a[k], b[k])) return false;
    }
    return true;
  }
  return false;
}

export function deepDelta(base: any, cur: any): any {
  if (deepEqual(base, cur)) return undefined;
  if (Array.isArray(cur)) return cur;
  if (!isPlainObject(cur)) return cur;
  const out: any = {};
  for (const k of Object.keys(cur)) {
    const d = deepDelta(base?.[k], cur[k]);
    if (d !== undefined) out[k] = d;
  }
  return Object.keys(out).length ? out : undefined;
}

export function toPyLiteral(x: any, indent = 0): string {
  const pad = (n: number) => '  '.repeat(n);
  const next = indent + 1;

  if (x === null || x === undefined) return 'None';
  const t = typeof x;
  if (t === 'boolean') return x ? 'True' : 'False';
  if (t === 'number') return Number.isFinite(x) ? String(x) : 'None';
  if (t === 'string') {
    if (x.startsWith('@@py:')) {
      const sym = x.slice('@@py:'.length).trim();
      if (/^[A-Za-z_][A-Za-z0-9_\\.]*$/.test(sym)) return sym;
    }
    return JSON.stringify(x);
  }
  if (Array.isArray(x)) {
    if (!x.length) return '[]';
    const items = x.map((v) => `${pad(next)}${toPyLiteral(v, next)}`);
    return `[\n${items.join(',\n')}\n${pad(indent)}]`;
  }
  if (isPlainObject(x)) {
    const keys = Object.keys(x);
    if (!keys.length) return '{}';
    const items = keys.map((k) => `${pad(next)}${JSON.stringify(k)}: ${toPyLiteral((x as any)[k], next)}`);
    return `{\n${items.join(',\n')}\n${pad(indent)}}`;
  }
  try {
    return JSON.stringify(String(x));
  } catch {
    return 'None';
  }
}
