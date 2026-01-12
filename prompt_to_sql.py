import fused


@fused.udf
def udf(
    prompt: str = "Show me the corn areas by size",
    schema: str = None,
    context: str = None,
):
    """
    Convert natural language prompts to full DuckDB SQL queries.

    Args:
        prompt: Natural language query from user
        schema: Table schema string (auto-extracted via map_utils.extract_schema())
        context: Domain-specific context (e.g., category codes)

    Returns:
        SQL query string
    """
    import requests

    # Default schema if none provided
    default_schema = """Table: `data`
Columns:
- `h3_cell` (BIGINT): H3 hexagon cell ID - REQUIRED in output
- `data` (INTEGER): Category/type code
- `area` (DOUBLE): Area in square meters (m²)
- `pct` (DOUBLE): Percentage coverage (0-100)"""

    # Default context - CDL crop codes
    default_context = """## CDL Crop Codes (data column values)

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
190: Woody Wetlands, 195: Herbaceous Wetlands"""

    # Use provided or defaults
    table_schema = schema if schema else default_schema
    domain_context = context if context else default_context

    # Build system prompt
    system_prompt = f"""You are a SQL query generator for geospatial hex data analysis.

Convert natural language requests into complete DuckDB SELECT statements.

## Schema
{table_schema}

{f"## Domain Context{chr(10)}{domain_context}" if domain_context else ""}

## CRITICAL OUTPUT RULES
1. ALWAYS return a complete SELECT statement
2. MUST include the hex/h3 column in the SELECT (required for map rendering)
3. Use `data` as the source table name
4. Return ONLY the SQL query, no explanations, no markdown, no quotes

## Example Queries

Simple filter:
SELECT * FROM data WHERE data = 1

Top N by area:
SELECT * FROM data ORDER BY area DESC LIMIT 100

High coverage filter:
SELECT * FROM data WHERE pct > 50

Multiple conditions:
SELECT * FROM data WHERE data IN (1, 5) AND pct > 30

Return ONLY the SQL query."""

    @fused.cache
    def generate_query(user_prompt: str, sys_prompt: str):
        url = "https://openrouter.ai/api/v1/chat/completions"

        body = {
            "model": "openai/gpt-4o-mini",
            "messages": [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.1,
            "max_tokens": 512
        }

        headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer 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",
        }

        response = requests.post(url, json=body, headers=headers, timeout=60)
        response.raise_for_status()
        return response.json()

    result = generate_query(prompt, system_prompt)

    sql_query = result["choices"][0]["message"]["content"].strip()
    sql_query = sql_query.replace("```sql", "").replace("```", "").strip()
    sql_query = sql_query.strip('"').strip("'")

    print(f"Prompt: {prompt}")
    print(f"Generated SQL:\n{sql_query}")

    return sql_query
