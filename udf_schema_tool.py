@fused.udf(cache_max_age='30m')
def udf(
    query: str = "color",
    schema_url: str = "https://cdn.jsdelivr.net/gh/milind-soni/fusedmaps@main/fusedmaps.schema.json"
):
    """
    AI Tool: Search FusedMaps JSON schema for config options.

    Use this to find how to configure maps. Search for terms like:
    - "color" - color configuration options
    - "hex" - hexagon layer settings
    - "vector" - vector/GeoJSON layer settings
    - "style" - styling options (fill, stroke, opacity)
    - "widget" - UI widget positioning
    - "view" - map view/camera settings

    Returns matching schema definitions with full JSON structure.
    """
    import requests
    import json
    import pandas as pd
    from difflib import SequenceMatcher

    # Fetch schema
    response = requests.get(schema_url)
    schema = response.json()

    # Flatten schema into searchable entries
    entries = []

    def extract_entries(obj, path=""):
        if not isinstance(obj, dict):
            return

        if "properties" in obj:
            for prop_name, prop_def in obj["properties"].items():
                prop_path = f"{path}.{prop_name}" if path else prop_name
                entries.append({
                    "path": prop_path,
                    "name": prop_name,
                    "type": prop_def.get("type", prop_def.get("const", "ref")),
                    "description": prop_def.get("description", ""),
                    "schema": json.dumps(prop_def, indent=2)
                })
                extract_entries(prop_def, prop_path)

        if "$defs" in obj:
            for def_name, def_obj in obj["$defs"].items():
                entries.append({
                    "path": f"$defs.{def_name}",
                    "name": def_name,
                    "type": def_obj.get("type", "object"),
                    "description": def_obj.get("description", ""),
                    "schema": json.dumps(def_obj, indent=2)
                })
                extract_entries(def_obj, f"$defs.{def_name}")

        if "items" in obj:
            extract_entries(obj["items"], f"{path}[]")

        for key in ["oneOf", "allOf", "anyOf"]:
            if key in obj:
                for i, sub in enumerate(obj[key]):
                    extract_entries(sub, f"{path}.{key}[{i}]")

    extract_entries(schema)

    # Score matches
    query_lower = query.lower()

    def score(row):
        name = str(row["name"]).lower()
        path = str(row["path"]).lower()
        desc = str(row["description"]).lower()

        s = 0
        if query_lower == name: s += 100
        elif query_lower in name: s += 50
        elif name in query_lower: s += 30
        s += SequenceMatcher(None, query_lower, name).ratio() * 20
        if query_lower in path: s += 25
        if query_lower in desc: s += 15
        return s

    df = pd.DataFrame(entries)
    df["score"] = df.apply(score, axis=1)
    df = df[df["score"] > 10].sort_values("score", ascending=False).head(10)

    return df[["path", "name", "type", "description", "schema", "score"]]
