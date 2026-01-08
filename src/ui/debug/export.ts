/**
 * Debug panel export helpers
 *
 * Pure utilities used to generate "paste-back" Python snippets and compact config deltas.
 * Kept separate to reduce the size/coupling of `ui/debug.ts`.
 */

function isPlainObject(x: any) {
  return !!x && typeof x === 'object' && !Array.isArray(x);
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
  // Return only keys in `cur` that differ from `base`.
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
    // Special marker: allow embedding a raw Python symbol in the export, e.g. "@@py:df".
    // This lets users get `data=df` in the paste-back snippet (the browser can't infer var names).
    if (x.startsWith('@@py:')) {
      const sym = x.slice('@@py:'.length).trim();
      // Safety: only allow simple identifiers / dotted paths.
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
  // Fallback for anything else
  try {
    return JSON.stringify(String(x));
  } catch {
    return 'None';
  }
}


