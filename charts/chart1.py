@fused.udf(cache_max_age="1d")
def udf():
    import pandas as pd
    import numpy as np
    import json
    from shapely import wkb

    df = fused.run("field_analysis_bo_minor_farmability_update_v2", cache_max_age=0)
    
    required_cols = [
        "Field Openness Score",
        "Terrain Smoothness Score",
        "Terrain Category",
        "Farmability Score",
        "Field Name",
    ]
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns in parquet: {missing}")

    smoothness_threshold = None
    openness_threshold = None

    if "Terrain Category" in df.columns:
        cat = df["Terrain Category"].astype(str)
        smooth_mask = cat.str.startswith("smooth")
        rough_mask = cat.str.startswith("rough")

        if smooth_mask.any() and rough_mask.any():
            smooth_min = df.loc[smooth_mask, "Terrain Smoothness Score"].min()
            rough_max = df.loc[rough_mask, "Terrain Smoothness Score"].max()
            smoothness_threshold = float((smooth_min + rough_max) / 2.0)

        open_mask = cat.str.endswith("open")
        broken_mask = cat.str.endswith("broken up")

        if open_mask.any() and broken_mask.any():
            open_min = df.loc[open_mask, "Field Openness Score"].min()
            broken_max = df.loc[broken_mask, "Field Openness Score"].max()
            openness_threshold = float((open_min + broken_max) / 2.0)

    if (smoothness_threshold is None or openness_threshold is None) and "cluster_label" in df.columns:
        centers = df.groupby("cluster_label")[["Terrain Smoothness Score", "Field Openness Score"]].mean().values
        smooth_sorted = np.sort(centers[:, 0])
        open_sorted = np.sort(centers[:, 1])
        smoothness_threshold = float((smooth_sorted[1] + smooth_sorted[2]) / 2.0)
        openness_threshold = float((open_sorted[1] + open_sorted[2]) / 2.0)

    if smoothness_threshold is None:
        smoothness_threshold = float(df["Terrain Smoothness Score"].median())
    if openness_threshold is None:
        openness_threshold = float(df["Field Openness Score"].median())

    df = df.dropna(
        subset=[
            "Terrain Smoothness Score",
            "Field Openness Score",
            "Terrain Category",
            "Farmability Score",
            "Field Name",
        ]
    )

    def get_bounds(geom):
        if geom is None:
            return None
        if isinstance(geom, bytes):
            try:
                geom = wkb.loads(geom)
            except Exception:
                return None
        if hasattr(geom, 'bounds'):
            return list(geom.bounds)
        return None

    if "geometry" in df.columns:
        try:
            df['bounds'] = df['geometry'].apply(get_bounds)
            df = df.drop(columns=["geometry"])
        except Exception as e:
            print(f"Error processing geometry: {e}")
            df['bounds'] = None
    else:
        df['bounds'] = None

    openness_min = float(df["Field Openness Score"].min())
    openness_max = float(df["Field Openness Score"].max())
    smoothness_min = float(df["Terrain Smoothness Score"].min())
    smoothness_max = float(df["Terrain Smoothness Score"].max())

    df_plot = df[
        ["Field Openness Score", "Terrain Smoothness Score", "Terrain Category", "Farmability Score", "Field Name", "bounds"]
    ].copy()
    data_json = df_plot.to_json(orient="records")

    colors = {
        "rough - broken up": "#ca562c",
        "smooth - broken up": "#edc195",
        "rough - open": "#babe9b",
        "smooth - open": "#3d5941",
    }

    id_fields = ["Field Name"]

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
        <style>
            body {{
                margin: 0;
                padding: 5px 5px 15px 5px;
                background: white;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                overflow: hidden;
                height: 100vh;
            }}
            .container {{
                height: 100%;
                display: flex;
                flex-direction: column;
            }}
            #chart {{
                flex: 1;
                display: flex;
                justify-content: center;
                overflow: hidden;
            }}
            svg {{
                background: white;
                border-radius: 2px;
            }}
            .axis-label {{
                font-size: 14px;
                fill: #666;
                font-weight: 500;
            }}
            .direction-label {{
                font-size: 12px;
                fill: #aaa;
                font-style: italic;
            }}
            .axis {{
                font-size: 12px;
            }}
            .axis line,
            .axis path {{
                stroke: #444;
            }}
            .axis text {{
                fill: #aaa;
            }}
            .grid-line {{
                stroke: #444;
                stroke-dasharray: 5,5;
                stroke-width: 1;
            }}
            .dot {{
                stroke: none;
                opacity: 0.8;
                transition: opacity 0.2s, r 0.2s, filter 0.2s;
                cursor: pointer;
            }}
            .dot:hover {{
                opacity: 1;
            }}
            .dot.highlighted {{
                opacity: 1;
                filter: drop-shadow(0 0 10px #FFD700);
                stroke: #FFD700;
                stroke-width: 2.5;
            }}
            .dot.dimmed {{
                opacity: 0.2;
            }}
            .histogram-bar {{
                fill-opacity: 0.7;
                stroke: none;
                transition: all 0.3s;
            }}
            .histogram-bar.highlighted {{
                fill-opacity: 1;
                stroke: #FFD700;
                stroke-width: 2;
            }}
            .tooltip {{
                position: absolute;
                padding: 10px 14px;
                background: rgba(225, 225, 225, 0.95);
                color: #496883;
                border: 1px solid #444;
                border-radius: 6px;
                font-size: 13px;
                pointer-events: none;
                display: none;
                z-index: 1000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            }}
            .legend {{
                margin-top: 5px;
                display: flex;
                gap: 8px;
                justify-content: center;
                flex-wrap: wrap;
                padding-bottom: 15px;
            }}
            .legend-item {{
                display: flex;
                align-items: center;
                gap: 3px;
                font-size: 9px;
                color: #aaa;
            }}
            .legend-color {{
                width: 8px;
                height: 8px;
                border-radius: 50%;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div id="chart"></div>
            <div class="legend" id="legend"></div>
        </div>
        <div class="tooltip" id="tooltip"></div>
        
        <script src="https://d3js.org/d3.v7.min.js"></script>
        <script>
        let chartSvg, xScale, yScale;
        let bc = null;
        let currentSelection = null;
        let opennessHistData = null;
        let smoothnessHistData = null;
        
        function sendMessageToMap(fieldData) {{
            const message = {{
                type: 'feature_click',
                "Field Name": fieldData["Field Name"],
                properties: {{
                    "Field Name": fieldData["Field Name"]
                }},
                bounds: fieldData.bounds,
                source: 'scatter_plot'
            }};
            
            console.log('[ScatterPlot] Sending message to map:', message);
            
            if (bc) {{
                bc.postMessage(message);
            }}
            
            window.parent.postMessage(message, '*');
            window.postMessage(message, '*');
        }}
        
        function clearSelection() {{
            console.log('[ScatterPlot] clearSelection called');
            if (chartSvg) {{
                chartSvg.selectAll('.dot')
                    .classed('highlighted', false)
                    .classed('dimmed', false);
                chartSvg.selectAll('.histogram-bar')
                    .classed('highlighted', false);
                currentSelection = null;
                console.log('[ScatterPlot] Selection cleared');
            }}
        }}

        function broadcastClearSelection() {{
            const msg = {{ type: 'clear_selection', source: 'scatter_plot' }};
            try {{ if (bc) bc.postMessage(msg); }} catch(e) {{}}
            const s = JSON.stringify(msg);
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
        
        function highlightHistogramBars(openness, smoothness) {{
            chartSvg.selectAll('.histogram-bar')
                .classed('highlighted', false);
            
            chartSvg.selectAll('.top-hist')
                .classed('highlighted', d => openness >= d.x0 && openness < d.x1);
            
            chartSvg.selectAll('.right-hist')
                .classed('highlighted', d => smoothness >= d.x0 && smoothness < d.x1);
        }}
        
        function highlightField(fieldName, fieldData) {{
            if (chartSvg) {{
                chartSvg.selectAll('.dot')
                    .classed('highlighted', d => d["Field Name"] === fieldName)
                    .classed('dimmed', d => d["Field Name"] !== fieldName);
                
                if (fieldData) {{
                    highlightHistogramBars(fieldData["Field Openness Score"], fieldData["Terrain Smoothness Score"]);
                }}
            }}
        }}
        
        function createLegend(colors, fontSize) {{
            const legendEl = document.getElementById('legend');
            legendEl.innerHTML = '';
            
            Object.entries(colors).forEach(([category, color]) => {{
                const legendItem = document.createElement('div');
                legendItem.className = 'legend-item';
                legendItem.style.fontSize = fontSize + 'px';
                
                const colorBox = document.createElement('div');
                colorBox.className = 'legend-color';
                colorBox.style.width = (fontSize * 0.9) + 'px';
                colorBox.style.height = (fontSize * 0.9) + 'px';
                colorBox.style.background = color;
                
                const label = document.createElement('span');
                const capitalizedCategory = category
                    .split(' ')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
                label.textContent = capitalizedCategory;
                
                legendItem.appendChild(colorBox);
                legendItem.appendChild(label);
                legendEl.appendChild(legendItem);
            }});
        }}
        
        function initChart() {{
            const data = {data_json};
            const colors = {json.dumps(colors)};
            const smoothnessThreshold = {smoothness_threshold};
            const opennessThreshold   = {openness_threshold};
            const CHANNEL = 'fused-bus';
            const ID_FIELDS = {json.dumps(id_fields)};
            
            d3.select('#chart').html('');
            
            const containerElement = document.getElementById('chart');
            const containerHeight = containerElement.parentElement.clientHeight;
            const containerWidth = containerElement.clientWidth;
            
            // Increase bottom margin to accommodate x-axis label
            const margin = {{top: 40, right: 50, bottom: 70, left: 50}};
            const histHeight = 40;
            const histWidth = 40;
            const histPadding = 5; // Add padding between histogram and main chart
            
            const width = containerWidth - margin.left - margin.right;
            const height = containerHeight - margin.top - margin.bottom;
            
            // Calculate responsive font sizes based on chart dimensions
            const scale = Math.min(width / 800, height / 600);
            const axisLabelFontSize = Math.max(10, Math.min(18, 14 * scale));
            const axisTickFontSize = Math.max(8, Math.min(14, 12 * scale));
            const legendFontSize = Math.max(7, Math.min(11, 9 * scale));
            const directionFontSize = Math.max(9, Math.min(14, 12 * scale));
            const tooltipFontSize = Math.max(10, Math.min(16, 13 * scale));
            
            // Calculate responsive dot sizes - made ~70% bigger
            const dotRadius = Math.max(3, Math.min(9, 6 * scale));
            const hoverRadius = Math.max(5, Math.min(12, 8 * scale));
            const highlightedRadius = Math.max(6, Math.min(15, 10 * scale));
            
            // Calculate dynamic offsets for positioning
            const xAxisLabelOffset = Math.max(35, 50 * scale);
            const yAxisLabelOffset = Math.max(40, 60 * scale);
            const directionLabelOffset = Math.max(15, 25 * scale);
            
            createLegend(colors, legendFontSize);
            
            const opennessPadding   = ({openness_max} - {openness_min}) * 0.10;
            const smoothnessPadding = ({smoothness_max} - {smoothness_min}) * 0.05;
            
            xScale = d3.scaleLinear()
                .domain([0, {openness_max} + opennessPadding])
                .range([0, width]);
            
            yScale = d3.scaleLinear()
                .domain([0, {smoothness_max} + smoothnessPadding])
                .range([height, 0]);
            
            const svg = d3.select('#chart')
                .append('svg')
                .attr('width', width + margin.left + margin.right)
                .attr('height', height + margin.top + margin.bottom);
            
            // Clear selection when clicking anywhere that's not a point.
            // Attach to the SVG root so clicks on margins/axes also clear.
            svg.on('click', function(event) {{
                try {{
                    const t = event?.target;
                    if (t && t.closest && t.closest('.dot')) return;
                }} catch (e) {{}}
                clearSelection();
                broadcastClearSelection();
            }});
            
            chartSvg = svg.append('g')
                .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
            
            const numBins = 30;
            
            const opennessHist = d3.bin()
                .domain(xScale.domain())
                .thresholds(numBins)
                .value(d => d["Field Openness Score"])(data);
            
            opennessHistData = opennessHist;
            
            const opennessYScale = d3.scaleLinear()
                .domain([0, d3.max(opennessHist, d => d.length)])
                .range([0, histHeight]);
            
            const opennessColorScale = d3.scaleLinear()
                .domain([0, d3.max(opennessHist, d => d.length)])
                .range(['#E2E9EF', '#314659']);
            
            // Position top histogram with padding - moved up by histPadding
            chartSvg.selectAll('.top-hist')
                .data(opennessHist)
                .enter()
                .append('rect')
                .attr('class', 'histogram-bar top-hist')
                .attr('x', d => xScale(d.x0))
                .attr('y', d => -histHeight - histPadding + (histHeight - opennessYScale(d.length)))
                .attr('width', d => Math.max(0, xScale(d.x1) - xScale(d.x0) - 1))
                .attr('height', d => opennessYScale(d.length))
                .attr('fill', d => opennessColorScale(d.length));
            
            // Position "more open →" label starting from 100 on x-axis
            chartSvg.append('text')
                .attr('class', 'direction-label')
                .attr('x', xScale(2))
                .attr('y', yScale(101))
                .style('font-size', directionFontSize + 'px')
                .attr('text-anchor', 'start')
                .text('more open →');
            
            const smoothnessHist = d3.bin()
                .domain(yScale.domain())
                .thresholds(numBins)
                .value(d => d["Terrain Smoothness Score"])(data);
            
            smoothnessHistData = smoothnessHist;
            
            const smoothnessXScale = d3.scaleLinear()
                .domain([0, d3.max(smoothnessHist, d => d.length)])
                .range([0, histWidth]);
            
            const smoothnessColorScale = d3.scaleLinear()
                .domain([0, d3.max(smoothnessHist, d => d.length)])
                .range(['#E2E9EF', '#314659']);
            
            // Position right histogram with padding (already has 5px padding)
            chartSvg.selectAll('.right-hist')
                .data(smoothnessHist)
                .enter()
                .append('rect')
                .attr('class', 'histogram-bar right-hist')
                .attr('x', width + 5)
                .attr('y', d => yScale(d.x1))
                .attr('width', d => smoothnessXScale(d.length))
                .attr('height', d => Math.max(0, yScale(d.x0) - yScale(d.x1) - 1))
                .attr('fill', d => smoothnessColorScale(d.length));
            
            // Position "more smooth →" label starting from 100 on y-axis
            chartSvg.append('text')
                .attr('class', 'direction-label')
                .attr('transform', 'translate(' + xScale(103) + ', ' + yScale(2) + ') rotate(-90)')
                .style('font-size', directionFontSize + 'px')
                .attr('text-anchor', 'start')
                .text('more smooth →');
            
            chartSvg.append('line')
                .attr('class', 'grid-line')
                .attr('x1', xScale(opennessThreshold))
                .attr('x2', xScale(opennessThreshold))
                .attr('y1', 0)
                .attr('y2', height);
            
            chartSvg.append('line')
                .attr('class', 'grid-line')
                .attr('x1', 0)
                .attr('x2', width)
                .attr('y1', yScale(smoothnessThreshold))
                .attr('y2', yScale(smoothnessThreshold));
            
            const xAxis = d3.axisBottom(xScale)
                .ticks(10)
                .tickFormat(d => d.toFixed(0));
            
            const yAxis = d3.axisLeft(yScale)
                .ticks(10)
                .tickFormat(d => d.toFixed(0));
            
            chartSvg.append('g')
                .attr('class', 'axis')
                .attr('transform', 'translate(0,' + height + ')')
                .call(xAxis)
                .selectAll('text')
                .style('font-size', axisTickFontSize + 'px')
                .style('fill', '#aaa');
            
            chartSvg.append('g')
                .attr('class', 'axis')
                .call(yAxis)
                .selectAll('text')
                .style('font-size', axisTickFontSize + 'px')
                .style('fill', '#aaa');
            
            // Position x-axis label below the axis with dynamic offset
            chartSvg.append('text')
                .attr('x', width / 2)
                .attr('y', height + xAxisLabelOffset)
                .style('font-size', axisLabelFontSize + 'px')
                .style('fill', '#666')
                .attr('text-anchor', 'middle')
                .text('Openness Score');
            
            // Position y-axis label with dynamic offset
            chartSvg.append('text')
                .attr('transform', 'rotate(-90)')
                .attr('x', -height / 2)
                .attr('y', -yAxisLabelOffset)
                .style('font-size', axisLabelFontSize + 'px')
                .style('fill', '#666')
                .attr('text-anchor', 'middle')
                .text('Smoothness Score');
            
            chartSvg.selectAll('.dot')
                .data(data)
                .enter()
                .append('circle')
                .attr('class', 'dot')
                .attr('cx', d => xScale(d["Field Openness Score"]))
                .attr('cy', d => yScale(d["Terrain Smoothness Score"]))
                .attr('r', dotRadius)
                .attr('fill', d => colors[d["Terrain Category"]] || '#cccccc')
                .attr('data-field-name', d => d["Field Name"])
                .on('click', function(event, d) {{
                    event.stopPropagation();
                    console.log('[ScatterPlot] Dot clicked:', d["Field Name"]);
                    clearSelection();
                    highlightField(d["Field Name"], d);
                    sendMessageToMap(d);
                    currentSelection = d["Field Name"];
                }})
                .on('mouseover', function(event, d) {{
                    d3.select(this).attr('r', hoverRadius);
                    const tooltip = document.getElementById('tooltip');
                    tooltip.style.fontSize = tooltipFontSize + 'px';
                    tooltip.innerHTML = '<strong>' + d["Field Name"] + '</strong><br/>' +
                        'Openness: ' + d["Field Openness Score"].toFixed(2) + '<br/>' +
                        'Smoothness: ' + d["Terrain Smoothness Score"].toFixed(2) + '<br/>' +
                        'Category: ' + d["Terrain Category"];
                    tooltip.style.display = 'block';
                    tooltip.style.left = (event.pageX + 10) + 'px';
                    tooltip.style.top = (event.pageY - 10) + 'px';
                }})
                .on('mouseout', function(event, d) {{
                    d3.select(this).attr('r', currentSelection === d["Field Name"] ? highlightedRadius : dotRadius);
                    document.getElementById('tooltip').style.display = 'none';
                }});
                
            // Update highlightField to use dynamic dot sizes
            highlightField = function(fieldName, fieldData) {{
                if (chartSvg) {{
                    chartSvg.selectAll('.dot')
                        .classed('highlighted', d => d["Field Name"] === fieldName)
                        .classed('dimmed', d => d["Field Name"] !== fieldName)
                        .attr('r', d => d["Field Name"] === fieldName ? highlightedRadius : dotRadius);
                    
                    if (fieldData) {{
                        highlightHistogramBars(fieldData["Field Openness Score"], fieldData["Terrain Smoothness Score"]);
                    }}
                }}
            }};
                
            console.log('[ScatterPlot] Chart initialized');
        }}
        
        document.addEventListener('DOMContentLoaded', () => {{
            const CHANNEL = 'fused-bus';
            const ID_FIELDS = {json.dumps(id_fields)};
            
            try {{
                if ('BroadcastChannel' in window) {{
                    bc = new BroadcastChannel(CHANNEL);
                    bc.onmessage = handleMessage;
                    console.log('[ScatterPlot] BroadcastChannel initialized');
                }}
            }} catch (e) {{
                console.error('[ScatterPlot] BroadcastChannel error:', e);
            }}
            
            initChart();
            
            let resizeTimeout;
            window.addEventListener('resize', () => {{
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(initChart, 250);
            }});
            
            window.addEventListener('message', (event) => {{
                try {{
                    const eventData = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                    handleMessage(eventData);
                }} catch (e) {{}}
            }});
            
            function handleMessage(msg) {{
                if (!msg) return;
                if (msg.source === 'scatter_plot') return;
                
                const type = msg.type || msg.message_type;
                
                if (type === 'clear_selection' || type === 'feature_deselect') {{
                    console.log('[ScatterPlot] Received clear selection message from map');
                    clearSelection();
                    return;
                }}
                
                if (type !== 'hex_click' && type !== 'feature_click') return;

                const props = msg.properties || {{}};

                let itemId = null;
                for (const field of ID_FIELDS) {{
                    itemId = props[field] || msg[field];
                    if (itemId != null && itemId !== '') break;
                }}
                
                if (!itemId) {{
                    // Ignore malformed/partial click messages from other widgets.
                    // Only clear selection on explicit clear_selection / feature_deselect.
                    return;
                }}
                
                console.log('[ScatterPlot] Received from map:', itemId);
                
                const data = {data_json};
                const fieldData = data.find(d => d["Field Name"] === itemId);
                
                highlightField(itemId, fieldData);
                currentSelection = itemId;
            }}
        }});
        </script>
    </body>
    </html>
    """

    return html_content