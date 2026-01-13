common = fused.load("https://github.com/fusedio/udfs/tree/f430c25/public/common/")

@fused.udf
def udf(
    label: str = "Select Field",
    locations: list = None,
    name_field: str = "Field Name",
    geometry_field: str = "geometry",
    default_location_name: str = None,
    channel: str = "fused-bus",
):

    import json
    # data = fused.run(
    #     'minor_brothers_farm_boundaries_geojson_2', 
    #     path='s3://fused-users/fused/max/scoped_data/minor_brothers_farm_boundaries.geojson'
    # )

    # Backup to select a from all field names instead 
    data = fused.run("field_analysis_summary_2")
        
    # Convert GeoDataFrame rows into locations if not explicitly provided
    if locations is None:
        if data is None:
            raise ValueError("Either provide `locations` or pass a GeoDataFrame via `data`.")
        if name_field not in data.columns:
            raise ValueError(f"`name_field` '{name_field}' not found in data columns.")
        if geometry_field not in data.columns:
            raise ValueError(f"`geometry_field` '{geometry_field}' not found in data columns.")
        
        locations = []
        for idx, row in data.iterrows():
            geom = row[geometry_field]
            if geom is None or not hasattr(geom, "bounds"):
                continue
            min_x, min_y, max_x, max_y = geom.bounds
            name = str(row[name_field]) if row[name_field] is not None else f"Location {idx}"
            locations.append({
                "name": name,
                "bounds": [float(min_x), float(min_y), float(max_x), float(max_y)]
            })
        locations.sort(key=lambda loc: loc["name"])
    
    # Validate locations
    if not locations or not isinstance(locations, list):
        raise ValueError("locations must be a non-empty list")
    
    for loc in locations:
        if not isinstance(loc, dict):
            raise ValueError("Each location must be a dictionary")
        if "name" not in loc:
            raise ValueError("Each location must have a 'name' field")
        if "bounds" not in loc:
            raise ValueError("Each location must have a 'bounds' field [west, south, east, north]")
        bounds = loc["bounds"]
        if not isinstance(bounds, (list, tuple)) or len(bounds) != 4:
            raise ValueError(f"bounds must be [west, south, east, north], got: {bounds}")
    
    LOCATIONS_JS = json.dumps(locations, ensure_ascii=False)
    DEFAULT_NAME_JS = json.dumps(default_location_name)
    
    html = f"""<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0;
    padding: 20px;
    min-height: 100%;
    background: #E2E9EF;
    color: #323131;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }}
  label {{
    font-size: 16px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #323131;
    font-weight: 600;
    margin-bottom: 4px;
  }}
  label:empty {{ display: none; }}
  .hint-text {{
    font-size: 13px;
    color: #666;
    margin: -8px 0 8px 0;
    font-weight: 400;
  }}
  .select-wrapper {{
    position: relative;
    width: 100%;
  }}
  select {{
    width: 100%;
    padding: 10px 36px 10px 14px;
    border-radius: 6px;
    border: 1px solid #424242;
    background: #323131;
    color: #FFFFFF;
    font-size: 14px;
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }}
  select:hover {{
    background: #FFFFFF;
    border-color: #7C9BB6;
  }}
  select:focus {{
    outline: none;
    border-color: #7C9BB6;
  }}
  select option {{
    color: #1a1a1a;
    background: #7C9BB6;
    padding: 8px;
  }}
  .chevron {{
    pointer-events: none;
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
  }}
</style>
</head>
<body>
<label for="sb">{label}</label>
<p class="hint-text">Selected field will appear on the map</p>
<div class="select-wrapper">
  <select id="sb"></select>
  <span class="chevron">▾</span>
</div>
<script>
(function() {{
  const LOCATIONS = {LOCATIONS_JS};
  const CHANNEL = {json.dumps(channel)};
  const DEFAULT_NAME = {DEFAULT_NAME_JS};
  const sel = document.getElementById('sb');
  const componentId = 'location-selector-' + Math.random().toString(36).substr(2, 9);
  
  // Setup BroadcastChannel
  let bc = null;
  try {{ if ('BroadcastChannel' in window) bc = new BroadcastChannel(CHANNEL); }} catch (e) {{}}
  
  // Send message to all targets
  function busSend(obj) {{
    const s = JSON.stringify(obj);
    try {{ if (bc) bc.postMessage(obj); }} catch(e) {{}}
    try {{ window.parent.postMessage(s, '*'); }} catch(e) {{}}
    try {{ if (window.top && window.top !== window.parent) window.top.postMessage(s, '*'); }} catch(e) {{}}
    try {{
      if (window.top && window.top.frames) {{
        for (let i = 0; i < window.top.frames.length; i++) {{
          const f = window.top.frames[i];
          if (f !== window) try {{ f.postMessage(s, '*'); }} catch(e) {{}}
        }}
      }}
    }} catch(e) {{}}
  }}
  
  // Populate dropdown
  sel.innerHTML = '<option value="" disabled selected>Select a location…</option>';
  LOCATIONS.forEach((loc, i) => {{
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = loc.name;
    sel.appendChild(opt);
  }});
  
  function sendLocation(index) {{
    const loc = LOCATIONS[index];
    if (!loc || !loc.bounds) return;
    
    const [west, south, east, north] = loc.bounds;
    
    // Send location_change message with bounds
    busSend({{
      type: 'location_change',
      fromComponent: componentId,
      timestamp: Date.now(),
      location: {{
        name: loc.name,
        bounds: loc.bounds,
        center: [(west + east) / 2, (south + north) / 2]
      }}
    }});
    
    console.log('[LocationSelector] Sent location:', loc.name, loc.bounds);
  }}
  
  sel.addEventListener('change', e => {{
    const index = parseInt(e.target.value, 10);
    if (!isNaN(index) && index >= 0) sendLocation(index);
  }});
  
  // Auto-select default location (or first) on load
  if (LOCATIONS.length > 0) {{
    setTimeout(() => {{
      let targetIndex = 0;
      if (DEFAULT_NAME) {{
        const matchIndex = LOCATIONS.findIndex(loc => loc.name === DEFAULT_NAME);
        if (matchIndex >= 0) {{
          targetIndex = matchIndex;
        }}
      }}
      sel.selectedIndex = targetIndex + 1; // +1 to skip placeholder option
      sendLocation(targetIndex);
    }}, 100);
  }}
}})();
</script>
</body>
</html>
"""
    
    return common.html_to_obj(html)