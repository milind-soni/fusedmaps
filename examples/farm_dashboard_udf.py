@fused.udf
def udf(cache_age_max=0):
    """Dynamic dashboard with new clean config format"""

    # Load vector/geometry data (farm boundaries)
    farm_boundaries = fused.run("field_analysis_summary_2", cache_max_age=0)
    print("farms", len(farm_boundaries))

    # Load map utils (use latest version)
    map_utils = fused.load("https://github.com/milind-soni/fusedmaps/tree/main/")

    initialViewState = {
        "longitude": -84.06,
        "latitude": 32.03,
        "zoom": 13,
        "pitch": 0,
        "bearing": 0
    }

    # ============================================================
    # New Clean Config Format
    # ============================================================

    # Elevation - hex tile layer
    config_elevation = {
        "style": {
            "fillColor": {
                "type": "continuous",
                "attr": "data_avg",
                "domain": [80, 170],
                "palette": "Earth",
                "steps": 10,
                "autoDomain": True,
            },
            "lineColor": {
                "type": "continuous",
                "attr": "data_avg",
                "domain": [80, 170],
                "palette": "Earth",
                "steps": 10,
                "autoDomain": True,
            },
            "opacity": 1,
            "filled": True,
            "stroked": False,
        },
        "tile": {"minZoom": 0, "maxZoom": 19, "zoomOffset": -1},
        "tooltip": ["data_avg"],
    }

    # Slopes - hex tile layer
    config_slope = {
        "style": {
            "fillColor": {
                "type": "continuous",
                "attr": "max_slope_deg",
                "domain": [0, 15],
                "palette": "TealGrn",
                "steps": 15,
            },
            "lineColor": {
                "type": "continuous",
                "attr": "max_slope_deg",
                "domain": [0, 15],
                "palette": "TealGrn",
                "steps": 15,
            },
            "opacity": 1,
            "filled": True,
            "stroked": False,
        },
        "tile": {"minZoom": 0, "maxZoom": 19, "zoomOffset": -1},
        "tooltip": ["max_slope_deg"],
    }

    # Soil - hex tile layer (using RGB from properties)
    config_soil = {
        "style": {
            "fillColor": "@@=[properties.r,properties.g,properties.b]",
            "opacity": 1,
            "filled": True,
            "stroked": False,
        },
        "tile": {"minZoom": 0, "maxZoom": 19},
        "tooltip": ["taxsubgrp"],
    }

    # Yield - hex tile layer
    config_yield = {
        "style": {
            "fillColor": {
                "type": "continuous",
                "attr": "value",
                "palette": "cb_RdYlGn",
                "steps": 7,
                "nullColor": [184, 184, 184],
            },
            "lineColor": {
                "type": "continuous",
                "attr": "value",
                "domain": [0, 15],
                "palette": "TealGrn",
            },
            "opacity": 1,
            "filled": True,
            "stroked": False,
        },
        "tile": {"minZoom": 0, "maxZoom": 19, "zoomOffset": -2},
        "tooltip": ["value", "yield", "total_yield"],
    }

    # Satellite - raster layer
    config_satellite = {
        "style": {"opacity": 0.7}
    }

    # Farm boundaries - vector layer
    config_boundaries = {
        "style": {
            "fillColor": [200, 200, 200, 0],  # transparent fill (direct RGBA array)
            "lineColor": {
                "type": "categorical",  # must be "categorical", not "categories"
                "attr": "Terrain Category",
                "categories": [
                    "smooth - open",
                    "rough - open",
                    "smooth - broken up",
                    "rough - broken up",
                ],
                "palette": "Fall",
            },
            "opacity": 1,
            "filled": True,
            "stroked": True,
            "lineWidth": 3,
        },
        "tooltip": [
            "Area Hectares",
            "Crop Name Harvested",
            "Farmability Score",
            "Field Name",
            "Field Openness Score",
            "Median Vehicle Speed MPH",
            "Terrain Category",
            "Terrain Smoothness Score",
            "Total Wet Mass",
            "Total Yield"
        ],
    }

    # Return mixed hex + vector layers with widget positioning
    html = map_utils.deckgl_layers(
        layers=[
            # Vector layer (geometry boundaries)
            {
                "type": "vector",
                "data": farm_boundaries,
                "config": config_boundaries,
                "visible": True,
                "name": "Farm Boundaries",
            },
            # Slopes
            {
                "type": "hex",
                "tile_url": "https://udf.ai/fsh_5M663NGjouRG3DepAdZ9t2/run/tiles/{z}/{x}/{y}?dtype_out_vector=parquet",
                "config": config_slope,
                "visible": False,
                "name": "Slope",
            },
            # Tiled elevation
            {
                "type": "hex",
                "tile_url": "https://udf.ai/fsh_5M663NGjouRG3DepAdZ9t2/run/tiles/{z}/{x}/{y}?dtype_out_vector=parquet",
                "config": config_elevation,
                "visible": False,
                "name": "Elevation",
            },
            # Soil
            {
                "type": "hex",
                "tile_url": "https://udf.ai/fsh_4INmjtA4UBS7dehWkrKaJE/run/tiles/{z}/{x}/{y}?dtype_out_vector=parquet",
                "config": config_soil,
                "visible": False,
                "name": "Soil Type",
            },
            # Yield data
            {
                "type": "hex",
                "tile_url": "https://udf.ai/fsh_3ErLB7KouxSau3wrjiTRBj/run/tiles/{z}/{x}/{y}?dtype_out_vector=parquet",
                "config": config_yield,
                "visible": False,
                "name": "Yield",
            },
            # Satellite Image
            {
                "type": "raster",
                "tile_url": "https://udf.ai/fsh_5l9BCJ6LStZc2FhQH6Z2KR/run/tiles/{z}/{x}/{y}?dtype_out_raster=png",
                "config": config_satellite,
                "visible": False,
                "name": "Satellite Image",
            }
        ],
        basemap="satellite",
        theme="light",
        initialViewState=initialViewState,
        # Widget positioning (all defaults shown - customize as needed)
        widgets={
            "controls": "bottom-left",    # zoom/home/screenshot
            "scale": "bottom-left",       # scale bar
            "basemap": "bottom-left",     # basemap switcher
            "layers": "top-right",        # layer panel
            "legend": "bottom-right",     # color legend
        },
    )

    # Chain the utilities
    html = map_utils.enable_map_broadcast(html, channel="fused-bus")
    html = map_utils.enable_location_listener(html, zoom_offset=0, padding=40, max_zoom=16)
    html = map_utils.enable_hex_click_broadcast(html, channel="fused-bus")

    return html
