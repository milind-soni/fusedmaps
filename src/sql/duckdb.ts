import type { HexLayerConfig } from '../types';
import { toH3, hexToGeoJSON } from '../layers/hex';
import type { FeatureCollection } from 'geojson';

const DEFAULT_DUCKDB_WASM_VERSION = '1.29.1-dev132.0';

type DuckModule = any;
type DuckDb = any;
type DuckConn = any;

let duckModulePromise: Promise<DuckModule> | null = null;

async function ensureDuckModule(version: string = DEFAULT_DUCKDB_WASM_VERSION): Promise<DuckModule> {
  if (duckModulePromise) return duckModulePromise;
  const url = `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${version}/+esm`;
  duckModulePromise = import(/* @vite-ignore */ url) as any;
  return duckModulePromise;
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

export function rowsToHexGeoJSON(rows: Array<Record<string, unknown>>): FeatureCollection {
  return hexToGeoJSON(rows) as any;
}


