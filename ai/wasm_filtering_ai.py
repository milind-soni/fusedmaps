common = fused.load("https://github.com/fusedio/udfs/tree/abf9c87/public/common/")

@fused.udf()
def udf(
    data_url: str = "https://udf.ai/UDF_CDL_Data_Filtering/run/file?dtype_out_raster=png&dtype_out_vector=parquet&hex_res=5",
    mapbox_token: str = "pk.eyJ1IjoiaXNhYWNmdXNlZGxhYnMiLCJhIjoiY2xicGdwdHljMHQ1bzN4cWhtNThvbzdqcSJ9.73fb6zHMeO_c8eAXpZVNrA",
    center_lng: float = -96.0,
    center_lat: float = 39.0,
    zoom: int = 4,
    auto_fetch: bool = True,
    initial_query: str = "SELECT * FROM spatial_data_full WHERE data = 1"
):
    import json 
     
    html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>H3 Hex Map (Full SQL Query Mode)</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://api.mapbox.com/mapbox-gl-js/v3.2.0/mapbox-gl.js"></script>
  <link href="https://api.mapbox.com/mapbox-gl-js/v3.2.0/mapbox-gl.css" rel="stylesheet" />
  <style>
    :root {{
      --lime: #E8FF59;
      --bg: #1c1c1c;
      --text: #ddd;
      --border: #444;
    }}
    html, body, #map {{ margin:0; padding:0; height:100%; background:#111; }}
    .note {{ position:absolute; top:8px; left:8px; font:12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; color:#bbb; background:rgba(0,0,0,.4); padding:6px 8px; border-radius:6px; z-index:10; }}

    /* —— Stats Box —— */
    .stats {{
      position:absolute; bottom:60px; left:8px;
      display:flex; align-items:center; gap:14px; flex-wrap:wrap;
      font:18px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;
      color:var(--text); background:var(--bg); padding:14px 18px; border-radius:10px;
      border:1px solid var(--border);
    }}
    .stats .k {{ color:var(--lime); margin-right:6px; font-weight:600; }}
    .stats b {{ color:#fff; font-weight:700; }}
    .stats .sep {{ color:#555; }}
    .stats .u {{ color:var(--lime); margin-left:6px; }}

    /* —— Search Bar —— */
    .filter {{
      position:absolute; top:8px; right:8px; display:flex; gap:8px; align-items:center;
      background:rgba(0,0,0,.4); padding:8px 10px; border-radius:10px;
    }}
    .filter input {{
      width:600px; padding:12px 16px; border:1px solid var(--border); background:var(--bg); color:#fff;
      border-radius:10px; font:16px/1.4 'SF Mono', Monaco, 'Cascadia Code', monospace;
      transition: box-shadow .12s ease, border-color .12s ease, opacity .2s ease;
    }}
    .filter input::placeholder {{ color: rgba(232,255,89,0.6); font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; }}
    .filter input:focus {{ outline:none; border-color:var(--lime); box-shadow: 0 0 12px 2px rgba(232,255,89,0.14); }}
    .filter input:disabled {{
      opacity:0.5;
      cursor:not-allowed;
    }}

    .mapboxgl-popup {{ max-width: 320px; font:13px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif; }}
    .mapboxgl-popup-content {{ background:#0f0f0f; color:#eee; border:1px solid #333; }}
    .mapboxgl-popup-tip {{ border-top-color:#0f0f0f !important; }}

    /* —— Bottom-right brand/footer —— */
    .brand {{
      position:absolute; right:8px; bottom:60px;
      background:rgba(0,0,0,.45);
      border:1px solid var(--border);
      border-radius:8px;
      padding:10px 14px;  
      font:14px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;
      color:#bbb;
    }}
    .brand a {{
      color:var(--lime); text-decoration:none;
    }}
    .brand a:hover {{
      text-decoration:underline;
    }}

    /* —— Prompt Bar —— */
    .prompt-bar {{
      position:absolute; bottom:8px; left:8px; right:8px;
      display:flex; gap:8px; align-items:center;
      background:rgba(0,0,0,.5); padding:8px 10px; border-radius:8px;
      border:1px solid var(--border);
    }}
    .prompt-bar input {{
      flex:1; padding:10px 14px; border:1px solid var(--border); background:#222; color:#fff;
      border-radius:6px; font:14px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;
    }}
    .prompt-bar input::placeholder {{ color: rgba(255,255,255,0.35); }}
    .prompt-bar input:focus {{ outline:none; border-color:#666; }}
    .prompt-bar input:disabled {{ opacity:0.5; cursor:not-allowed; }}
    .prompt-bar button {{
      padding:10px 16px; border:none; background:#555; color:#fff;
      border-radius:6px; font:14px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;
      cursor:pointer; white-space:nowrap;
    }}
    .prompt-bar button:hover {{ background:#666; }}
    .prompt-bar button:disabled {{ opacity:0.5; cursor:not-allowed; }}
    .prompt-bar .spinner {{
      display:none; width:16px; height:16px; border:2px solid #444;
      border-top-color:#888; border-radius:50%; animation:spin .8s linear infinite;
    }}
    .prompt-bar.loading .spinner {{ display:inline-block; }}
    .prompt-bar.loading button {{ display:none; }}
    @keyframes spin {{ to {{ transform:rotate(360deg); }} }}
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="note" id="note">Loading…</div>

  <!-- Stats pill -->
  <div class="stats" id="stats">
    <span><span class="k">Count</span><b id="stCount">–</b></span>
    <span class="sep">•</span>
    <span><span class="k">Area</span><b id="stArea">–</b><span class="u">million m²</span></span>
    <span class="sep">•</span>
    <span><span class="k">Avg</span><b id="stPct">–</b><span class="u">%</span></span>
  </div>

  <!-- Bottom-right footer -->
  <div class="brand">
    built with <a href="https://fused.io" target="_blank" rel="noopener noreferrer">fused.io</a>
    &nbsp;•&nbsp;
    <a href="https://docs.fused.io/tutorials/Analytics%20&%20Dashboard/realtime-data-processing-with-duckdb-wasm" target="_blank" rel="noopener noreferrer">Tutorial</a>
  </div>

  <!-- Search bar -->
  <div class="filter">
    <input id="filterInput" placeholder="SELECT * FROM spatial_data_full WHERE ..." disabled />
  </div>

  <!-- Prompt bar -->
  <div class="prompt-bar" id="promptBar">
    <input id="promptInput" placeholder="Ask 'Show me corn areas over 50% coverage'" disabled />
    <button id="promptBtn">Ask AI</button>
    <div class="spinner"></div>
  </div>

  <script type="module">
    const MAPBOX_TOKEN = {json.dumps(mapbox_token)};
    const DATA_URL     = {json.dumps(data_url)};
    const AUTO_FETCH   = {str(auto_fetch).lower()};
    const INIT_QUERY   = {json.dumps(initial_query)};
    const PROMPT_UDF_URL = "https://udf.ai/fsh_671cHDzwKC6c5uO0aZK0Jd/run?dtype_out_raster=png&dtype_out_vector=json";

    let map, duckdb, conn, currentQuery = INIT_QUERY;
    let didInitialFit = false;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    map = new mapboxgl.Map({{
      container: 'map',
      style: 'mapbox://styles/mapbox/dark-v10',
      center: [{center_lng}, {center_lat}],
      zoom: {zoom},
      dragRotate: false, pitchWithRotate: false
    }});
    map.on('load', onLoad);

    async function onLoad() {{
      map.addSource('h3', {{ type:'geojson', data: emptyFC() }});
      map.addLayer({{ id:'h3-fill', type:'fill', source:'h3',
        paint: {{ 'fill-color': [
          'interpolate',['linear'],['get','pct'],
          0,'#2E294E', 1,'#1B998B', 5,'#C5D86D', 15,'#F7931E', 30,'#FFD23F', 50,'#E8FF59'
        ], 'fill-opacity':0.8 }} }});
      map.addLayer({{ id:'h3-line', type:'line', source:'h3',
        paint: {{ 'line-color':'#fff', 'line-width':0.3, 'line-opacity':0.35 }} }});

      const popup = new mapboxgl.Popup({{ closeButton:false, closeOnClick:false }});
      map.on('mouseenter','h3-fill', () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave','h3-fill', () => {{ map.getCanvas().style.cursor=''; popup.remove(); }});
      map.on('mousemove','h3-fill', (e) => {{
        if (!e.features?.length) return;
        const p = e.features[0].properties || {{}};
        const pct  = isFinite(+p.pct)  ? (+p.pct).toFixed(2)   : p.pct;
        const area = isFinite(+p.area) ? (+p.area).toFixed(2) : p.area;
        popup.setLngLat(e.lngLat).setHTML(
          '<div><b>data:</b> ' + p.data + '</div>' +
          '<div><b>pct:</b> ' + pct + ' <span style="color:#E8FF59">%</span></div>' +
          '<div><b>area:</b> ' + area + ' <span style="color:#E8FF59">m²</span></div>' +
          '<div style="opacity:.7"><b>hex:</b> ' + p.hex + '</div>'
        ).addTo(map);
      }});

      const input = document.getElementById('filterInput');
      input.value = currentQuery;
      input.addEventListener('keypress', (e) => {{ if (e.key === 'Enter') executeQueryFromInput(); }});

      if (!AUTO_FETCH) {{ setNote('Map ready (AUTO_FETCH=false)'); input.disabled = false; return; }}

      try {{
        setNote('Initializing DuckDB…'); await initDuckDB();
        setNote('Fetching Parquet…');     const buf = await fetchParquet(DATA_URL);
        setNote('Loading data…');         await loadParquet(buf);
        setNote('Executing query…');      await executeQuery(currentQuery);
        const gj = await toGeoJSON();
        map.getSource('h3').setData(gj);
        fitToOnce(gj);
        await updateStats();
        clearNote();

        input.disabled = false;
        document.getElementById('promptInput').disabled = false;
        document.getElementById('promptBtn').disabled = false;

        // Setup prompt bar handlers
        const promptInput = document.getElementById('promptInput');
        const promptBtn = document.getElementById('promptBtn');
        promptInput.addEventListener('keypress', (e) => {{ if (e.key === 'Enter') executePrompt(); }});
        promptBtn.addEventListener('click', executePrompt);
      }} catch (e) {{ setNote('Error: ' + (e?.message||e)); console.error(e); }}
    }}

    function setNote(t) {{ const n=document.getElementById('note'); if(n) n.textContent=t; }}
    function clearNote() {{ const n=document.getElementById('note'); if(n) n.remove(); }}
    const emptyFC = () => ({{ type:'FeatureCollection', features:[] }});

    async function initDuckDB() {{
      const m = await import('https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.1-dev132.0/+esm');
      const b = await m.selectBundle(m.getJsDelivrBundles());
      const w = new Worker(URL.createObjectURL(new Blob([await (await fetch(b.mainWorker)).text()],{{type:'application/javascript'}})));
      duckdb = new m.AsyncDuckDB(new m.ConsoleLogger(), w);
      await duckdb.instantiate(b.mainModule);
      conn = await duckdb.connect();
      try {{ await conn.query('INSTALL spatial; LOAD spatial;'); }} catch {{}}
      try {{ await conn.query('INSTALL h3 FROM community; LOAD h3;'); }} catch {{}}
    }}

    async function fetchParquet(url) {{
      const r = await fetch(url); if(!r.ok) throw new Error(`HTTP ${{r.status}}`);
      return new Uint8Array(await r.arrayBuffer());
    }}

    async function loadParquet(bytes) {{
      await duckdb.registerFileBuffer('data.parquet', bytes);
      await conn.query('DROP TABLE IF EXISTS spatial_data_full;');
      await conn.query(`
        CREATE TABLE spatial_data_full AS
        SELECT row_number() OVER() AS id,
               CAST(hex AS BIGINT) AS h3_cell,
               CAST(data AS INTEGER) AS data,
               CAST(area AS DOUBLE) AS area,
               CAST(pct  AS DOUBLE) AS pct
        FROM read_parquet('data.parquet')
        WHERE hex IS NOT NULL
      `);
    }}

    async function executeQuery(sql) {{
      await conn.query('DROP TABLE IF EXISTS spatial_data;');
      // Wrap user query as a subquery to create the working table
      await conn.query(`CREATE TABLE spatial_data AS (${{sql}})`);
    }}

    async function toGeoJSON() {{
      const res = await conn.query(`
        SELECT
          '{{"type":"FeatureCollection","features":[' ||
            COALESCE(string_agg(
              '{{"type":"Feature","geometry":' ||
                ST_AsGeoJSON(ST_GeomFromText(h3_cell_to_boundary_wkt(h3_cell))) ||
                ',"properties":{{"hex":"' || h3_cell || '","data":'||COALESCE(data,0)||',"area":'||COALESCE(area,0)||',"pct":'||COALESCE(pct,0)||'}}}}',
              ','
            ), '')
          || ']}}' AS gj
        FROM spatial_data
        WHERE h3_cell IS NOT NULL AND h3_is_valid_cell(h3_cell)
      `);
      const rows=res.toArray(); return JSON.parse(rows?.[0]?.gj || '{{"type":"FeatureCollection","features":[]}}');
    }}

    function fitToOnce(gj) {{
      if (didInitialFit || !gj.features.length) return;
      let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
      for (const f of gj.features) for (const ring of f.geometry.coordinates) for (const [x,y] of ring) {{
        if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y;
      }}
      map.fitBounds([[minX,minY],[maxX,maxY]],{{padding:20,duration:0}});
      didInitialFit = true;
    }}

    async function executeQueryFromInput() {{
      const val = document.getElementById('filterInput').value.trim();
      if (!val || val === currentQuery) return;
      currentQuery = val;
      try {{
        setNote('Executing query…');
        const view = map.getCenter(), z = map.getZoom();
        await executeQuery(currentQuery);
        const gj = await toGeoJSON();
        map.getSource('h3').setData(gj);
        map.jumpTo({{ center: view, zoom: z }});
        await updateStats();
        clearNote();
      }} catch(e) {{
        setNote('Query error: ' + (e?.message||e));
        console.error(e);
      }}
    }}

    async function updateStats() {{
      try {{
        const q = await conn.query(`
          SELECT COUNT(*) AS cnt, COALESCE(SUM(area),0) AS total_area_m2, AVG(pct) AS avg_pct
          FROM spatial_data
        `);
        const r = q.toArray()?.[0] || {{ cnt:0, total_area_m2:0, avg_pct:0 }};
        const million_m2 = (+r.total_area_m2 || 0) / 1_000_000;

        const fmtMil = (v) => {{
          v = +v || 0;
          if (v < 1) return v.toFixed(3);
          if (v < 100) return v.toFixed(2);
          if (v < 10000) return v.toFixed(1);
          return v.toLocaleString(undefined, {{ maximumFractionDigits: 0 }});
        }};
        const fmtPct = (v) => (isFinite(+v) ? (+v).toFixed(2) : '0.00');

        document.getElementById('stCount').textContent = Number(r.cnt||0).toLocaleString();
        document.getElementById('stArea').textContent  = fmtMil(million_m2);
        document.getElementById('stPct').textContent   = fmtPct(r.avg_pct||0);
      }} catch(e) {{
        console.error('[stats] error:', e);
      }}
    }}

    async function executePrompt() {{
      const promptInput = document.getElementById('promptInput');
      const promptBar = document.getElementById('promptBar');
      const filterInput = document.getElementById('filterInput');
      const prompt = promptInput.value.trim();
      
      if (!prompt) return;
      
      try {{
        promptBar.classList.add('loading');
        promptInput.disabled = true;
        setNote('Converting prompt to SQL…');
        
        // Call the prompt-to-SQL UDF
        const url = PROMPT_UDF_URL + '&prompt=' + encodeURIComponent(prompt);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${{response.status}}`);
        
        let sqlQuery = await response.text();
        // Clean up the response (remove quotes if wrapped)
        sqlQuery = sqlQuery.trim().replace(/^["']|["']$/g, '');
        
        console.log('Generated SQL:', sqlQuery);
        
        // Update the SQL input field to show the generated query
        filterInput.value = sqlQuery;
        currentQuery = sqlQuery;
        
        // Execute the query
        setNote('Executing query…');
        const view = map.getCenter(), z = map.getZoom();
        await executeQuery(currentQuery);
        const gj = await toGeoJSON();
        map.getSource('h3').setData(gj);
        map.jumpTo({{ center: view, zoom: z }});
        await updateStats();
        clearNote();
        
      }} catch(e) {{
        setNote('Error: ' + (e?.message||e));
        console.error(e);
      }} finally {{
        promptBar.classList.remove('loading');
        promptInput.disabled = false;
      }}
    }}
  </script>
</body>
</html>"""
    return common.html_to_obj(html)