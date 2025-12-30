import type { HexLayerConfig } from '../types';
import type { FeatureCollection } from 'geojson';
export declare class DuckDbSqlRuntime {
    private duck;
    private db;
    private conn;
    private tableByLayerId;
    private loadedTables;
    private version;
    private hasSpatial;
    constructor(opts?: {
        version?: string;
    });
    get ready(): boolean;
    init(): Promise<void>;
    private layerTableName;
    ensureLayerTable(layer: HexLayerConfig): Promise<string>;
    runSql(layer: HexLayerConfig, sqlText: string): Promise<{
        rows: Array<Record<string, unknown>>;
        count: number;
    }>;
    getMinMaxFromQuery(layer: HexLayerConfig, attr: string, sqlText: string): Promise<{
        min: number;
        max: number;
    } | null>;
    /**
     * Build a GeoJSON FeatureCollection inside DuckDB when possible.
     *
     * Requirements:
     * - h3 extension available (h3_cell_to_boundary_wkt / h3_is_valid_cell)
     * - spatial extension available (ST_GeomFromText / ST_AsGeoJSON)
     * - H3 cell column is present and castable to BIGINT (typical for Parquet int64 hex ids)
     * - Column names are "safe" identifiers (for struct_pack); otherwise we fall back to JS.
     */
    runSqlGeoJSON(layer: HexLayerConfig, sqlText: string): Promise<{
        geojson: FeatureCollection;
        count: number;
    } | null>;
    getMinMax(layer: HexLayerConfig, attr: string): Promise<{
        min: number;
        max: number;
    } | null>;
}
