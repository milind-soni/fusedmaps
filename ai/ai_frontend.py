@fused.udf
def udf():
    """
    AI-powered map agent that can switch layers via natural language.
    Uses tool calling to control layer visibility on an interactive map.
    """
    import json
    
    OPENROUTER_API_KEY = fused.secrets["openrouter_api_key"]
    MAPBOX_TOKEN = "pk.eyJ1IjoiaXNhYWNmdXNlZGxhYnMiLCJhIjoiY2xicGdwdHljMHQ1bzN4cWhtNThvbzdqcSJ9.73fb6zHMeO_c8eAXpZVNrA"
    
    # Define available layers with their data sources
    LAYERS_CONFIG = [
        {
            "id": "corn",
            "name": "Corn",
            "description": "Corn cultivation areas across the US (CDL code 1)",
            "color": [255, 200, 50],
            "visible": True
        },
        {
            "id": "soybeans",
            "name": "Soybeans", 
            "description": "Soybean cultivation areas (CDL code 5)",
            "color": [100, 180, 100],
            "visible": False
        },
        {
            "id": "wheat",
            "name": "Winter Wheat",
            "description": "Winter wheat cultivation areas (CDL code 24)",
            "color": [200, 150, 80],
            "visible": False
        },
        {
            "id": "cotton",
            "name": "Cotton",
            "description": "Cotton cultivation areas (CDL code 2)",
            "color": [240, 240, 240],
            "visible": False
        },
        {
            "id": "forest",
            "name": "Forest",
            "description": "Forested areas including deciduous, evergreen, and mixed (CDL codes 141-143)",
            "color": [50, 120, 50],
            "visible": False
        }
    ]
    
    LAYERS_JSON = json.dumps(LAYERS_CONFIG)
    
    # Tool definitions for the AI
    TOOLS_CONFIG = [
        {
            "name": "show_layer",
            "description": "Show/enable a specific layer on the map. Use this when user wants to see a particular crop or land type.",
            "parameters": {
                "type": "object",
                "properties": {
                    "layer_id": {
                        "type": "string",
                        "description": "The layer ID to show. One of: corn, soybeans, wheat, cotton, forest",
                        "enum": ["corn", "soybeans", "wheat", "cotton", "forest"]
                    }
                },
                "required": ["layer_id"]
            }
        },
        {
            "name": "hide_layer",
            "description": "Hide/disable a specific layer on the map.",
            "parameters": {
                "type": "object",
                "properties": {
                    "layer_id": {
                        "type": "string",
                        "description": "The layer ID to hide. One of: corn, soybeans, wheat, cotton, forest",
                        "enum": ["corn", "soybeans", "wheat", "cotton", "forest"]
                    }
                },
                "required": ["layer_id"]
            }
        },
        {
            "name": "show_only_layer",
            "description": "Show ONLY one specific layer and hide all others. Use when user wants to focus on just one crop type.",
            "parameters": {
                "type": "object",
                "properties": {
                    "layer_id": {
                        "type": "string",
                        "description": "The layer ID to show exclusively",
                        "enum": ["corn", "soybeans", "wheat", "cotton", "forest"]
                    }
                },
                "required": ["layer_id"]
            }
        },
        {
            "name": "show_all_layers",
            "description": "Show all available layers on the map.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        },
        {
            "name": "hide_all_layers",
            "description": "Hide all layers from the map.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        },
        {
            "name": "get_visible_layers",
            "description": "Get a list of currently visible layers on the map.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        },
        {
            "name": "compare_layers",
            "description": "Show two layers for comparison, hiding all others.",
            "parameters": {
                "type": "object",
                "properties": {
                    "layer1": {
                        "type": "string",
                        "enum": ["corn", "soybeans", "wheat", "cotton", "forest"]
                    },
                    "layer2": {
                        "type": "string", 
                        "enum": ["corn", "soybeans", "wheat", "cotton", "forest"]
                    }
                },
                "required": ["layer1", "layer2"]
            }
        }
    ]
    
    TOOLS_JSON = json.dumps(TOOLS_CONFIG)
    
    SYSTEM_PROMPT = """You are a helpful map assistant that controls agricultural crop layer visibility.

You have access to a map showing US Cropland Data Layer (CDL) information with these layers:
- corn: Corn cultivation areas (yellow)
- soybeans: Soybean areas (green)  
- wheat: Winter wheat areas (tan/brown)
- cotton: Cotton areas (white)
- forest: Forested areas (dark green)

Use the available tools to show/hide layers based on user requests.
Be helpful and explain what you're doing. Keep responses concise.

Examples of what users might ask:
- "Show me where corn is grown" → use show_only_layer with corn
- "Compare corn and soybeans" → use compare_layers
- "Add wheat to the map" → use show_layer with wheat
- "Clear the map" → use hide_all_layers
- "What am I looking at?" → use get_visible_layers
"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Map AI Agent</title>
  <script src="https://api.mapbox.com/mapbox-gl-js/v3.2.0/mapbox-gl.js"></script>
  <link href="https://api.mapbox.com/mapbox-gl-js/v3.2.0/mapbox-gl.css" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      background: #111; 
      height: 100vh;
      display: flex;
    }}
    
    /* Map Container */
    #map {{ 
      flex: 1; 
      height: 100%; 
    }}
    
    /* Chat Panel */
    .chat-panel {{
      width: 380px;
      height: 100%;
      background: #1a1a1d;
      display: flex;
      flex-direction: column;
      border-left: 1px solid #333;
    }}
    
    .chat-header {{
      padding: 16px;
      border-bottom: 1px solid #333;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }}
    .chat-header h3 {{ color: #e8e8ea; font-size: 14px; }}
    .clear-btn {{
      padding: 6px 12px;
      border-radius: 6px;
      border: none;
      background: #333;
      color: #aaa;
      font-size: 11px;
      cursor: pointer;
    }}
    .clear-btn:hover {{ background: #444; color: #fff; }}
    
    .messages {{
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }}
    .message {{
      margin-bottom: 12px;
      display: flex;
    }}
    .message.user {{ justify-content: flex-end; }}
    .message.assistant {{ justify-content: flex-start; }}
    .message-content {{
      padding: 10px 14px;
      border-radius: 14px;
      max-width: 85%;
      font-size: 13px;
      line-height: 1.4;
    }}
    .message.user .message-content {{
      background: #f5f5f7;
      color: #1a1a1a;
    }}
    .message.assistant .message-content {{
      background: #2d2d32;
      color: #e8e8ea;
    }}
    .message.assistant .message-content code {{
      background: #1a1a1d;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
    }}
    
    .loading {{
      display: flex;
      gap: 4px;
      padding: 10px 14px;
    }}
    .loading span {{
      width: 6px;
      height: 6px;
      background: #666;
      border-radius: 50%;
      animation: bounce 1.4s ease-in-out infinite;
    }}
    .loading span:nth-child(1) {{ animation-delay: 0s; }}
    .loading span:nth-child(2) {{ animation-delay: 0.2s; }}
    .loading span:nth-child(3) {{ animation-delay: 0.4s; }}
    @keyframes bounce {{
      0%, 80%, 100% {{ transform: translateY(0); }}
      40% {{ transform: translateY(-8px); }}
    }}
    
    .input-area {{
      padding: 12px;
      border-top: 1px solid #333;
      display: flex;
      gap: 8px;
    }}
    .input-area input {{
      flex: 1;
      padding: 10px 14px;
      border-radius: 20px;
      border: 1px solid #333;
      background: #26262b;
      color: #e8e8ea;
      font-size: 13px;
      outline: none;
    }}
    .input-area input:focus {{ border-color: #555; }}
    .input-area input::placeholder {{ color: #666; }}
    .send-btn {{
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: none;
      background: #4a4a52;
      color: #e8e8ea;
      cursor: pointer;
      font-size: 14px;
    }}
    .send-btn:hover {{ background: #5a5a62; }}
    .send-btn:disabled {{ opacity: 0.5; cursor: not-allowed; }}
    
    /* Layer Panel */
    .layer-panel {{
      position: absolute;
      top: 12px;
      right: 392px;
      background: rgba(26,26,29,0.95);
      border: 1px solid #444;
      border-radius: 8px;
      padding: 8px 0;
      min-width: 140px;
      z-index: 10;
    }}
    .layer-item {{
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      cursor: pointer;
      font-size: 12px;
      color: #ccc;
    }}
    .layer-item:hover {{ background: rgba(255,255,255,0.05); }}
    .layer-item.hidden {{ opacity: 0.4; }}
    .layer-swatch {{
      width: 12px;
      height: 12px;
      border-radius: 3px;
      border: 1px solid rgba(255,255,255,0.2);
    }}
    .layer-eye {{
      margin-left: auto;
      font-size: 10px;
      color: #888;
    }}
  </style>
</head>
<body>
  <div id="map"></div>
  
  <div class="layer-panel" id="layerPanel"></div>
  
  <div class="chat-panel">
    <div class="chat-header">
      <h3>Map AI Agent</h3>
      <button class="clear-btn" id="clearBtn">Clear</button>
    </div>
    <div class="messages" id="messages"></div>
    <div class="input-area">
      <input type="text" id="input" placeholder="Ask about crops... e.g. 'Show me corn'" />
      <button class="send-btn" id="sendBtn">➤</button>
    </div>
  </div>

  <script>
    // Config
    const MAPBOX_TOKEN = "{MAPBOX_TOKEN}";
    const OPENROUTER_API_KEY = "{OPENROUTER_API_KEY}";
    const LAYERS_CONFIG = {LAYERS_JSON};
    const TOOLS_CONFIG = {TOOLS_JSON};
    const SYSTEM_PROMPT = `{SYSTEM_PROMPT}`;
    
    // State
    let layerVisibility = {{}};
    LAYERS_CONFIG.forEach(l => layerVisibility[l.id] = l.visible);
    
    let messages = [];
    let isLoading = false;
    
    // Elements
    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    const clearBtn = document.getElementById('clearBtn');
    const layerPanelEl = document.getElementById('layerPanel');
    
    // Initialize map
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({{
      container: 'map',
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-96, 39],
      zoom: 4,
      dragRotate: false
    }});
    
    map.on('load', () => {{
      // Add placeholder sources and layers for each crop type
      // In a real app, these would be actual tile sources
      LAYERS_CONFIG.forEach(layer => {{
        // Using a simple circle layer with sample points as demo
        // In production, replace with actual hex tile URLs
        map.addSource(layer.id, {{
          type: 'geojson',
          data: {{ type: 'FeatureCollection', features: [] }}
        }});
        
        map.addLayer({{
          id: layer.id,
          type: 'circle',
          source: layer.id,
          paint: {{
            'circle-radius': 8,
            'circle-color': `rgb(${{layer.color.join(',')}})`,
            'circle-opacity': 0.7
          }},
          layout: {{
            'visibility': layer.visible ? 'visible' : 'none'
          }}
        }});
      }});
      
      renderLayerPanel();
      
      // Welcome message
      messages.push({{
        role: 'assistant',
        content: "👋 Hi! I'm your map AI agent. I can control which crop layers are visible on the map.\\n\\nTry asking me things like:\\n- \\"Show me where soybeans are grown\\"\\n- \\"Compare corn and wheat\\"\\n- \\"Hide all layers\\"\\n- \\"What layers are visible?\\""
      }});
      renderMessages();
    }});
    
    // Render layer panel
    function renderLayerPanel() {{
      layerPanelEl.innerHTML = LAYERS_CONFIG.map(layer => {{
        const isVisible = layerVisibility[layer.id];
        return `
          <div class="layer-item ${{isVisible ? '' : 'hidden'}}" data-id="${{layer.id}}">
            <div class="layer-swatch" style="background: rgb(${{layer.color.join(',')}})"></div>
            <span>${{layer.name}}</span>
            <span class="layer-eye">${{isVisible ? '👁' : '○'}}</span>
          </div>
        `;
      }}).join('');
      
      // Click handlers
      layerPanelEl.querySelectorAll('.layer-item').forEach(item => {{
        item.addEventListener('click', () => {{
          const id = item.dataset.id;
          toggleLayer(id);
        }});
      }});
    }}
    
    // Layer control functions
    function setLayerVisibility(layerId, visible) {{
      layerVisibility[layerId] = visible;
      if (map.getLayer(layerId)) {{
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }}
      renderLayerPanel();
    }}
    
    function toggleLayer(layerId) {{
      setLayerVisibility(layerId, !layerVisibility[layerId]);
    }}
    
    function showOnlyLayer(layerId) {{
      LAYERS_CONFIG.forEach(l => {{
        setLayerVisibility(l.id, l.id === layerId);
      }});
    }}
    
    function showAllLayers() {{
      LAYERS_CONFIG.forEach(l => setLayerVisibility(l.id, true));
    }}
    
    function hideAllLayers() {{
      LAYERS_CONFIG.forEach(l => setLayerVisibility(l.id, false));
    }}
    
    function getVisibleLayers() {{
      return LAYERS_CONFIG.filter(l => layerVisibility[l.id]).map(l => l.name);
    }}
    
    // Tool execution
    function executeTool(name, params) {{
      switch(name) {{
        case 'show_layer':
          setLayerVisibility(params.layer_id, true);
          return `Showing ${{params.layer_id}} layer`;
        case 'hide_layer':
          setLayerVisibility(params.layer_id, false);
          return `Hiding ${{params.layer_id}} layer`;
        case 'show_only_layer':
          showOnlyLayer(params.layer_id);
          return `Now showing only ${{params.layer_id}} layer`;
        case 'show_all_layers':
          showAllLayers();
          return `Showing all layers`;
        case 'hide_all_layers':
          hideAllLayers();
          return `All layers hidden`;
        case 'get_visible_layers':
          const visible = getVisibleLayers();
          return visible.length > 0 
            ? `Visible layers: ${{visible.join(', ')}}` 
            : `No layers are currently visible`;
        case 'compare_layers':
          LAYERS_CONFIG.forEach(l => {{
            setLayerVisibility(l.id, l.id === params.layer1 || l.id === params.layer2);
          }});
          return `Comparing ${{params.layer1}} and ${{params.layer2}}`;
        default:
          return `Unknown tool: ${{name}}`;
      }}
    }}
    
    // Render messages
    function renderMessages() {{
      messagesEl.innerHTML = messages
        .filter(m => m.role !== 'tool')
        .map(m => `
          <div class="message ${{m.role}}">
            <div class="message-content">${{
              m.role === 'assistant' ? marked.parse(m.content || '') : m.content
            }}</div>
          </div>
        `).join('');
      
      if (isLoading) {{
        messagesEl.innerHTML += `
          <div class="message assistant">
            <div class="loading"><span></span><span></span><span></span></div>
          </div>
        `;
      }}
      
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }}
    
    // Call OpenRouter
    async function callLLM(apiMessages) {{
      const tools = TOOLS_CONFIG.map(t => ({{
        type: 'function',
        function: {{
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }}
      }}));
      
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {{
        method: 'POST',
        headers: {{
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${{OPENROUTER_API_KEY}}`
        }},
        body: JSON.stringify({{
          model: 'openai/gpt-oss-20b',
          messages: [
            {{ role: 'system', content: SYSTEM_PROMPT }},
            ...apiMessages
          ],
          tools,
          tool_choice: 'auto',
          max_tokens: 500,
          temperature: 0.1
        }})
      }});
      
      if (!resp.ok) throw new Error(`API error: ${{resp.status}}`);
      const data = await resp.json();
      return data.choices?.[0]?.message || {{}};
    }}
    
    // Send message
    async function sendMessage() {{
      const text = inputEl.value.trim();
      if (!text || isLoading) return;
      
      messages.push({{ role: 'user', content: text }});
      inputEl.value = '';
      isLoading = true;
      renderMessages();
      
      try {{
        let apiMessages = messages.filter(m => m.role !== 'tool').map(m => ({{
          role: m.role,
          content: m.content
        }}));
        
        let rounds = 0;
        while (rounds < 5) {{
          rounds++;
          const response = await callLLM(apiMessages);
          
          // If no tool calls, just show the response
          if (!response.tool_calls || response.tool_calls.length === 0) {{
            if (response.content) {{
              messages.push({{ role: 'assistant', content: response.content }});
            }}
            break;
          }}
          
          // Execute tool calls
          apiMessages.push({{
            role: 'assistant',
            content: response.content || '',
            tool_calls: response.tool_calls
          }});
          
          for (const tc of response.tool_calls) {{
            const params = JSON.parse(tc.function.arguments || '{{}}');
            const result = executeTool(tc.function.name, params);
            
            apiMessages.push({{
              role: 'tool',
              content: result,
              tool_call_id: tc.id
            }});
          }}
        }}
      }} catch (err) {{
        console.error(err);
        messages.push({{ role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }});
      }}
      
      isLoading = false;
      renderMessages();
    }}
    
    // Event listeners
    inputEl.addEventListener('keydown', e => {{
      if (e.key === 'Enter') sendMessage();
    }});
    sendBtn.addEventListener('click', sendMessage);
    clearBtn.addEventListener('click', () => {{
      messages = [{{
        role: 'assistant',
        content: "Chat cleared! Ask me to show or hide crop layers on the map."
      }}];
      renderMessages();
    }});
  </script>
</body>
</html>"""
    
    return html

