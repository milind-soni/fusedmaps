import type { HexLayerConfig } from '../types';
import { toH3 } from '../layers/hex';
import type { FeatureCollection } from 'geojson';

// Default pinned DuckDB-WASM ESM version (can be overridden per runtime instance).
// User requested: https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.33.1-dev13.0/+esm
const DEFAULT_DUCKDB_WASM_VERSION = '1.33.1-dev13.0';

type DuckModule = any;
type DuckDb = any;
type DuckConn = any;

const duckModulePromisesByVersion = new Map<string, Promise<DuckModule>>();

function isSafeStructKey(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

function quoteIdent(name: string): string {
  // DuckDB uses standard SQL identifier quoting with double quotes.
  return `"${String(name).replace(/"/g, '""')}"`;
}

async function ensureDuckModule(version: string = DEFAULT_DUCKDB_WASM_VERSION): Promise<DuckModule> {
  const existing = duckModulePromisesByVersion.get(version);
  if (existing) return existing;
  const url = `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${version}/+esm`;
  const p = import(/* @vite-ignore */ url) as any;
  duckModulePromisesByVersion.set(version, p);
  return p;
}

function decodeBase64ToBytes(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

function sanitizeDuckRow(row: Record<string, unknown>): Record<string, unknown> {
  const hexCols = new Set(['hex', 'h3', 'index', 'id']);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(row)) {
    let v: any = (row as any)[k];
    if (typeof v === 'bigint') {
      if (hexCols.has(k.toLowerCase())) v = v.toString(16);
      else v = Number(v);
    }
    out[k] = v;
  }
  // Normalize hex id into `hex` if present in any common column.
  const rawHex: any = (out as any).hex ?? (out as any).h3 ?? (out as any).index ?? (out as any).id;
  const h = toH3(rawHex);
  if (h) out.hex = h;
  return out;
}

export class DuckDbSqlRuntime {
  private duck: DuckModule | null = null;
  private db: DuckDb | null = null;
  private conn: DuckConn | null = null;
  private tableByLayerId = new Map<string, string>(); // layer.id -> tableName
  private loadedTables = new Set<string>(); // tableName
  private version: string;
  private hasSpatial = false;

  constructor(opts?: { version?: string }) {
    this.version = opts?.version || DEFAULT_DUCKDB_WASM_VERSION;
  }

  get ready(): boolean {
    return !!this.conn;
  }

  async init(): Promise<void> {
    if (this.conn) return;
    this.duck = await ensureDuckModule(this.version);
    const duck = this.duck;

    const bundle = await duck.selectBundle(duck.getJsDelivrBundles());
    const workerSrc = await (await fetch(bundle.mainWorker)).text();
    const worker = new Worker(URL.createObjectURL(new Blob([workerSrc], { type: 'application/javascript' })));
    const db = new duck.AsyncDuckDB(new duck.ConsoleLogger(), worker);
    await db.instantiate(bundle.mainModule);
    const conn = await db.connect();

    // Optional: try to load H3 extension (ignored on failure).
    try { await conn.query('INSTALL h3 FROM community'); } catch (_) {}
    try { await conn.query('LOAD h3'); } catch (_) {}

    // Optional: spatial extension enables ST_AsGeoJSON + ST_GeomFromText so we can build GeoJSON in DuckDB.
    // (We still work without it; we just fall back to JS geometry.)
    try { await conn.query('INSTALL spatial'); } catch (_) {}
    try {
      await conn.query('LOAD spatial');
      this.hasSpatial = true;
    } catch (_) {
      this.hasSpatial = false;
    }

    this.db = db;
    this.conn = conn;
  }

  private layerTableName(layer: HexLayerConfig): string {
    const existing = this.tableByLayerId.get(layer.id);
    if (existing) return existing;
    const table = layer.id.replace(/-/g, '_');
    this.tableByLayerId.set(layer.id, table);
    return table;
  }

  async ensureLayerTable(layer: HexLayerConfig): Promise<string> {
    await this.init();
    if (!this.db || !this.conn) throw new Error('DuckDB not initialized');

    const tableName = this.layerTableName(layer);
    if (this.loadedTables.has(tableName)) return tableName;

    // Load parquet bytes
    let bytes: Uint8Array | null = null;
    if (layer.parquetData) {
      bytes = decodeBase64ToBytes(layer.parquetData);
    } else if (layer.parquetUrl) {
      const resp = await fetch(layer.parquetUrl);
      if (!resp.ok) throw new Error(`Failed to fetch parquetUrl (${resp.status})`);
      const ab = await resp.arrayBuffer();
      bytes = new Uint8Array(ab);
    }
    if (!bytes) throw new Error('Missing parquetData or parquetUrl for SQL layer');

    // Register and create table
    await this.db.registerFileBuffer(`${tableName}.parquet`, bytes);
    await this.conn.query(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_parquet('${tableName}.parquet')`);

    this.loadedTables.add(tableName);
    return tableName;
  }

  async runSql(layer: HexLayerConfig, sqlText: string): Promise<{ rows: Array<Record<string, unknown>>; count: number }> {
    await this.ensureLayerTable(layer);
    if (!this.conn) throw new Error('DuckDB not initialized');

    const tableName = this.layerTableName(layer);
    // Match map_utils.py semantics: "data" points at the current layer.
    await this.conn.query(`CREATE OR REPLACE VIEW data AS SELECT * FROM ${tableName}`);

    const sql = (sqlText || '').trim();
    const isSelectLike = /^(with|select)\b/i.test(sql);
    const query = isSelectLike ? sql : `SELECT * FROM data WHERE (${sql || '1=1'})`;

    const res = await this.conn.query(query);
    const arr = res.toArray() as any[];
    const rows = arr.map((r) => sanitizeDuckRow(r)).filter((r) => !!(r as any).hex);
    return { rows, count: rows.length };
  }

  async getMinMaxFromQuery(
    layer: HexLayerConfig,
    attr: string,
    sqlText: string
  ): Promise<{ min: number; max: number } | null> {
    await this.ensureLayerTable(layer);
    if (!this.conn) return null;

    const tableName = this.layerTableName(layer);
    await this.conn.query(`CREATE OR REPLACE VIEW data AS SELECT * FROM ${tableName}`);

    const sql = (sqlText || '').trim();
    const isSelectLike = /^(with|select)\b/i.test(sql);
    const query = isSelectLike ? sql : `SELECT * FROM data WHERE (${sql || '1=1'})`;

    const col = quoteIdent(attr);
    const res = await this.conn.query(`SELECT MIN(${col}) as min_val, MAX(${col}) as max_val FROM (${query}) AS q`);
    const row: any = (res.toArray() as any[])[0];
    if (!row) return null;
    let minVal: any = row.min_val;
    let maxVal: any = row.max_val;
    if (typeof minVal === 'bigint') minVal = Number(minVal);
    if (typeof maxVal === 'bigint') maxVal = Number(maxVal);
    if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) return null;
    return { min: minVal, max: maxVal };
  }

  /**
   * Build a GeoJSON FeatureCollection inside DuckDB when possible.
   *
   * Requirements:
   * - h3 extension available (h3_cell_to_boundary_wkt / h3_is_valid_cell)
   * - spatial extension available (ST_GeomFromText / ST_AsGeoJSON)
   * - H3 cell column is present and castable to BIGINT (typical for Parquet int64 hex ids)
   * - Column names are "safe" identifiers (for struct_pack); otherwise we fall back to JS.
   */
  async runSqlGeoJSON(
    layer: HexLayerConfig,
    sqlText: string
  ): Promise<{ geojson: FeatureCollection; count: number } | null> {
    await this.ensureLayerTable(layer);
    if (!this.conn) throw new Error('DuckDB not initialized');
    if (!this.hasSpatial) return null;

    const tableName = this.layerTableName(layer);
    await this.conn.query(`CREATE OR REPLACE VIEW data AS SELECT * FROM ${tableName}`);

    const sql = (sqlText || '').trim();
    const isSelectLike = /^(with|select)\b/i.test(sql);
    const query = isSelectLike ? sql : `SELECT * FROM data WHERE (${sql || '1=1'})`;

    // Discover columns cheaply (LIMIT 0) so we can build properties JSON.
    const schemaRes = await this.conn.query(`SELECT * FROM (${query}) AS q LIMIT 0`);
    const fields: any[] = schemaRes?.schema?.fields || [];
    const cols: string[] = fields.map((f: any) => String(f?.name || '')).filter(Boolean);

    const h3Candidates = ['hex', 'h3', 'index', 'id'];
    const h3Col = h3Candidates.find((c) => cols.includes(c)) || null;
    if (!h3Col) return null;

    // Only support simple identifier-like column names for now.
    if (!cols.every(isSafeStructKey)) return null;

    const propsExpr = `to_json(struct_pack(${cols.map((c) => `${c} := "${c}"`).join(', ')}))`;

    // Build FeatureCollection as a single JSON string (map_utils.py style)
    const q = `
      WITH q AS (${query})
      SELECT
        count(*)::BIGINT AS cnt,
        CASE
          WHEN count(*) = 0 THEN '{"type":"FeatureCollection","features":[]}'
          ELSE (
            '{"type":"FeatureCollection","features":[' ||
              string_agg(
                '{"type":"Feature","geometry":' ||
                  ST_AsGeoJSON(ST_GeomFromText(h3_cell_to_boundary_wkt(CAST("${h3Col}" AS BIGINT)))) ||
                ',"properties":' || ${propsExpr} || '}',
                ','
              ) ||
            ']}'
          )
        END AS gj
      FROM q
      WHERE "${h3Col}" IS NOT NULL
        AND h3_is_valid_cell(CAST("${h3Col}" AS BIGINT))
    `;

    const res = await this.conn.query(q);
    const row: any = (res.toArray() as any[])[0];
    if (!row) return { geojson: { type: 'FeatureCollection', features: [] } as any, count: 0 };

    let cnt: any = row.cnt;
    if (typeof cnt === 'bigint') cnt = Number(cnt);
    const gjStr: string = String(row.gj || '{"type":"FeatureCollection","features":[]}');
    const gj = JSON.parse(gjStr);
    return { geojson: gj as FeatureCollection, count: Number(cnt) || 0 };
  }

  async getMinMax(layer: HexLayerConfig, attr: string): Promise<{ min: number; max: number } | null> {
    await this.ensureLayerTable(layer);
    if (!this.conn) return null;
    const tableName = this.layerTableName(layer);
    await this.conn.query(`CREATE OR REPLACE VIEW data AS SELECT * FROM ${tableName}`);
    const res = await this.conn.query(`SELECT MIN("${attr}") as min_val, MAX("${attr}") as max_val FROM data`);
    const row: any = (res.toArray() as any[])[0];
    if (!row) return null;
    let minVal: any = row.min_val;
    let maxVal: any = row.max_val;
    if (typeof minVal === 'bigint') minVal = Number(minVal);
    if (typeof maxVal === 'bigint') maxVal = Number(maxVal);
    if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) return null;
    return { min: minVal, max: maxVal };
  }
}

// NOTE: We intentionally removed the JS geometry fallback for DuckDB SQL layers
// to keep the implementation simple and fully DuckDB-driven.


