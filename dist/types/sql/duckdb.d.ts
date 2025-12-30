import type { HexLayerConfig } from '../types';
import type { FeatureCollection } from 'geojson';
export declare class DuckDbSqlRuntime {
    private duck;
    private db;
    private conn;
    private tableByLayerId;
    private loadedTables;
    private version;
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
    getMinMax(layer: HexLayerConfig, attr: string): Promise<{
        min: number;
        max: number;
    } | null>;
}
export declare function rowsToHexGeoJSON(rows: Array<Record<string, unknown>>): FeatureCollection;
