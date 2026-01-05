import type { FeatureCollection } from 'geojson';
export interface ViewState {
    longitude: number;
    latitude: number;
    zoom: number;
    pitch?: number;
    bearing?: number;
}
export interface ColorContinuousConfig {
    '@@function': 'colorContinuous';
    attr: string;
    domain: [number, number];
    colors: string;
    steps?: number;
    nullColor?: [number, number, number, number?];
    reverse?: boolean;
}
export interface ColorCategoriesConfig {
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
export type ColorConfig = ColorContinuousConfig | ColorCategoriesConfig | [number, number, number, number?] | string;
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
export interface RasterLayerStyle {
    opacity?: number;
}
export interface TileLayerConfig {
    tileSize?: number;
    minZoom?: number;
    maxZoom?: number;
    zoomOffset?: number;
    maxRequests?: number;
    refinementStrategy?: 'best-available' | 'no-overlap' | string;
}
export interface BaseLayerConfig {
    id: string;
    name: string;
    visible?: boolean;
    tooltipColumns?: string[];
    dataRef?: string;
}
export interface HexLayerConfig extends BaseLayerConfig {
    layerType: 'hex';
    data?: Array<Record<string, unknown>>;
    tileUrl?: string;
    isTileLayer?: boolean;
    hexLayer?: HexLayerStyle;
    tileLayerConfig?: TileLayerConfig;
    parquetData?: string;
    parquetUrl?: string;
    sql?: string;
    fillDomainFromUser?: boolean;
}
export interface VectorLayerConfig extends BaseLayerConfig {
    layerType: 'vector';
    geojson?: FeatureCollection;
    tileUrl?: string;
    sourceLayer?: string;
    vectorLayer?: VectorLayerStyle;
    fillColorConfig?: ColorConfig;
    fillColorRgba?: string;
    colorAttr?: string;
    lineColorConfig?: ColorConfig;
    lineColorRgba?: string;
    lineColorAttr?: string;
    lineWidth?: number;
    pointRadius?: number;
    isFilled?: boolean;
    isStroked?: boolean;
    opacity?: number;
    fillDomainFromUser?: boolean;
}
export interface MVTLayerConfig extends BaseLayerConfig {
    layerType: 'mvt';
    tileUrl: string;
    sourceLayer?: string;
    minzoom?: number;
    maxzoom?: number;
    fillColor?: string;
    fillColorConfig?: ColorConfig;
    fillOpacity?: number;
    isFilled?: boolean;
    lineColor?: string;
    lineColorConfig?: ColorConfig;
    lineWidth?: number;
    isExtruded?: boolean;
    extrusionOpacity?: number;
    heightProperty?: string;
    heightMultiplier?: number;
    config?: Record<string, unknown>;
    fillDomainFromUser?: boolean;
}
export interface RasterLayerConfig extends BaseLayerConfig {
    layerType: 'raster';
    tileUrl?: string;
    imageUrl?: string;
    imageBounds?: [number, number, number, number];
    rasterLayer?: RasterLayerStyle;
    opacity?: number;
}
export interface PMTilesLayerConfig extends BaseLayerConfig {
    layerType: 'pmtiles';
    pmtilesUrl: string;
    pmtilesPath?: string;
    sourceLayer?: string;
    excludeSourceLayers?: string[];
    minzoom?: number;
    maxzoom?: number;
    fillColorConfig?: ColorConfig;
    fillOpacity?: number;
    isFilled?: boolean;
    lineColorConfig?: ColorConfig;
    lineWidth?: number;
    pointRadiusMinPixels?: number;
    colorAttribute?: string;
    renderPoints?: boolean;
    renderLines?: boolean;
    renderPolygons?: boolean;
    vectorLayer?: VectorLayerStyle;
    fillDomainFromUser?: boolean;
}
export type LayerConfig = HexLayerConfig | VectorLayerConfig | MVTLayerConfig | RasterLayerConfig | PMTilesLayerConfig;
export interface UIConfig {
    tooltip?: boolean;
    legend?: boolean;
    layerPanel?: boolean;
    screenshot?: boolean;
    theme?: 'dark' | 'light';
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
    hasTileLayers?: boolean;
    hasMVTLayers?: boolean;
    hasSQLLayers?: boolean;
    ui?: UIConfig;
    messaging?: MessagingConfig;
    highlightOnClick?: boolean;
    palettes?: string[];
    /**
     * Sidebar / inspector panel.
     * - undefined: do not mount sidebar at all (no toggle).
     * - "show": mount and show.
     * - "hide": mount but start collapsed (toggle can open it).
     */
    sidebar?: 'show' | 'hide';
    /** @deprecated use `sidebar` */
    debug?: boolean;
}
export interface LayerState {
    config: LayerConfig;
    visible: boolean;
    order: number;
    geojson?: import('geojson').FeatureCollection;
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
    /** Access to the layer store for advanced operations */
    store: ILayerStore;
    setLayerVisibility: (layerId: string, visible: boolean) => void;
    updateLegend: () => void;
    /** Add a new layer at runtime */
    addLayer: (layerConfig: LayerConfig, options?: {
        order?: number;
    }) => LayerState;
    /** Remove a layer by ID */
    removeLayer: (layerId: string) => boolean;
    /** Update a layer's configuration */
    updateLayer: (layerId: string, changes: Partial<LayerConfig>) => LayerState | undefined;
    /** Get a layer by ID */
    getLayer: (layerId: string) => LayerState | undefined;
    /** Get all layers */
    getLayers: () => LayerState[];
    /** Move layer up in render order (renders on top) */
    moveLayerUp: (layerId: string) => void;
    /** Move layer down in render order (renders below) */
    moveLayerDown: (layerId: string) => void;
    destroy: () => void;
}
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
