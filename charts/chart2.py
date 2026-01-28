@fused.udf
def udf():
    import pandas as pd
    import numpy as np
    import json
    from shapely import wkb

    common = fused.load("https://github.com/fusedio/udfs/tree/bb3aa1b/public/common/")

    # Read data directly from the parquet file
    data = pd.read_parquet("s3://fused-users/bcg/bourmetsikastavroula/harvest_profit_data/field_yield_metrics_clipped.parquet")
    
    print(data.T)
    
    # Filter out rows with NaN values for the metrics we need
    df_clean = data.dropna(subset=['Yield Per Hectare'])

    print(f"Clean data rows: {len(df_clean)}")
    print(f"Columns: {df_clean.columns.tolist()}")

    # Rename columns to match JavaScript expectations
    df_clean = df_clean.rename(columns={
        'field_name': 'Field Name',
        'terrain_category': 'Terrain Category',
        'yield_per_hec': 'Yield Per Hectare',
        'area_hectares': 'Area Hectares',
        'total_yield': 'Total Yield',
        'total_wet_mass': 'Total Wet Mass',
        'Harvested Crop': 'Harvested Crop',
        'Harvested Year': 'Harvested Year'
    })

    # Check if crop column exists
    crop_cols = [col for col in df_clean.columns if 'Harvested Crop' in col]
    crop_col = crop_cols[0] if crop_cols else None
    print(f"Crop column found: {crop_col}")

    # Sort by yield per hectare
    field_data = df_clean.copy()
    field_data = field_data.sort_values('Yield Per Hectare', ascending=True)

    # Prepare columns for JSON - include crop if available
    cols_to_include = ['Field Name', 'Terrain Category', 'Yield Per Hectare', 'Area Hectares']
    if crop_col:
        cols_to_include.append(crop_col)

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

    # Add Total Yield and Total Wet Mass if available
    if "Total Yield" in field_data.columns:
        df_plot["Total Yield"] = field_data["Total Yield"]
    if "Total Wet Mass" in field_data.columns:
        df_plot["Total Wet Mass"] = field_data["Total Wet Mass"]

    data_json = df_plot.to_json(orient="records")
    crop_col_js = crop_col if crop_col else None

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
                padding: 6px;
                background: #fff;
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
            #chart {{
                flex: 1;
                display: flex;
                justify-content: center;
                overflow: hidden;
            }}
            .filter-section {{
                padding: 6px;
                background: #fff;
                border: 1px solid rgba(173, 193, 210, 0.7);
                border-radius: 3px;
                margin-top: 0;
                margin-bottom: 0;
            }}
            .filter-row {{
                display: flex;
                align-items: center;
                gap: 6px;
                flex-wrap: wrap;
            }}
            .filter-label {{
                font-weight: 600;
                color: #323131;
                font-size: 10px;
                font-family: 'Inter', sans-serif;
                margin-right: 4px;
            }}
            .control-btn {{
                padding: 4px 8px;
                border: 1px solid #7C9BB6;
                border-radius: 3px;
                background: #fff;
                color: #323131;
                cursor: pointer;
                font-family: 'Inter', sans-serif;
                font-size: 10px;
                font-weight: 600;
                transition: all 0.2s;
            }}
            .control-btn:hover {{
                background: #f0f0f0;
            }}
            .crop-button {{
                padding: 4px 8px;
                border: 1px solid #7C9BB6;
                border-radius: 3px;
                background: #fff;
                color: #323131;
                cursor: pointer;
                font-family: 'Inter', sans-serif;
                font-size: 10px;
                font-weight: 500;
                transition: all 0.2s;
            }}
            .crop-button:hover {{
                background: #f0f0f0;
            }}
            .crop-button.active {{
                background: #E2E9EF;
                color: #323131;
            }}
            .helper-text {{
                font-size: 8px;
                color: #666;
                margin: 4px 0 0 0;
                font-weight: 0;
                line-height: 1.3;
            }}
            svg {{
                background: white;
                border: none;
                border-radius: 2px;
            }}
            .axis-label {{
                font-size: 16px;
                fill: #666;
                font-weight: 600;
                font-family: 'Inter', sans-serif;
            }}
            .axis {{
                font-size: 12px;
                font-family: 'Inter', sans-serif;
            }}
            .axis.y-axis text {{
                font-size: 13px;
            }}
            .axis.y-axis text.hidden-label {{
                opacity: 0 !important;
                pointer-events: none;
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
                padding: 6px 10px;
                background: rgba(225, 225, 225, 0.95);
                color: #496883;
                border: 1px solid #444;
                border-radius: 3px;
                font-size: 9px;
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
        const CROP_COL = {json.dumps(crop_col_js)};
        let allData = [];
        let selectedCrops = new Set();
        let allCrops = [];

        function busSend(obj) {{
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
            if (!CROP_COL || selectedCrops.size === 0) {{
                return allData;
            }}
            return allData.filter(d => selectedCrops.has(String(d[CROP_COL])));
        }}

        function shouldShowLabel(data, index, total, availableHeight) {{
            const minLabelHeight = 16;
            const barHeight = availableHeight / total;
            if (barHeight < minLabelHeight) {{
                const n = Math.ceil(minLabelHeight / barHeight);
                return index % n === 0;
            }}
            if (total > 30) {{
                return index % 2 === 0;
            }}
            return true;
        }}

        function calculateOptimalFontSize(data, width, height) {{
            const dataLength = data.length;
            const areaRatio = (width * height) / 100000;
            const barHeight = height / dataLength;
            let yAxisFontSize = Math.max(9, Math.min(14, Math.floor(barHeight * 0.9)));
            if (areaRatio < 0.3) {{
                yAxisFontSize = Math.max(8, yAxisFontSize - 1);
            }}
            let xAxisFontSize = Math.max(7, Math.min(11, Math.floor(width / 50)));
            if (areaRatio < 0.3) {{
                xAxisFontSize = Math.max(6, xAxisFontSize - 1);
            }}
            let labelFontSize = Math.max(10, Math.min(16, Math.floor(Math.min(width, height) / 35)));
            if (areaRatio < 0.3) {{
                labelFontSize = Math.max(9, labelFontSize - 1);
            }}
            let xTickCount = Math.max(3, Math.min(8, Math.floor(width / 80)));
            return {{
                yAxis: yAxisFontSize,
                xAxis: xAxisFontSize,
                label: labelFontSize,
                xTickCount: xTickCount
            }};
        }}

        function calculateMaxLabelWidth(data, fontSize) {{
            const svg = d3.select('body').append('svg').style('visibility', 'hidden');
            const text = svg.append('text')
                .style('font-size', fontSize + 'px')
                .style('font-family', 'Inter, sans-serif');
            
            let maxWidth = 0;
            data.forEach((d, i) => {{
                if (shouldShowLabel(data, i, data.length, 1000)) {{
                    text.text(d['Field Name']);
                    const bbox = text.node().getBBox();
                    maxWidth = Math.max(maxWidth, bbox.width);
                }}
            }});
            svg.remove();
            return maxWidth;
        }}

        function calculateOptimalMargins(width, height, data, fontSize) {{
            const areaRatio = (width * height) / 100000;
            let top = Math.max(8, Math.min(20, Math.floor(height * 0.08)));
            let right = Math.max(12, Math.min(30, Math.floor(width * 0.06)));
            let bottom = Math.max(50, Math.min(85, Math.floor(height * 0.18)));
            const tickPadding = Math.max(5, Math.min(15, Math.floor(width * 0.02)));
            const maxLabelWidth = calculateMaxLabelWidth(data, fontSize);
            let left = Math.ceil(maxLabelWidth + tickPadding + 20);
            left = Math.max(40, Math.min(Math.floor(width * 0.4), left));
            if (areaRatio < 0.3) {{
                top = Math.max(4, top - 4);
                right = Math.max(6, right - 6);
                bottom = Math.max(35, bottom - 15);
            }}
            top = Math.max(8, top);
            right = Math.max(12, right);
            bottom = Math.max(50, bottom);
            left = Math.max(40, left);
            return {{ top, right, bottom, left }};
        }}

        function updateChart() {{
            const data = getFilteredData();
            const colors = {json.dumps(colors)};
            
            d3.select('#chart').html('');
            
            const containerElement = document.getElementById('chart');
            const filterElement = document.getElementById('filterSection');
            const containerHeight = containerElement.parentElement.clientHeight;
            const containerWidth = containerElement.clientWidth;
            
            const filterHeight = filterElement ? filterElement.offsetHeight : 20;
            
            let tempMargin = {{ top: 10, right: 20, bottom: 70, left: 100 }};
            let tempWidth = containerWidth - tempMargin.left - tempMargin.right;
            let tempHeight = containerHeight - filterHeight - tempMargin.top - tempMargin.bottom;
            const fontSizes = calculateOptimalFontSize(data, tempWidth, tempHeight);
            
            const margin = calculateOptimalMargins(containerWidth, containerHeight - filterHeight, data, fontSizes.yAxis);
            const width = containerWidth - margin.left - margin.right;
            const height = containerHeight - filterHeight - margin.top - margin.bottom;
            
            const responsiveTickPadding = Math.max(5, Math.min(15, Math.floor(containerWidth * 0.02)));
            
            const maxYield = d3.max(data, d => d['Yield Per Hectare']);
            xScale = d3.scaleLinear()
                .domain([0, maxYield * 1.1])
                .range([0, width]);
            
            yScale = d3.scaleBand()
                .domain(data.map(d => d['Field Name']))
                .range([0, height])
                .padding(0.2);
            
            const svg = d3.select('#chart')
                .append('svg')
                .attr('width', width + margin.left + margin.right)
                .attr('height', height + margin.top + margin.bottom);

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
            
            const xAxis = d3.axisBottom(xScale)
                .ticks(fontSizes.xTickCount)
                .tickPadding(responsiveTickPadding)
                .tickFormat(d => {{
                    if (d >= 1000) {{
                        return (d / 1000).toFixed(1) + 'k';
                    }}
                    return d === 0 ? '0' : d.toFixed(1);
                }});
            
            const xAxisGroup = chartSvg.append('g')
                .attr('class', 'axis')
                .attr('transform', 'translate(0,' + height + ')')
                .call(xAxis);
            xAxisGroup.selectAll('text')
                .style('font-size', fontSizes.xAxis + 'px');
            
            const xLabelDistance = Math.max(30, Math.min(margin.bottom - 12, Math.floor(fontSizes.label * 3.2)));
            chartSvg.append('text')
                .attr('x', width / 2)
                .attr('y', height + xLabelDistance)
                .attr('class', 'axis-label')
                .attr('text-anchor', 'middle')
                .style('font-size', fontSizes.label + 'px')
                .text('Yield Per Hectare');
            
            const yAxis = d3.axisLeft(yScale)
                .tickPadding(responsiveTickPadding)
                .tickFormat((d, i) => {{
                    if (!shouldShowLabel(data, i, data.length, height)) {{
                        return '';
                    }}
                    return d;
                }});
            
            const yAxisGroup = chartSvg.append('g')
                .attr('class', 'axis y-axis')
                .call(yAxis);
            yAxisGroup.selectAll('text')
                .style('font-size', fontSizes.yAxis + 'px');
            yAxisGroup.selectAll('.tick text')
                .classed('hidden-label', (d, i) => !shouldShowLabel(data, i, data.length, height));
            
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
                    if (CROP_COL) tooltipHtml += 'Crop: ' + d[CROP_COL] + '<br/>';
                    tooltipHtml += 'Terrain: ' + d['Terrain Category'] + '<br/>' +
                        'Yield Per Hectare: ' + d['Yield Per Hectare'].toFixed(2) + '<br/>' +
                        'Area: ' + d['Area Hectares'].toFixed(2) + ' Ha';
                    if (d['Total Yield']) tooltipHtml += '<br/>Total Yield: ' + d['Total Yield'].toFixed(2);
                    if (d['Total Wet Mass']) tooltipHtml += '<br/>Total Wet Mass: ' + d['Total Wet Mass'].toFixed(2);
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
        }}

        function selectAllCrops() {{
            allCrops.forEach(crop => selectedCrops.add(crop));
            document.querySelectorAll('.crop-button').forEach(btn => {{
                btn.classList.add('active');
            }});
            updateChart();
        }}

        function deselectAllCrops() {{
            selectedCrops.clear();
            document.querySelectorAll('.crop-button').forEach(btn => {{
                btn.classList.remove('active');
            }});
            updateChart();
        }}

        function initializeFilters() {{
            if (!CROP_COL) {{
                console.log('No crop column found in data');
                return;
            }}

            allCrops = [...new Set(allData.map(d => String(d[CROP_COL])))].sort();
            
            // Default to selecting only "Irrigated Cotton"
            selectedCrops = new Set(['Irrigated Cotton']);

            const filterSection = document.getElementById('filterSection');
            
            const filterRow = document.createElement('div');
            filterRow.className = 'filter-row';
            
            const filterLabel = document.createElement('span');
            filterLabel.className = 'filter-label';
            filterLabel.textContent = 'Crop Type:';
            filterRow.appendChild(filterLabel);
            
            allCrops.forEach(crop => {{
                const button = document.createElement('button');
                button.className = 'crop-button';
                button.textContent = crop;
                button.setAttribute('data-crop', crop);
                
                // Set active state only for Irrigated Cotton
                if (crop === 'Irrigated Cotton') {{
                    button.classList.add('active');
                }}
                
                button.addEventListener('click', () => {{
                    if (selectedCrops.has(crop)) {{
                        selectedCrops.delete(crop);
                        button.classList.remove('active');
                    }} else {{
                        selectedCrops.add(crop);
                        button.classList.add('active');
                    }}
                    updateChart();
                }});
                
                filterRow.appendChild(button);
            }});
            
            const selectAllBtn = document.createElement('button');
            selectAllBtn.className = 'control-btn';
            selectAllBtn.textContent = 'Select All';
            selectAllBtn.addEventListener('click', selectAllCrops);
            filterRow.appendChild(selectAllBtn);
            
            const deselectAllBtn = document.createElement('button');
            deselectAllBtn.className = 'control-btn';
            deselectAllBtn.textContent = 'Deselect All';
            deselectAllBtn.addEventListener('click', deselectAllCrops);
            filterRow.appendChild(deselectAllBtn);
            
            filterSection.appendChild(filterRow);
            
            const helperText = document.createElement('div');
            helperText.className = 'helper-text';
            helperText.textContent = 'Select crop types to filter field performance data';
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