common = fused.load("https://github.com/fusedio/udfs/tree/f430c25/public/common/")

@fused.udf
def udf(
    label: str = "Select field <span class='comment-text'>Selected field will appear on the map.</span>",
    locations: list = None,
    name_field: str = "Field Name",
    geometry_field: str = "geometry",
    farm_name_field: str = "Farm Name",
    default_location_name: str = None,
    channel: str = "fused-bus",
):

    import json

    # Backup to select a from all field names instead 
    data = fused.run("field_analysis_bo_minor_farmability_update_v2")
        
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
                "bounds": [float(min_x), float(min_y), float(max_x), float(max_y)],
                "farm": str(row[farm_name_field]) if farm_name_field in row and row[farm_name_field] is not None else "Unknown"
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
    
    # Extract unique farms from the farm field
    farms = []
    seen = set()
    for loc in locations:
        farm_name = loc.get("farm", "Unknown")
        if farm_name not in seen:
            farms.append(farm_name)
            seen.add(farm_name)
    farms = sorted(farms)
    
    LOCATIONS_JS = json.dumps(locations, ensure_ascii=False)
    FARMS_JS = json.dumps(farms, ensure_ascii=False)
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
    padding: 10px 10px 0 10px;
    min-height: 100%;
    background: rgba(255, 255, 255, 0);
    color: #323131;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }}
  body > *:last-child {{
    margin-bottom: 0;
  }}
  .title {{
    font-size: 16px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #323131;
    font-weight: 600;
    margin-bottom: 2px;
  }}
  label {{
    font-size: 10px;
    text-transform: none;
    color: #323131;
    font-weight: 400;
    margin-bottom: 2px;
  }}
  label:empty {{ display: none; }}
  .comment-text {{
    font-style: italic;
    color: #666;
    font-weight: 400;
    font-size: 11px;
  }}
  .hint-text {{
    font-size: 12px;
    color: #666;
    margin: 4px 0 0 0;
    font-weight: 400;
  }}
  .selects-container {{
    display: flex;
    gap: 10px;
    width: 100%;
  }}
  .select-group {{
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }}
  .select-wrapper {{
    position: relative;
    width: 100%;
    margin-bottom: 0;
  }}
  select {{
    width: 100%;
    padding: 10px 36px 10px 14px;
    border-radius: 6px;
    border: 1px solid #424242;
    background: #323131;
    color: #FFFFFF;
    font-size: 13px;
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    margin: 0;
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
<div class="selects-container">
  <div class="select-group">
    <label for="farm">Select farm <span class='comment-text'>Choose a farm to filter fields.</span></label>
    <div class="select-wrapper">
      <select id="farm"></select>
      <span class="chevron">&#9660;</span>
    </div>
  </div>
  <div class="select-group">
    <label for="sb">{label}</label>
    <div class="select-wrapper">
      <select id="sb"></select>
      <span class="chevron">&#9660;</span>
    </div>
  </div>
</div>
<script>
(function() {{
  const LOCATIONS = {LOCATIONS_JS};
  const FARMS = {FARMS_JS};
  const CHANNEL = {json.dumps(channel)};
  const DEFAULT_NAME = {DEFAULT_NAME_JS};
  const farmSel = document.getElementById('farm');
  const fieldSel = document.getElementById('sb');
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
  
  // Add padding to bounds
  function addPaddingToBounds(bounds, paddingPercent = 10) {{
    const [minX, minY, maxX, maxY] = bounds;
    const width = maxX - minX;
    const height = maxY - minY;
    const padX = (width * paddingPercent) / 100;
    const padY = (height * paddingPercent) / 100;
    return [minX - padX, minY - padY, maxX + padX, maxY + padY];
  }}
  
  // Calculate combined bounds for all fields in a farm
  function getFarmBounds(farm) {{
    const fieldsInFarm = LOCATIONS.filter(loc => loc.farm === farm);
    if (fieldsInFarm.length === 0) return null;
    
    let minX = fieldsInFarm[0].bounds[0];
    let minY = fieldsInFarm[0].bounds[1];
    let maxX = fieldsInFarm[0].bounds[2];
    let maxY = fieldsInFarm[0].bounds[3];
    
    for (let i = 1; i < fieldsInFarm.length; i++) {{
      const bounds = fieldsInFarm[i].bounds;
      minX = Math.min(minX, bounds[0]);
      minY = Math.min(minY, bounds[1]);
      maxX = Math.max(maxX, bounds[2]);
      maxY = Math.max(maxY, bounds[3]);
    }}
    
    return addPaddingToBounds([minX, minY, maxX, maxY]);
  }}
  
  // Calculate bounds for all locations
  function getAllBounds() {{
    if (LOCATIONS.length === 0) return null;
    
    let minX = LOCATIONS[0].bounds[0];
    let minY = LOCATIONS[0].bounds[1];
    let maxX = LOCATIONS[0].bounds[2];
    let maxY = LOCATIONS[0].bounds[3];
    
    for (let i = 1; i < LOCATIONS.length; i++) {{
      const bounds = LOCATIONS[i].bounds;
      minX = Math.min(minX, bounds[0]);
      minY = Math.min(minY, bounds[1]);
      maxX = Math.max(maxX, bounds[2]);
      maxY = Math.max(maxY, bounds[3]);
    }}
    
    return addPaddingToBounds([minX, minY, maxX, maxY]);
  }}
  
  // Populate farm dropdown with unique farms
  farmSel.innerHTML = '<option value="" selected>All Farms</option>';
  FARMS.forEach((farm) => {{
    const opt = document.createElement('option');
    opt.value = farm;
    opt.textContent = farm;
    farmSel.appendChild(opt);
  }});
  
  // Populate field dropdown based on selected farm
  function updateFieldDropdown() {{
    const selectedFarm = farmSel.value;
    fieldSel.innerHTML = '<option value="" selected>All Fields</option>';
    
    let fieldsToShow = LOCATIONS;
    if (selectedFarm) {{
      fieldsToShow = LOCATIONS.filter(loc => loc.farm === selectedFarm);
    }}
    
    fieldsToShow.forEach((loc) => {{
      const opt = document.createElement('option');
      opt.value = LOCATIONS.indexOf(loc);
      opt.textContent = loc.name;
      fieldSel.appendChild(opt);
    }});
  }}
  
  function sendLocation(index) {{
    if (index === '') return;
    const loc = LOCATIONS[index];
    if (!loc || !loc.bounds) return;

    const bounds = addPaddingToBounds(loc.bounds);
    const [west, south, east, north] = bounds;

    // Send location_change message for map interaction
    // Include selectionType and field property so the map highlights this specific field
    busSend({{
      type: 'location_change',
      fromComponent: componentId,
      timestamp: Date.now(),
      selectionType: 'field',
      location: {{
        name: loc.name,
        field: loc.name,
        farm: loc.farm,
        bounds: bounds,
        center: [(west + east) / 2, (south + north) / 2]
      }}
    }});

    console.log('[LocationSelector] Sent location:', loc.name, bounds);
  }}
  
  function sendFarmBounds(farm) {{
    const bounds = getFarmBounds(farm);
    if (!bounds) return;

    const [west, south, east, north] = bounds;

    // Send location_change message for map interaction
    // Include selectionType and farm property so the map knows to highlight ALL fields in this farm
    busSend({{
      type: 'location_change',
      fromComponent: componentId,
      timestamp: Date.now(),
      selectionType: 'farm',
      location: {{
        name: farm,
        farm: farm,
        bounds: bounds,
        center: [(west + east) / 2, (south + north) / 2]
      }}
    }});

    console.log('[LocationSelector] Sent farm bounds:', farm, bounds);
  }}
  
  function sendAllFieldsBounds() {{
    const bounds = getAllBounds();
    if (!bounds) return;
    
    const [west, south, east, north] = bounds;
    
    busSend({{
      type: 'location_change',
      fromComponent: componentId,
      timestamp: Date.now(),
      location: {{
        name: 'All Fields',
        bounds: bounds,
        center: [(west + east) / 2, (south + north) / 2]
      }}
    }});
    
    console.log('[LocationSelector] Sent all fields bounds:', bounds);
  }}
  
  farmSel.addEventListener('change', e => {{
    updateFieldDropdown();
    if (e.target.value) {{
      sendFarmBounds(e.target.value);
    }} else {{
      sendAllFieldsBounds();
    }}
  }});
  
  fieldSel.addEventListener('change', e => {{
    const index = e.target.value;
    if (index === '') {{
      sendAllFieldsBounds();
    }} else {{
      sendLocation(index);
    }}
  }});
  
  // Auto-select default location on load
  if (LOCATIONS.length > 0) {{
    setTimeout(() => {{
      let targetIndex = '';
      if (DEFAULT_NAME) {{
        const matchIndex = LOCATIONS.findIndex(loc => loc.name === DEFAULT_NAME);
        if (matchIndex >= 0) {{
          targetIndex = matchIndex;
        }}
      }}
      
      // Pre-select farm if default location exists
      if (DEFAULT_NAME) {{
        const defaultLoc = LOCATIONS.find(loc => loc.name === DEFAULT_NAME);
        if (defaultLoc) {{
          farmSel.value = defaultLoc.farm;
        }}
      }} else {{
        farmSel.value = '';
      }}
      
      updateFieldDropdown();
      if (targetIndex !== '') {{
        fieldSel.value = targetIndex;
        sendLocation(targetIndex);
      }}
    }}, 100);
  }}
}})();
</script>
</body>

    <script>
        // Prevent Ctrl/Cmd + wheel zoom
        document.addEventListener('wheel', function(e) {{
            if (e.ctrlKey || e.metaKey) {{
                e.preventDefault();
                e.stopPropagation();
            }}
        }}, {{ passive: false }});
        // Prevent pinch-to-zoom (multi-touch)
        document.addEventListener('touchstart', function(e) {{
            if (e.touches && e.touches.length > 1) {{
                e.preventDefault();
            }}
        }}, {{ passive: false }});
        document.addEventListener('touchmove', function(e) {{
            if (e.touches && e.touches.length > 1) {{
                e.preventDefault();
            }}
        }}, {{ passive: false }});
    </script>
    </html>
"""
    
    return common.html_to_obj(html)