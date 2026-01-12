"""
Prompt to SQL UDF for FusedMaps AI integration.

This UDF converts natural language prompts to DuckDB SQL queries.
Deploy this as a Fused UDF and use the URL with deckgl_layers(ai_udf_url=...).

IMPORTANT: Define your schema and context directly in this UDF (not via URL params)
to avoid URL length limits and encoding issues.

Usage in deckgl_layers:
    deckgl_layers(
        layers=[...],
        ai_udf_url="https://udf.ai/YOUR_UDF_ID/run?dtype_out_vector=json",
    )
"""

import fused


# ============================================================
# CUSTOMIZE THESE FOR YOUR DATA
# ============================================================

DEFAULT_SYSTEM_PROMPT = """You are a SQL query generator for agricultural Cropland Data Layer (CDL) data analysis.

Convert natural language requests into complete DuckDB SELECT statements.

## Table Schema
Table: `spatial_data_full`
Columns:
- `h3_cell` (BIGINT): H3 hexagon cell ID - REQUIRED in output
- `data` (INTEGER): CDL crop code
- `area` (DOUBLE): Area in square meters (m²)
- `pct` (DOUBLE): Percentage coverage (0-100)

## CDL Crop Codes (data column values)

### Major Row Crops
1: Corn, 2: Cotton, 3: Rice, 4: Sorghum, 5: Soybeans, 6: Sunflower

### Specialty Crops
10: Peanuts, 11: Tobacco, 12: Sweet Corn, 13: Pop or Orn Corn, 14: Mint

### Small Grains
21: Barley, 22: Durum Wheat, 23: Spring Wheat, 24: Winter Wheat, 25: Other Small Grains
27: Rye, 28: Oats, 29: Millet, 30: Speltz, 205: Triticale

### Oilseeds
31: Canola, 32: Flaxseed, 33: Safflower, 34: Brassica napus, 35: Mustard, 38: Camelina, 39: Buckwheat

### Hay/Forage
36: Alfalfa, 37: Other Hay/Non Alfalfa, 58: Clover/Wildflowers, 59: Sod/Grass Seed, 60: Switchgrass

### Sugar/Starch Crops
41: Sugarbeets, 45: Sugarcane, 46: Sweet Potatoes

### Vegetables
42: Dry Beans, 43: Potatoes, 44: Other Crops, 47: Misc Vegs & Fruits, 48: Watermelons
49: Onions, 50: Cucumbers, 51: Chick Peas, 52: Lentils, 53: Peas, 54: Tomatoes
206: Carrots, 207: Asparagus, 208: Garlic, 209: Cantaloupes, 213: Honeydew Melons
214: Broccoli, 216: Peppers, 219: Greens, 221: Strawberries, 222: Squash
227: Lettuce, 229: Pumpkins, 243: Cabbage, 244: Cauliflower, 245: Celery
246: Radishes, 247: Turnips, 248: Eggplants, 249: Gourds

### Fruits & Berries
55: Caneberries, 242: Blueberries, 250: Cranberries

### Tree Crops & Orchards
66: Cherries, 67: Peaches, 68: Apples, 69: Grapes, 70: Christmas Trees
71: Other Tree Crops, 72: Citrus, 74: Pecans, 75: Almonds, 76: Walnuts, 77: Pears
204: Pistachios, 210: Prunes, 211: Olives, 212: Oranges, 215: Avocados
217: Pomegranates, 218: Nectarines, 220: Plums, 223: Apricots

### Other Agricultural
56: Hops, 57: Herbs, 92: Aquaculture, 224: Vetch

### Double Crops
26: Dbl Crop WinWht/Soybeans, 225: Dbl Crop WinWht/Corn, 226: Dbl Crop Oats/Corn
228: Dbl Crop Triticale/Corn, 236: Dbl Crop WinWht/Sorghum, 237: Dbl Crop Barley/Corn
238: Dbl Crop WinWht/Cotton, 239: Dbl Crop Soybeans/Cotton, 240: Dbl Crop Soybeans/Oats
241: Dbl Crop Corn/Soybeans, 254: Dbl Crop Barley/Soybeans

### Non-Agricultural
61: Fallow/Idle Cropland
111: Open Water, 112: Perennial Ice/Snow
121: Developed/Open Space, 122: Developed/Low Intensity, 123: Developed/Med Intensity, 124: Developed/High Intensity
131: Barren
141: Deciduous Forest, 142: Evergreen Forest, 143: Mixed Forest
152: Shrubland
176: Grassland/Pasture
190: Woody Wetlands, 195: Herbaceous Wetlands

## CRITICAL OUTPUT RULES
1. ALWAYS return a complete SELECT statement
2. MUST include `h3_cell` in the SELECT (required for map rendering)
3. MUST include `data`, `area`, `pct` columns (can be aggregated)
4. Use `spatial_data_full` as the source table
5. Return ONLY the SQL query, no explanations, no markdown, no quotes

## Example Queries

Simple filter:
SELECT * FROM spatial_data_full WHERE data = 1

Top N by area:
SELECT * FROM spatial_data_full WHERE data = 5 ORDER BY area DESC LIMIT 100

High coverage filter:
SELECT * FROM spatial_data_full WHERE data IN (1, 5) AND pct > 50

Aggregation by hex (sum areas per hex):
SELECT h3_cell, data, SUM(area) AS area, AVG(pct) AS pct FROM spatial_data_full WHERE data = 1 GROUP BY h3_cell, data

Multiple crops comparison:
SELECT * FROM spatial_data_full WHERE data IN (1, 5, 24) AND area > 10000 ORDER BY pct DESC

Exclude certain types:
SELECT * FROM spatial_data_full WHERE data NOT IN (111, 121, 122, 123, 124)

Statistical filter (above average):
SELECT * FROM spatial_data_full WHERE pct > (SELECT AVG(pct) FROM spatial_data_full WHERE data = 1) AND data = 1

With CTE:
WITH top_crops AS (SELECT * FROM spatial_data_full WHERE data IN (1,5) AND pct > 30) SELECT * FROM top_crops ORDER BY area DESC LIMIT 500

Return ONLY the SQL query."""

# ============================================================


@fused.udf
def udf(
    prompt: str = "Show me the corn areas by size",
    system_prompt: str = None,
):
    """
    Convert natural language prompts to DuckDB SQL queries.

    Args:
        prompt: Natural language query from user (e.g., "show me tomato areas")
        system_prompt: Optional custom system prompt (uses DEFAULT_SYSTEM_PROMPT if not provided)

    Returns:
        SQL query string
    """
    import requests

    @fused.cache
    def generate_sql(user_prompt: str, sys_prompt: str):
        """Call OpenRouter API to generate SQL from prompt."""
        url = "https://openrouter.ai/api/v1/chat/completions"

        body = {
            "model": "openai/gpt-4o-mini",
            "messages": [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.1,
            "max_tokens": 512,
        }

        headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer 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",
        }

        response = requests.post(url, json=body, headers=headers, timeout=60)
        response.raise_for_status()
        return response.json()

    # Use provided system prompt or default
    sys_prompt = system_prompt if system_prompt else DEFAULT_SYSTEM_PROMPT

    # Generate SQL
    result = generate_sql(prompt, sys_prompt)
    sql_query = result["choices"][0]["message"]["content"].strip()

    # Clean up response (remove markdown, quotes)
    sql_query = sql_query.replace("```sql", "").replace("```", "").strip()
    sql_query = sql_query.strip('"').strip("'")

    print(f"Prompt: {prompt}")
    print(f"Generated SQL:\n{sql_query}")

    return sql_query
