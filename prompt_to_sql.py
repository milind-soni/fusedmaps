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

# Define your table schema here
DEFAULT_SCHEMA = """Table: `data`
Columns:
- hex (VARCHAR): H3 hexagon ID - REQUIRED in all SELECT queries
- data (INTEGER): Category/type code
- area (DOUBLE): Area in square meters
- pct (DOUBLE): Percentage coverage (0-100)"""

# Define domain-specific context here (e.g., category codes)
DEFAULT_CONTEXT = """## Category Codes
1: Type A
2: Type B
3: Type C
"""

# ============================================================


@fused.udf
def udf(
    prompt: str = "Show me areas with high coverage",
):
    """
    Convert natural language prompts to DuckDB SQL queries.

    Args:
        prompt: Natural language query from user (e.g., "show me tomato areas")

    Returns:
        SQL query string
    """
    import requests

    # Use the constants defined above
    schema = DEFAULT_SCHEMA
    context = DEFAULT_CONTEXT

    def build_system_prompt(schema: str, context: str) -> str:
        """Build the system prompt for SQL generation."""
        return f"""You are a DuckDB SQL query generator for geospatial hex data.

Convert natural language requests into valid DuckDB SELECT statements.

## Schema
{schema}

{f"## Domain Context{chr(10)}{context}" if context else ""}

## CRITICAL RULES
1. ALWAYS include the hex column in SELECT (required for map rendering)
2. Use `data` as the table name
3. Return ONLY the SQL query - no explanations, no markdown, no code blocks, no quotes
4. For filtering, use WHERE clauses
5. Keep queries focused on filtering/aggregating the spatial data

## Example Queries

Filter by value:
SELECT * FROM data WHERE value > 50

Top N results:
SELECT * FROM data ORDER BY area DESC LIMIT 100

Multiple conditions:
SELECT * FROM data WHERE data = 1 AND pct > 10

Aggregation (keep hex column):
SELECT hex, SUM(area) as total_area FROM data GROUP BY hex

Return ONLY the SQL query."""

    @fused.cache
    def generate_sql(user_prompt: str, sys_prompt: str):
        """Call Fused's OpenRouter proxy to generate SQL from prompt."""
        url = "https://unstable.fused.io/server/v1/ai/openrouter"

        body = {
            "model": "openai/gpt-4o-mini",
            "messages": [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.1,
            "max_tokens": 512,
        }

        fused_token = fused.api.AUTHORIZATION.credentials.access_token
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {fused_token}",
        }

        response = requests.post(url, json=body, headers=headers, timeout=60)
        response.raise_for_status()
        return response.json()

    # Build system prompt with schema and context
    system_prompt = build_system_prompt(schema, context)

    # Generate SQL
    result = generate_sql(prompt, system_prompt)
    sql_query = result["choices"][0]["message"]["content"].strip()

    # Clean up response (remove markdown, quotes)
    sql_query = sql_query.replace("```sql", "").replace("```", "").strip()
    sql_query = sql_query.strip('"').strip("'")

    print(f"Prompt: {prompt}")
    print(f"Generated SQL: {sql_query}")

    return sql_query
