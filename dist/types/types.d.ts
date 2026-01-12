import type { FeatureCollection } from 'geojson';
export interface ViewState {
    longitude: number;
    latitude: number;
    zoom: number;
    pitch?: number;
    bearing?: number;
}
/** Continuous color scale based on numeric attribute */
export interface ContinuousColor {
    type: 'continuous';
    attr: string;
    domain?: [number, number];
    palette: string;
    steps?: number;
    nullColor?: [number, number, number];
    reverse?: boolean;
    autoDomain?: boolean;
}
/** Categorical color based on string/enum attribute */
export interface CategoricalColor {
    type: 'categorical';
    attr: string;
    categories?: Array<string | {
        value: string | number;
        label: string;
    }>;
    labelAttr?: string;
    palette?: string;
    nullColor?: [number, number, number];
}
/** Color can be: config object, RGB array, or CSS string */
export type ColorValue = ContinuousColor | CategoricalColor | [number, number, number] | [number, number, number, number] | string;
export interface LegacyColorContinuous {
    '@@function': 'colorContinuous';
    attr: string;
    domain?: [number, number];
    colors: string;
    steps?: number;
    nullColor?: [number, number, number, number?];
    reverse?: boolean;
    autoDomain?: boolean;
    _dynamicDomain?: [number, number];
}
export interface LegacyColorCategories {
    '@@function': 'colorCategories';
    attr: string;
    categories?: Array<string | {
        value: string | number;
        label: string;
    }>;
    labelAttr?: string;
    colors?: string;
    nullColor?: [number, number, number, number?];
    _detectedCategories?: Array<{
        value: string | number;
        label: string;
    }>;
}
export type ColorConfig = LegacyColorContinuous | LegacyColorCategories | [number, number, number, number?] | string;
export interface LayerStyle {
    fillColor?: ColorValue;
    lineColor?: ColorValue;
    opacity?: number;
    filled?: boolean;
    stroked?: boolean;
    extruded?: boolean;
    elevationAttr?: string;
    elevationScale?: number;
    lineWidth?: number;
    pointRadius?: number;
}
export interface TileOptions {
    minZoom?: number;
    maxZoom?: number;
    zoomOffset?: number;
    tileSize?: number;
    maxRequests?: number;
}
interface BaseLayer {
    id: string;
    name: string;
    visible?: boolean;
    tooltip?: string[];
    dataRef?: string;
}
export interface HexLayer extends BaseLayer {
    layerType: 'hex';
    data?: Array<Record<string, unknown>>;
    tileUrl?: string;
    parquetUrl?: string;
    parquetData?: string;
    style?: LayerStyle;
    tile?: TileOptions;
    sql?: string;
    isTileLayer?: boolean;
}
export interface VectorLayer extends BaseLayer {
    layerType: 'vector';
    geojson?: FeatureCollection;
    style?: LayerStyle;
}
export interface MVTLayer extends BaseLayer {
    layerType: 'mvt';
    tileUrl: string;
    sourceLayer?: string;
    style?: LayerStyle;
    tile?: TileOptions;
}
export interface RasterLayer extends BaseLayer {
    layerType: 'raster';
    tileUrl?: string;
    imageUrl?: string;
    imageBounds?: [number, number, number, number];
    opacity?: number;
}
export interface PMTilesLayer extends BaseLayer {
    layerType: 'pmtiles';
    pmtilesUrl: string;
    pmtilesPath?: string;
    sourceLayer?: string;
    excludeSourceLayers?: string[];
    style?: LayerStyle;
    tile?: TileOptions;
    renderPoints?: boolean;
    renderLines?: boolean;
    renderPolygons?: boolean;
}
export type LayerConfig = HexLayer | VectorLayer | MVTLayer | RasterLayer | PMTilesLayer;
export type HexLayerConfig = any;
export type VectorLayerConfig = any;
export type MVTLayerConfig = any;
export type RasterLayerConfig = any;
export type PMTilesLayerConfig = any;
export type TileLayerConfig = TileOptions;
export type ColorContinuousConfig = LegacyColorContinuous;
export type ColorCategoriesConfig = LegacyColorCategories;
export interface HexLayerStyle {
    '@@type'?: string;
    filled?: boolean;
    stroked?: boolean;
    extruded?: boolean;
    elevationProperty?: string;
    elevationScale?: number;
    opacity?: number;
    pickable?: boolean;
    getFillColor?: ColorConfig;
    getLineColor?: ColorConfig;
    lineWidthMinPixels?: number;
    tooltipColumns?: string[];
    tooltipAttrs?: string[];
}
export interface VectorLayerStyle {
    '@@type'?: string;
    filled?: boolean;
    stroked?: boolean;
    extruded?: boolean;
    opacity?: number;
    pickable?: boolean;
    getFillColor?: ColorConfig;
    getLineColor?: ColorConfig;
    lineWidthMinPixels?: number;
    getLineWidth?: number;
    pointRadiusMinPixels?: number;
    pointRadius?: number;
    tooltipColumns?: string[];
    tooltipAttrs?: string[];
}
export interface LegacyHexLayerConfig extends BaseLayer {
    layerType: 'hex';
    data?: Array<Record<string, unknown>>;
    tileUrl?: string;
    isTileLayer?: boolean;
    hexLayer?: HexLayerStyle;
    tileLayerConfig?: TileOptions;
    parquetData?: string;
    parquetUrl?: string;
    sql?: string;
}
export interface LegacyVectorLayerConfig extends BaseLayer {
    layerType: 'vector';
    geojson?: FeatureCollection;
    vectorLayer?: VectorLayerStyle;
    fillColorConfig?: ColorConfig;
    fillColorRgba?: string;
    lineColorConfig?: ColorConfig;
    lineColorRgba?: string;
    lineWidth?: number;
    pointRadius?: number;
    isFilled?: boolean;
    isStroked?: boolean;
    opacity?: number;
}
export interface UIConfig {
    tooltip?: boolean;
    legend?: boolean;
    layerPanel?: boolean;
    screenshot?: boolean;
    basemapSwitcher?: boolean;
    theme?: 'dark' | 'light';
}
export type WidgetPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type WidgetSetting = WidgetPosition | false;
export interface WidgetsConfig {
    controls?: WidgetSetting;
    scale?: WidgetSetting;
    basemap?: WidgetSetting;
    layers?: WidgetSetting;
    legend?: WidgetSetting;
}
export interface MessagingConfig {
    broadcast?: {
        enabled?: boolean;
        channel?: string;
        dataset?: string;
    };
    sync?: {
        enabled?: boolean;
        channel?: string;
    };
    clickBroadcast?: {
        enabled?: boolean;
        channel?: string;
        messageType?: string;
        properties?: string[];
        includeCoords?: boolean;
        includeLayer?: boolean;
    };
    locationListener?: {
        enabled?: boolean;
        channel?: string;
        zoomOffset?: number;
        padding?: number;
        maxZoom?: number;
        idFields?: string[];
    };
}
export interface FusedMapsConfig {
    containerId?: string;
    mapboxToken: string;
    styleUrl: string;
    initialViewState: ViewState;
    layers: LayerConfig[];
    hasCustomView?: boolean;
    ui?: UIConfig;
    widgets?: WidgetsConfig;
    messaging?: MessagingConfig;
    highlightOnClick?: boolean;
    sidebar?: 'show' | 'hide';
}
export interface LayerState {
    config: LayerConfig;
    visible: boolean;
    order: number;
    geojson?: FeatureCollection;
}
export interface ILayerStore {
    get(layerId: string): LayerState | undefined;
    getAll(): LayerState[];
    getAllConfigs(): LayerConfig[];
    getVisibilityState(): Record<string, boolean>;
    setVisible(layerId: string, visible: boolean): void;
    add(config: LayerConfig, options?: {
        order?: number;
    }): LayerState;
    remove(layerId: string): boolean;
    update(layerId: string, changes: Partial<LayerConfig>): LayerState | undefined;
    moveUp(layerId: string): void;
    moveDown(layerId: string): void;
    on(event: string, callback: (event: unknown) => void): () => void;
}
export interface FusedMapsInstance {
    map: mapboxgl.Map;
    deckOverlay: unknown | null;
    store: ILayerStore;
    getState: () => FusedMapsState;
    dispatch: (action: FusedMapsAction | FusedMapsAction[]) => FusedMapsState;
    setLayerVisibility: (layerId: string, visible: boolean) => void;
    updateLegend: () => void;
    addLayer: (layerConfig: LayerConfig, options?: {
        order?: number;
    }) => LayerState | null;
    removeLayer: (layerId: string) => boolean;
    updateLayer: (layerId: string, changes: Partial<LayerConfig>) => LayerState | null | undefined;
    getLayer: (layerId: string) => LayerState | undefined;
    getLayers: () => LayerState[];
    moveLayerUp: (layerId: string) => void;
    moveLayerDown: (layerId: string) => void;
    destroy: () => void;
}
export interface LngLatBoundsLike {
    west: number;
    south: number;
    east: number;
    north: number;
}
export interface LayerSummary {
    id: string;
    name: string;
    layerType: LayerConfig['layerType'];
    visible: boolean;
    order: number;
    propertyKeys?: string[];
    tooltipColumns?: string[];
}
export interface FusedMapsState {
    viewState: ViewState;
    bounds?: LngLatBoundsLike;
    layers: LayerSummary[];
}
export type FusedMapsAction = {
    type: 'setViewState';
    viewState: Partial<ViewState>;
    options?: {
        duration?: number;
    };
} | {
    type: 'fitBounds';
    bounds: [number, number, number, number];
    options?: {
        padding?: number;
        maxZoom?: number;
        duration?: number;
    };
} | {
    type: 'setLayerVisibility';
    layerId: string;
    visible: boolean;
} | {
    type: 'updateLayer';
    layerId: string;
    changes: Partial<LayerConfig>;
} | {
    type: 'addLayer';
    layer: LayerConfig;
    options?: {
        order?: number;
    };
} | {
    type: 'removeLayer';
    layerId: string;
} | {
    type: 'moveLayerUp';
    layerId: string;
} | {
    type: 'moveLayerDown';
    layerId: string;
} | {
    type: 'updateLegend';
};
export interface TooltipData {
    layerName: string;
    properties: Record<string, unknown>;
    columns?: string[];
}
export interface LegendEntry {
    layerId: string;
    layerName: string;
    type: 'continuous' | 'categorical' | 'line';
    attr?: string;
    colors?: string[];
    domain?: [number, number];
    categories?: Array<{
        value: string | number;
        label: string;
        color: string;
    }>;
    lineColor?: string;
}
declare global {
    interface Window {
        FusedMaps: typeof import('./index');
        mapboxgl: typeof mapboxgl;
        h3: typeof h3;
        deck: unknown;
        cartocolor: Record<string, Record<number, string[]>>;
    }
    namespace mapboxgl {
        class Map {
            constructor(options: unknown);
            on(event: string, callback: (e?: unknown) => void): void;
            off(event: string, callback: (e?: unknown) => void): void;
            addSource(id: string, source: unknown): void;
            addLayer(layer: unknown): void;
            getSource(id: string): unknown;
            getLayer(id: string): unknown;
            removeLayer(id: string): void;
            removeSource(id: string): void;
            remove(): void;
            setLayoutProperty(layer: string, name: string, value: unknown): void;
            setPaintProperty(layer: string, name: string, value: unknown): void;
            getCenter(): {
                lng: number;
                lat: number;
            };
            getBounds(): {
                getWest(): number;
                getSouth(): number;
                getEast(): number;
                getNorth(): number;
                isEmpty(): boolean;
            };
            getZoom(): number;
            getPitch(): number;
            getBearing(): number;
            zoomIn(options?: unknown): void;
            zoomOut(options?: unknown): void;
            setCenter(center: [number, number]): void;
            setZoom(zoom: number): void;
            setPitch(pitch: number): void;
            setBearing(bearing: number): void;
            easeTo(options: unknown): void;
            jumpTo(options: unknown): void;
            fitBounds(bounds: unknown, options?: unknown): void;
            resize(): void;
            loaded(): boolean;
            getCanvas(): HTMLCanvasElement;
            getCanvasContainer(): HTMLElement;
            getStyle(): {
                layers?: unknown[];
            };
            addControl(control: unknown, position?: string): void;
            removeControl(control: unknown): void;
            queryRenderedFeatures(point: {
                x: number;
                y: number;
            }, options?: unknown): unknown[];
            moveLayer(layerId: string, beforeId?: string): void;
            dragPan: {
                enable(): void;
                disable(): void;
            };
            triggerRepaint?: () => void;
        }
        class LngLatBounds {
            extend(coord: [number, number]): void;
            isEmpty(): boolean;
        }
        class ScaleControl {
            constructor(options?: unknown);
        }
    }
    namespace h3 {
        function isValidCell(h3Index: string): boolean;
        function cellToBoundary(h3Index: string): [number, number][];
    }
}
export {};
