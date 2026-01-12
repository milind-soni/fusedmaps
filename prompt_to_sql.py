"""
Prompt to SQL UDF for FusedMaps AI integration.

This UDF converts natural language prompts to DuckDB SQL queries.
Deploy this as a Fused UDF and use the URL with deckgl_layers(ai_udf_url=...).

Usage in deckgl_layers:
    deckgl_layers(
        layers=[...],
        ai_udf_url="https://udf.ai/YOUR_UDF_ID/run?dtype_out_vector=json",
        ai_schema="Table: `data`\nColumns:\n- hex (VARCHAR)...",
        ai_context="## CDL Crop Codes\n1: Corn, 2: Cotton...",
    )
"""

import fused


@fused.udf
def udf(
    prompt: str = "Show me areas with high coverage",
    schema: str = "",
    context: str = "",
):
    """
    Convert natural language prompts to DuckDB SQL queries.

    Args:
        prompt: Natural language query from user (e.g., "show me tomato areas")
        schema: Table schema string (auto-passed from frontend via ai_schema)
        context: Domain-specific context (auto-passed from frontend via ai_context)

    Returns:
        SQL query string
    """
    import requests

    def build_system_prompt(schema: str, context: str) -> str:
        """Build the system prompt for SQL generation."""
        return f"""You are a DuckDB SQL query generator for geospatial hex data.

Convert natural language requests into valid DuckDB SELECT statements.

## Schema
{schema if schema else "Table: `data` with hex column and various attributes"}

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
SELECT * FROM data WHERE category = 1 AND pct > 10

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
    print(f"Schema: {schema[:100]}..." if len(schema) > 100 else f"Schema: {schema}")
    print(f"Context: {context[:100]}..." if len(context) > 100 else f"Context: {context}")
    print(f"Generated SQL: {sql_query}")

    return sql_query
