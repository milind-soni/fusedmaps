/**
 * JSON Schema for LayerConfig
 *
 * This schema can be used by AI frameworks to validate layer configurations.
 */
export declare const layerSchema: {
    readonly $schema: "https://json-schema.org/draft/2020-12/schema";
    readonly $id: "https://fused.io/schemas/fusedmaps/layer.json";
    readonly title: "LayerConfig";
    readonly description: "Configuration for a single map layer";
    readonly type: "object";
    readonly required: readonly ["layerType"];
    readonly properties: {
        readonly id: {
            readonly type: "string";
            readonly description: "Unique layer identifier. Auto-generated if omitted (e.g., 'layer-1', 'layer-2').";
        };
        readonly name: {
            readonly type: "string";
            readonly description: "Display name shown in layer panel and legend. Defaults to id if omitted.";
        };
        readonly layerType: {
            readonly type: "string";
            readonly enum: readonly ["hex", "vector", "mvt", "raster", "pmtiles"];
            readonly description: "Type of layer: 'hex' for H3 hexagons, 'vector' for GeoJSON, 'mvt' for Mapbox Vector Tiles, 'raster' for tile/image overlays, 'pmtiles' for PMTiles format.";
        };
        readonly visible: {
            readonly type: "boolean";
            readonly default: true;
            readonly description: "Whether the layer is visible on the map.";
        };
        readonly data: {
            readonly description: "Inline data for hex or vector layers. For hex: array of objects with 'h3' field. For vector: GeoJSON FeatureCollection.";
        };
        readonly dataUrl: {
            readonly type: "string";
            readonly format: "uri";
            readonly description: "URL to external data file (GeoJSON, CSV, or Parquet). Alternative to inline 'data'.";
        };
        readonly tileUrl: {
            readonly type: "string";
            readonly description: "URL template for tile layers (MVT or raster). Use {z}/{x}/{y} placeholders.";
        };
        readonly style: {
            readonly type: "object";
            readonly description: "Visual styling options";
            readonly properties: {
                readonly fillColor: {
                    readonly description: "Fill color for polygons/hexagons. Can be a static color or data-driven color scale.";
                };
                readonly lineColor: {
                    readonly description: "Stroke/outline color.";
                };
                readonly opacity: {
                    readonly type: "number";
                    readonly minimum: 0;
                    readonly maximum: 1;
                    readonly default: 0.8;
                    readonly description: "Layer opacity (0 = transparent, 1 = opaque).";
                };
                readonly filled: {
                    readonly type: "boolean";
                    readonly default: true;
                    readonly description: "Whether to fill polygons.";
                };
                readonly stroked: {
                    readonly type: "boolean";
                    readonly default: true;
                    readonly description: "Whether to draw outlines.";
                };
                readonly extruded: {
                    readonly type: "boolean";
                    readonly default: false;
                    readonly description: "Whether to extrude polygons in 3D.";
                };
                readonly elevationAttr: {
                    readonly type: "string";
                    readonly description: "Data attribute to use for 3D extrusion height.";
                };
                readonly elevationScale: {
                    readonly type: "number";
                    readonly default: 1;
                    readonly description: "Multiplier for extrusion height.";
                };
                readonly lineWidth: {
                    readonly type: "number";
                    readonly default: 1;
                    readonly description: "Width of lines/strokes in pixels.";
                };
                readonly pointRadius: {
                    readonly type: "number";
                    readonly default: 5;
                    readonly description: "Radius of point markers in pixels.";
                };
            };
        };
        readonly tooltip: {
            readonly type: "array";
            readonly items: {
                readonly type: "string";
            };
            readonly description: "Property names to show in tooltip on hover.";
        };
    };
};
/**
 * Color scale schemas
 */
export declare const colorScaleSchema: {
    readonly continuous: {
        readonly type: "object";
        readonly required: readonly ["type", "attr"];
        readonly properties: {
            readonly type: {
                readonly const: "continuous";
                readonly description: "Use continuous color scale for numeric data.";
            };
            readonly attr: {
                readonly type: "string";
                readonly description: "Data attribute (property name) to map to color.";
            };
            readonly palette: {
                readonly type: "string";
                readonly enum: readonly ["Viridis", "Mint", "BluGrn", "Sunset", "Magenta", "SunsetDark", "Teal", "TealGrn", "Purp", "PurpOr", "Emrld", "OrYel", "Peach", "Burg", "RedOr", "BurgYl", "BluYl", "PinkYl", "DarkMint", "TealRose", "Temps", "Tropic", "Earth", "Fall", "Geyser"];
                readonly default: "Viridis";
                readonly description: "Color palette name from CartoColor.";
            };
            readonly domain: {
                readonly type: "array";
                readonly items: {
                    readonly type: "number";
                };
                readonly minItems: 2;
                readonly maxItems: 2;
                readonly description: "Value range [min, max] for the color scale. Auto-detected from data if omitted.";
            };
            readonly steps: {
                readonly type: "integer";
                readonly minimum: 2;
                readonly maximum: 12;
                readonly default: 7;
                readonly description: "Number of color steps in the scale.";
            };
            readonly reverse: {
                readonly type: "boolean";
                readonly default: false;
                readonly description: "Reverse the color palette direction.";
            };
        };
    };
    readonly categorical: {
        readonly type: "object";
        readonly required: readonly ["type", "attr"];
        readonly properties: {
            readonly type: {
                readonly const: "categorical";
                readonly description: "Use categorical colors for discrete categories.";
            };
            readonly attr: {
                readonly type: "string";
                readonly description: "Data attribute (property name) containing category values.";
            };
            readonly palette: {
                readonly type: "string";
                readonly enum: readonly ["Bold", "Prism", "Safe", "Vivid", "Pastel", "Antique"];
                readonly default: "Bold";
                readonly description: "Color palette name for categorical data.";
            };
            readonly categories: {
                readonly type: "array";
                readonly description: "Explicit list of category values. Auto-detected from data if omitted.";
            };
        };
    };
};
