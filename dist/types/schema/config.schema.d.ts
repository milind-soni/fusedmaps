/**
 * JSON Schema for FusedMapsConfig
 *
 * This schema can be used by AI frameworks to validate map configurations.
 */
export declare const configSchema: {
    readonly $schema: "https://json-schema.org/draft/2020-12/schema";
    readonly $id: "https://fused.io/schemas/fusedmaps/config.json";
    readonly title: "FusedMapsConfig";
    readonly description: "Configuration for creating an interactive map with FusedMaps. Pass this to FusedMaps.createMap() to render a map.";
    readonly type: "object";
    readonly required: readonly ["layers"];
    readonly properties: {
        readonly center: {
            readonly type: "array";
            readonly items: {
                readonly type: "number";
            };
            readonly minItems: 2;
            readonly maxItems: 2;
            readonly description: "Map center as [longitude, latitude]. If omitted, map will auto-fit to layer data bounds.";
            readonly examples: readonly [readonly [-122.4194, 37.7749], readonly [0, 0]];
        };
        readonly zoom: {
            readonly type: "number";
            readonly minimum: 0;
            readonly maximum: 22;
            readonly default: 10;
            readonly description: "Initial zoom level (0 = world view, 22 = building level). Ignored if center is omitted (auto-fit mode).";
        };
        readonly pitch: {
            readonly type: "number";
            readonly minimum: 0;
            readonly maximum: 85;
            readonly default: 0;
            readonly description: "Map tilt angle in degrees (0 = top-down, 60 = oblique view).";
        };
        readonly bearing: {
            readonly type: "number";
            readonly minimum: -180;
            readonly maximum: 180;
            readonly default: 0;
            readonly description: "Map rotation in degrees (0 = north up).";
        };
        readonly layers: {
            readonly type: "array";
            readonly minItems: 0;
            readonly description: "Array of data layers to display on the map. Layers are rendered in order (first = bottom).";
        };
        readonly basemap: {
            readonly type: "string";
            readonly enum: readonly ["dark", "light", "streets", "satellite", "none"];
            readonly default: "dark";
            readonly description: "Base map style. Use 'none' for transparent background.";
        };
        readonly title: {
            readonly type: "string";
            readonly description: "Optional title displayed on the map.";
        };
        readonly ui: {
            readonly type: "object";
            readonly description: "UI component visibility settings.";
            readonly properties: {
                readonly legend: {
                    readonly type: "boolean";
                    readonly default: true;
                    readonly description: "Show color legend for data-driven layers.";
                };
                readonly layerPanel: {
                    readonly type: "boolean";
                    readonly default: true;
                    readonly description: "Show layer visibility toggle panel.";
                };
                readonly tooltip: {
                    readonly type: "boolean";
                    readonly default: true;
                    readonly description: "Show tooltips on feature hover.";
                };
                readonly controls: {
                    readonly type: "boolean";
                    readonly default: true;
                    readonly description: "Show zoom and navigation controls.";
                };
                readonly scale: {
                    readonly type: "boolean";
                    readonly default: true;
                    readonly description: "Show scale bar.";
                };
            };
        };
    };
};
/**
 * Example configurations for documentation
 */
export declare const configExamples: ({
    description: string;
    value: {
        center: number[];
        zoom: number;
        layers: {
            layerType: string;
            data: {
                h3: string;
                value: number;
            }[];
            style: {
                fillColor: {
                    type: string;
                    attr: string;
                    palette: string;
                };
            };
        }[];
    };
} | {
    description: string;
    value: {
        layers: {
            layerType: string;
            data: {
                type: string;
                features: {
                    type: string;
                    geometry: {
                        type: string;
                        coordinates: number[];
                    };
                    properties: {
                        type: string;
                    };
                }[];
            };
            style: {
                fillColor: {
                    type: string;
                    attr: string;
                    palette: string;
                };
            };
        }[];
        center?: undefined;
        zoom?: undefined;
    };
})[];
