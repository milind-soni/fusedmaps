@fused.udf(cache_max_age=0)
def udf(path: str='s3://fused-users/bcg/vanbalentula/minor_brother_field_stats/field_analysis_final_with_soil_v3.parquet'):
    import pandas as pd
    import numpy as np
    import json
    from shapely import wkb
    
    common = fused.load("https://github.com/fusedio/udfs/tree/bb3aa1b/public/common/")
    
    # Load the data
    data = fused.run('field_analysis_summary_2', path=path)
    
    # Filter out rows with NaN values for the metrics we need
    df_clean = data.dropna(subset=['Total Wet Mass', 'Total Yield', 'Area Hectares'])
    
    print(f"Clean data rows: {len(df_clean)}")
    print(f"Columns: {df_clean.columns.tolist()}")
    
    # Check if year column exists
    year_cols = [col for col in df_clean.columns if 'year' in col.lower()]
    year_col = year_cols[0] if year_cols else None
    print(f"Year column found: {year_col}")
    
    # Sort by yield per hectare
    field_data = df_clean.copy()
    field_data['Yield Per Hectare'] = field_data['Total Yield'] / field_data['Area Hectares']
    field_data = field_data.sort_values('Yield Per Hectare', ascending=True)

    # Prepare columns for JSON - include year if available
    cols_to_include = ['Field Name', 'Terrain Category', 'Yield Per Hectare', 'Total Yield', 'Area Hectares', 'Total Wet Mass']
    if year_col:
        cols_to_include.insert(1, year_col)
    
    df_plot = field_data[cols_to_include].copy()

    # If geometry is available, compute bounds
    def get_bounds(geom):
        if geom is None:
            return None
        if isinstance(geom, bytes):
            try:
                geom = wkb.loads(geom)
            except Exception:
                return None
        if hasattr(geom, "bounds"):
            return list(geom.bounds)
        return None

    if "geometry" in field_data.columns:
        try:
            df_plot["bounds"] = field_data["geometry"].apply(get_bounds)
        except Exception as e:
            print(f"[histogrambcg] Error processing geometry bounds: {e}")
            df_plot["bounds"] = None
    else:
        df_plot["bounds"] = None
    
    data_json = df_plot.to_json(orient="records")
    year_col_js = year_col if year_col else None
    
    # Define terrain category colors
    colors = {
        "rough - broken up": "#ca562c",
        "smooth - broken up": "#edc195",
        "rough - open": "#babe9b",
        "smooth - open": "#3d5941",
    }

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
        <style>
            body {{
                margin: 0;
                padding: 10px;
                background: #E2E9EF;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                overflow: hidden;
                height: 95vh;
            }}
            .container {{
                height: 100%;
                display: flex;
                flex-direction: column;
                gap: 0;
            }}
            .header {{
                display: flex;
                justify-content: center;
                align-items: center;
                margin-bottom: 10px;
            }}
            .title {{
                font-size: 18px;
                font-weight: 600;
                color: #323131;
                font-family: 'Inter', sans-serif;
            }}
            #chart {{
                flex: 1;
                display: flex;
                justify-content: center;
                overflow: hidden;
            }}
            .filter-section {{
                padding: 12px;
                background: #fff;
                border: 1px solid #7C9BB6;
                border-radius: 6px;
                margin-top: 0;
                margin-bottom: 0;
            }}
            .filter-row {{
                display: flex;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
            }}
            .filter-label {{
                font-weight: 600;
                color: #323131;
                font-size: 13px;
                font-family: 'Inter', sans-serif;
                margin-right: 5px;
            }}
            .control-btn {{
                padding: 5px 12px;
                border: 1px solid #7C9BB6;
                border-radius: 4px;
                background: #fff;
                color: #323131;
                cursor: pointer;
                font-family: 'Inter', sans-serif;
                font-size: 12px;
                font-weight: 600;
                transition: all 0.2s;
            }}
            .control-btn:hover {{
                background: #f0f0f0;
            }}
            .year-button {{
                padding: 4px 10px;
                border: 1px solid #7C9BB6;
                border-radius: 4px;
                background: #fff;
                color: #323131;
                cursor: pointer;
                font-family: 'Inter', sans-serif;
                font-size: 12px;
                font-weight: 500;
                transition: all 0.2s;
            }}
            .year-button:hover {{
                background: #f0f0f0;
            }}
            .year-button.active {{
                background: #E2E9EF;
                color: #323131;
            }}
            .helper-text {{
                font-size: 13px;
                color: #666;
                margin: 10px 0 0 0;
                font-weight: 400;
                line-height: 1.4;
            }}
            svg {{
                background: #fafafa;
                border: 1px solid #323131;
                border-radius: 2px;
            }}
            .axis-label {{
                font-size: 14px;
                fill: #aaa;
                font-weight: 600;
                font-family: 'Inter', sans-serif;
            }}
            .axis {{
                font-size: 12px;
                font-family: 'Inter', sans-serif;
            }}
            .axis.y-axis text {{
                font-size: 9px;
            }}
            .axis line,
            .axis path {{
                stroke: #444;
            }}
            .axis text {{
                fill: #aaa;
                font-family: 'Inter', sans-serif;
            }}
            .bar {{
                stroke: none;
                opacity: 0.8;
                transition: opacity 0.2s, filter 0.2s;
                cursor: pointer;
            }}
            .bar:hover {{
                opacity: 1;
                filter: brightness(1.2);
            }}
            .bar.highlighted {{
                opacity: 1;
                filter: drop-shadow(0 0 10px #FFD700);
                stroke: #FFD700;
                stroke-width: 2.5;
            }}
            .bar.dimmed {{
                opacity: 0.2;
            }}
            .tooltip {{
                position: absolute;
                padding: 10px 14px;
                background: rgba(225, 225, 225, 0.95);
                color: #496883;
                border: 1px solid #444;
                border-radius: 6px;
                font-size: 13px;
                font-family: 'Inter', sans-serif;
                pointer-events: none;
                display: none;
                z-index: 1000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="title">Cotton Field Performance</div>
            </div>
            <div id="chart"></div>
            <div class="filter-section" id="filterSection"></div>
        </div>
        <div class="tooltip" id="tooltip"></div>
        
        <script src="https://d3js.org/d3.v7.min.js"></script>
        <script>
        let chartSvg, xScale, yScale;
        let currentSelection = null;
        let bc = null;
        const CHANNEL = 'fused-bus';
        const ID_FIELDS = ['Field Name', 'FIELD_NAME', 'field_name', 'name'];
        const YEAR_COL = {json.dumps(year_col_js)};
        let allData = [];
        let selectedYears = new Set();
        let allYears = [];

        function busSend(obj) {{
            // Broadcast to all possible targets (same pattern as map_utils/scatterplot)
            const s = JSON.stringify(obj);
            try {{ if (bc) bc.postMessage(obj); }} catch(e) {{}}
            try {{ window.parent.postMessage(s, '*'); }} catch(e) {{}}
            try {{ window.postMessage(s, '*'); }} catch(e) {{}}
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

        function sendMessageToMap(d) {{
            const msg = {{
                type: 'feature_click',
                properties: {{ "Field Name": d["Field Name"] }},
                bounds: d.bounds,
                source: 'histogram'
            }};
            busSend(msg);
        }}

        function clearSelection() {{
            if (!chartSvg) return;
            chartSvg.selectAll('.bar')
                .classed('highlighted', false)
                .classed('dimmed', false);
            currentSelection = null;
        }}

        function highlightField(fieldName) {{
            if (!chartSvg) return;
            chartSvg.selectAll('.bar')
                .classed('highlighted', d => d['Field Name'] === fieldName)
                .classed('dimmed', d => d['Field Name'] !== fieldName);
            currentSelection = fieldName;
        }}

        function getIdFromMessage(msg) {{
            const props = msg?.properties || {{}};
            for (const k of ID_FIELDS) {{
                const v = props?.[k] ?? msg?.[k];
                if (v != null && String(v).trim() !== '') return v;
            }}
            return null;
        }}
        
        function positionTooltip(event) {{
            const tooltip = document.getElementById('tooltip');
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const tooltipRect = tooltip.getBoundingClientRect();
            const tooltipWidth = tooltipRect.width;
            const tooltipHeight = tooltipRect.height;
            
            let left = event.pageX + 10;
            let top = event.pageY - 10;
            
            if (left + tooltipWidth > viewportWidth) {{
                left = event.pageX - tooltipWidth - 10;
            }}
            if (top + tooltipHeight > viewportHeight) {{
                top = event.pageY - tooltipHeight - 10;
            }}
            if (left < 0) left = 10;
            if (top < 0) top = 10;
            
            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
        }}

        function getFilteredData() {{
            if (!YEAR_COL || selectedYears.size === 0) {{
                return allData;
            }}
            return allData.filter(d => selectedYears.has(String(d[YEAR_COL])));
        }}

        function updateChart() {{
            const data = getFilteredData();
            const colors = {json.dumps(colors)};
            
            d3.select('#chart').html('');
            
            const containerElement = document.getElementById('chart');
            const containerHeight = containerElement.parentElement.clientHeight;
            const containerWidth = containerElement.clientWidth;
            
            const margin = {{top: 10, right: 60, bottom: 80, left: 150}};
            const width = containerWidth - margin.left - margin.right;
            const height = containerHeight - 120 - margin.top - margin.bottom;
            
            // X scale for Yield Per Hectare (horizontal)
            const maxYield = d3.max(data, d => d['Yield Per Hectare']);
            xScale = d3.scaleLinear()
                .domain([0, maxYield * 1.1])
                .range([0, width]);
            
            // Y scale for Field Names (vertical)
            yScale = d3.scaleBand()
                .domain(data.map(d => d['Field Name']))
                .range([0, height])
                .padding(0.2);
            
            const svg = d3.select('#chart')
                .append('svg')
                .attr('width', width + margin.left + margin.right)
                .attr('height', height + margin.top + margin.bottom);

            // Clear selection when clicking anywhere that's not a bar.
            // Attach to SVG root so clicks on margins/axes also clear.
            svg.on('click', function(event) {{
                try {{
                    const t = event?.target;
                    if (t && t.closest && t.closest('.bar')) return;
                }} catch (e) {{}}
                clearSelection();
                busSend({{ type: 'clear_selection', source: 'histogram' }});
            }});

            chartSvg = svg.append('g')
                .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
            
            // X axis (bottom) for Yield Per Hectare
            const xAxis = d3.axisBottom(xScale)
                .ticks(10)
                .tickFormat(d => {{
                    if (d >= 1000) {{
                        return (d / 1000).toFixed(0) + 'k';
                    }}
                    return d.toFixed(0);
                }});
            
            chartSvg.append('g')
                .attr('class', 'axis')
                .attr('transform', 'translate(0,' + height + ')')
                .call(xAxis);
            
            chartSvg.append('text')
                .attr('x', width / 2)
                .attr('y', height + 50)
                .attr('class', 'axis-label')
                .attr('text-anchor', 'middle')
                .text('Yield Per Hectare');
            
            // Y axis (left) for Field Names
            const yAxis = d3.axisLeft(yScale);
            
            chartSvg.append('g')
                .attr('class', 'axis y-axis')
                .call(yAxis);
            
            chartSvg.append('text')
                .attr('transform', 'rotate(-90)')
                .attr('x', -height / 2)
                .attr('y', -110)
                .attr('class', 'axis-label')
                .attr('text-anchor', 'middle')
                .text('Field Name');
            
            // Horizontal bars
            chartSvg.selectAll('.bar')
                .data(data)
                .enter()
                .append('rect')
                .attr('class', 'bar')
                .attr('x', 0)
                .attr('y', d => yScale(d['Field Name']))
                .attr('width', d => xScale(d['Yield Per Hectare']))
                .attr('height', yScale.bandwidth())
                .attr('fill', d => colors[d['Terrain Category']] || '#cccccc')
                .attr('data-field-name', d => d['Field Name'])
                .on('click', function(event, d) {{
                    event.stopPropagation();
                    if (currentSelection === d['Field Name']) {{
                        clearSelection();
                    }} else {{
                        highlightField(d['Field Name']);
                        sendMessageToMap(d);
                    }}
                }})
                .on('mouseover', function(event, d) {{
                    const tooltip = document.getElementById('tooltip');
                    let tooltipHtml = '<strong>' + d['Field Name'] + '</strong><br/>';
                    if (YEAR_COL) tooltipHtml += 'Year: ' + d[YEAR_COL] + '<br/>';
                    tooltipHtml += 'Terrain: ' + d['Terrain Category'] + '<br/>' +
                        'Yield Per Hectare: ' + d['Yield Per Hectare'].toFixed(2) + '<br/>' +
                        'Total Yield: ' + d['Total Yield'].toFixed(2) + '<br/>' +
                        'Area: ' + d['Area Hectares'].toFixed(2) + ' Ha<br/>' +
                        'Total Wet Mass: ' + d['Total Wet Mass'].toFixed(2);
                    tooltip.innerHTML = tooltipHtml;
                    tooltip.style.display = 'block';
                    positionTooltip(event);
                }})
                .on('mousemove', function(event) {{
                    positionTooltip(event);
                }})
                .on('mouseout', function() {{
                    document.getElementById('tooltip').style.display = 'none';
                }});
            
            // (background click handled on the SVG root)
        }}

        function selectAllYears() {{
            allYears.forEach(year => selectedYears.add(year));
            document.querySelectorAll('.year-button').forEach(btn => {{
                btn.classList.add('active');
            }});
            updateChart();
        }}

        function deselectAllYears() {{
            selectedYears.clear();
            document.querySelectorAll('.year-button').forEach(btn => {{
                btn.classList.remove('active');
            }});
            updateChart();
        }}

        function initializeFilters() {{
            if (!YEAR_COL) {{
                console.log('No year column found in data');
                return;
            }}

            allYears = [...new Set(allData.map(d => String(d[YEAR_COL])))].sort();
            selectedYears = new Set(allYears);

            const filterSection = document.getElementById('filterSection');
            
            // Create filter row with all buttons
            const filterRow = document.createElement('div');
            filterRow.className = 'filter-row';
            
            // Add label
            const filterLabel = document.createElement('span');
            filterLabel.className = 'filter-label';
            filterLabel.textContent = 'Year:';
            filterRow.appendChild(filterLabel);
            
            // Add year buttons FIRST
            allYears.forEach(year => {{
                const button = document.createElement('button');
                button.className = 'year-button active';
                button.textContent = year;
                button.setAttribute('data-year', year);
                
                button.addEventListener('click', () => {{
                    if (selectedYears.has(year)) {{
                        selectedYears.delete(year);
                        button.classList.remove('active');
                    }} else {{
                        selectedYears.add(year);
                        button.classList.add('active');
                    }}
                    updateChart();
                }});
                
                filterRow.appendChild(button);
            }});
            
            // Add Select All button AFTER years
            const selectAllBtn = document.createElement('button');
            selectAllBtn.className = 'control-btn';
            selectAllBtn.textContent = 'Select All';
            selectAllBtn.addEventListener('click', selectAllYears);
            filterRow.appendChild(selectAllBtn);
            
            // Add Deselect All button LAST
            const deselectAllBtn = document.createElement('button');
            deselectAllBtn.className = 'control-btn';
            deselectAllBtn.textContent = 'Deselect All';
            deselectAllBtn.addEventListener('click', deselectAllYears);
            filterRow.appendChild(deselectAllBtn);
            
            filterSection.appendChild(filterRow);
            
            // Add helper text
            const helperText = document.createElement('div');
            helperText.className = 'helper-text';
            helperText.textContent = 'Select years to filter cotton field performance data';
            filterSection.appendChild(helperText);
        }}
        
        document.addEventListener('DOMContentLoaded', () => {{
            try {{
                if ('BroadcastChannel' in window) {{
                    bc = new BroadcastChannel(CHANNEL);
                    bc.onmessage = (ev) => handleMessage(ev.data);
                }}
            }} catch (e) {{}}

            allData = {data_json};
            initializeFilters();
            updateChart();
            
            let resizeTimeout;
            window.addEventListener('resize', () => {{
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(updateChart, 250);
            }});

            window.addEventListener('message', (event) => {{
                try {{
                    const eventData = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                    handleMessage(eventData);
                }} catch (e) {{}}
            }});
        }});

        function handleMessage(msg) {{
            if (!msg || msg.source === 'histogram') return;
            const type = msg.type || msg.message_type;
            if (type === 'clear_selection' || type === 'feature_deselect') {{
                clearSelection();
                return;
            }}
            if (type !== 'hex_click' && type !== 'feature_click') return;
            const itemId = getIdFromMessage(msg);
            if (!itemId) {{
                return;
            }}
            highlightField(String(itemId));
        }}
        </script>
    </body>
    </html>
    """
    
    return html_content