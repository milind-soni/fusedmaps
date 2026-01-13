@fused.udf
def udf(cache_age_max=0):
    """Dynamic dashboard"""

    # Load vector/geometry data (farm boundaries)
    farm_boundaries = fused.run("field_analysis_summary_2", cache_max_age=0)
    print("farms", len(farm_boundaries))

    # Load map utilities
    map_utils = fused.load("https://github.com/fusedio/udfs/tree/a4d07b7/community/milind/map_utils/")

    initialViewState = {
        "longitude": -84.06,
        "latitude": 32.03,
        "zoom": 13,
        "pitch": 0,
        "bearing": 0
    }

    # Elevation - new clean format
    config_elevation = {
        "style": {
            "fillColor": {
                "type": "continuous",
                "attr": "data_avg",
                "domain": [80, 170],
                "steps": 10,
                "palette": "Earth",
                "autoDomain": True
            },
            "lineColor": {
                "type": "continuous",
                "attr": "data_avg",
                "domain": [80, 170],
                "steps": 10,
                "palette": "Earth",
                "autoDomain": True
            },
            "filled": True,
            "stroked": False,
            "opacity": 1
        },
        "tile": {"minZoom": 0, "maxZoom": 19, "zoomOffset": -1},
        "tooltip": ["data_avg"]
    }

    # Slopes
    config_slope = {
        "style": {
            "fillColor": {
                "type": "continuous",
                "attr": "max_slope_deg",
                "domain": [0, 15],
                "palette": "TealGrn",
                "steps": 15
            },
            "lineColor": {
                "type": "continuous",
                "attr": "max_slope_deg",
                "domain": [0, 15],
                "palette": "TealGrn",
                "steps": 15
            },
            "filled": True,
            "stroked": False,
            "opacity": 1
        },
        "tile": {"minZoom": 0, "maxZoom": 19, "zoomOffset": -1},
        "tooltip": ["max_slope_deg"]
    }

    # Soil - RGB expression (keeps @@= syntax)
    config_soil = {
        "style": {
            "fillColor": "@@=[properties.r,properties.g,properties.b]",
            "filled": True,
            "stroked": False,
            "opacity": 1
        },
        "tile": {"minZoom": 0, "maxZoom": 19},
        "tooltip": ["taxsubgrp"]
    }

    # Yield
    config_yield = {
        "style": {
            "fillColor": {
                "type": "continuous",
                "attr": "value",
                "palette": "cb_RdYlGn",
                "steps": 7,
                "nullColor": [184, 184, 184]
            },
            "lineColor": {
                "type": "continuous",
                "attr": "value",
                "domain": [0, 15],
                "palette": "TealGrn"
            },
            "filled": True,
            "stroked": False,
            "opacity": 1
        },
        "tile": {"minZoom": 0, "maxZoom": 19, "zoomOffset": -2},
        "tooltip": ["value", "yield", "total_yield"]
    }

    # Satellite raster
    config_satellite = {
        "style": {"opacity": 0.7}
    }

    # Vector layer config (farm boundaries as outlines)
    config_boundaries = {
        "style": {
            "fillColor": {"nullColor": [200, 200, 200]},
            "lineColor": {
                "type": "categorical",
                "attr": "Terrain Category",
                "categories": [
                    "smooth - open",
                    "rough - open",
                    "smooth - broken up",
                    "rough - broken up"
                ],
                "palette": "Fall"
            },
            "filled": True,
            "stroked": True,
            "opacity": 0,
            "lineWidth": 3
        },
        "tooltip": [
            "Area Hectares", "Crop Name Harvested", "Farmability Score",
            "Field Name", "Field Openness Score", "Median Vehicle Speed MPH",
            "Terrain Category", "Terrain Smoothness Score", "Total Wet Mass", "Total Yield"
        ]
    }

    # Widget configuration
    # Positions: "top-left", "top-right", "bottom-left", "bottom-right"
    # Set to False to disable a widget
    widgets = {
        "controls": "bottom-left",   # zoom/home/screenshot buttons
        "scale": "bottom-left",      # scale bar
        "basemap": "bottom-left",    # basemap switcher (dark/light/satellite)
        "layers": "top-right",       # layer visibility toggle panel
        "legend": "bottom-right",    # color legend
        "geocoder": "top-center",           # location search (set to position to enable)
    }

    # Return mixed hex + vector layers
    # on_click and location_listener are enabled by default
    html = map_utils.deckgl_layers(
        layers=[
            # Vector layer (geometry boundaries)
            {
                "type": "vector",
                "data": farm_boundaries,
                "config": config_boundaries,
                "visible": True,
                "name": "Farm Boundaries"
            },
            # Slopes
            {
                "type": "hex",
                "tile_url": "https://udf.ai/fsh_5M663NGjouRG3DepAdZ9t2/run/tiles/{z}/{x}/{y}?dtype_out_vector=parquet",
                "config": config_slope,
                "visible": False,
                "name": "Slope"
            },
            # Tiled elevation
            {
                "type": "hex",
                "tile_url": "https://udf.ai/fsh_5M663NGjouRG3DepAdZ9t2/run/tiles/{z}/{x}/{y}?dtype_out_vector=parquet",
                "config": config_elevation,
                "visible": False,
                "name": "Elevation"
            },
            # Soil
            {
                "type": "hex",
                "tile_url": "https://udf.ai/fsh_4INmjtA4UBS7dehWkrKaJE/run/tiles/{z}/{x}/{y}?dtype_out_vector=parquet",
                "config": config_soil,
                "visible": False,
                "name": "Soil Type"
            },
            # Yield data
            {
                "type": "hex",
                "tile_url": "https://udf.ai/fsh_3ErLB7KouxSau3wrjiTRBj/run/tiles/{z}/{x}/{y}?dtype_out_vector=parquet",
                "config": config_yield,
                "visible": False,
                "name": "Yield"
            },
            # Satellite Image
            {
                "type": "raster",
                "tile_url": "https://udf.ai/fsh_5l9BCJ6LStZc2FhQH6Z2KR/run/tiles/{z}/{x}/{y}?dtype_out_raster=png",
                "config": config_satellite,
                "visible": False,
                "name": "Satellite Image"
            }
        ],
        basemap="satellite",
        theme="light",
        initialViewState=initialViewState,
        widgets=widgets,
        # on_click enabled by default (broadcasts to "fused-bus")
        # location_listener enabled by default
        location_listener={"channel": "fused-bus", "zoom_offset": 0, "padding": 40, "max_zoom": 16},
        sidebar=None  # Use sidebar="show" to enable debug panel
    )

    return html
