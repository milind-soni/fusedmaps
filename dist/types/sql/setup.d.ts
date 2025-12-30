import type { FusedMapsConfig } from '../types';
export declare function setupDuckDbSql(map: mapboxgl.Map, config: FusedMapsConfig, visibilityState: Record<string, boolean>, onUiUpdate?: () => void): {
    destroy: () => void;
} | null;
