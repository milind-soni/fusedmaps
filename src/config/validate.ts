/**
 * Deep validation with actionable error messages for AI agents.
 *
 * When AI agents generate invalid configs, these errors help them
 * understand exactly what went wrong and how to fix it.
 */

import { ALL_PALETTES, findClosestPalette } from '../schema/palettes';

/**
 * Validation error with path and suggestion
 */
export interface ValidationError {
  /** JSON path to the error (e.g., "layers[0].style.fillColor.palette") */
  path: string;
  /** Human-readable error message */
  message: string;
  /** Suggestion for how to fix the error */
  suggestion?: string;
  /** The value that was received */
  received?: unknown;
  /** Description of what was expected */
  expected?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether the config is valid */
  valid: boolean;
  /** List of validation errors */
  errors: ValidationError[];
  /** Non-fatal warnings */
  warnings: string[];
}

const VALID_LAYER_TYPES = ['hex', 'vector', 'mvt', 'raster', 'pmtiles'] as const;
const VALID_BASEMAPS = ['dark', 'light', 'streets', 'satellite', 'none'] as const;

/**
 * Validate a FusedMaps configuration.
 * Returns detailed errors with paths and suggestions.
 */
export function validate(config: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // Check config is an object
  if (!config || typeof config !== 'object') {
    errors.push({
      path: '',
      message: 'Config must be an object',
      received: typeof config,
      expected: 'object'
    });
    return { valid: false, errors, warnings };
  }

  const cfg = config as Record<string, unknown>;

  // Validate center if provided
  if (cfg.center !== undefined) {
    if (!Array.isArray(cfg.center) || cfg.center.length !== 2) {
      errors.push({
        path: 'center',
        message: 'center must be [longitude, latitude] array',
        received: cfg.center,
        expected: '[number, number]',
        suggestion: 'Example: [-122.4, 37.8] for San Francisco'
      });
    } else {
      const [lng, lat] = cfg.center as number[];
      if (typeof lng !== 'number' || typeof lat !== 'number') {
        errors.push({
          path: 'center',
          message: 'center coordinates must be numbers',
          received: cfg.center,
          expected: '[number, number]'
        });
      } else {
        if (lng < -180 || lng > 180) {
          errors.push({
            path: 'center[0]',
            message: 'longitude must be between -180 and 180',
            received: lng,
            expected: '-180 to 180'
          });
        }
        if (lat < -90 || lat > 90) {
          errors.push({
            path: 'center[1]',
            message: 'latitude must be between -90 and 90',
            received: lat,
            expected: '-90 to 90'
          });
        }
        // Common mistake: swapped lat/lng
        if (Math.abs(lng) <= 90 && Math.abs(lat) > 90) {
          warnings.push('center coordinates may be swapped - format is [longitude, latitude], not [latitude, longitude]');
        }
      }
    }
  }

  // Validate zoom if provided
  if (cfg.zoom !== undefined) {
    if (typeof cfg.zoom !== 'number' || cfg.zoom < 0 || cfg.zoom > 22) {
      errors.push({
        path: 'zoom',
        message: 'zoom must be a number between 0 and 22',
        received: cfg.zoom,
        expected: 'number (0-22)'
      });
    }
  }

  // Validate basemap if provided
  if (cfg.basemap !== undefined) {
    if (!VALID_BASEMAPS.includes(cfg.basemap as any)) {
      errors.push({
        path: 'basemap',
        message: `Invalid basemap: "${cfg.basemap}"`,
        received: cfg.basemap,
        expected: VALID_BASEMAPS.join(' | '),
        suggestion: `Use one of: ${VALID_BASEMAPS.join(', ')}`
      });
    }
  }

  // Validate layers array
  if (!cfg.layers) {
    errors.push({
      path: 'layers',
      message: 'layers array is required',
      expected: 'array of layer configs'
    });
    return { valid: false, errors, warnings };
  }

  if (!Array.isArray(cfg.layers)) {
    errors.push({
      path: 'layers',
      message: 'layers must be an array',
      received: typeof cfg.layers,
      expected: 'array'
    });
    return { valid: false, errors, warnings };
  }

  if (cfg.layers.length === 0) {
    warnings.push('layers array is empty - map will show only basemap');
  }

  // Validate each layer
  (cfg.layers as unknown[]).forEach((layer, index) => {
    validateLayer(layer, `layers[${index}]`, errors, warnings);
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate a single layer config
 */
function validateLayer(
  layer: unknown,
  path: string,
  errors: ValidationError[],
  warnings: string[]
): void {
  if (!layer || typeof layer !== 'object') {
    errors.push({
      path,
      message: 'Layer must be an object',
      received: typeof layer,
      expected: 'object'
    });
    return;
  }

  const l = layer as Record<string, unknown>;

  // Layer type is required
  if (!l.layerType) {
    errors.push({
      path: `${path}.layerType`,
      message: 'layerType is required',
      expected: VALID_LAYER_TYPES.join(' | '),
      suggestion: 'Common types: "hex" for H3 hexagons, "vector" for GeoJSON'
    });
    return;
  }

  // Validate layer type
  if (!VALID_LAYER_TYPES.includes(l.layerType as any)) {
    const suggestion = findClosestLayerType(l.layerType as string);
    errors.push({
      path: `${path}.layerType`,
      message: `Invalid layerType: "${l.layerType}"`,
      received: l.layerType,
      expected: VALID_LAYER_TYPES.join(' | '),
      suggestion: suggestion ? `Did you mean "${suggestion}"?` : undefined
    });
    return;
  }

  // Validate data source based on layer type
  const layerType = l.layerType as string;

  if (layerType === 'hex') {
    validateHexLayer(l, path, errors, warnings);
  } else if (layerType === 'vector') {
    validateVectorLayer(l, path, errors, warnings);
  } else if (layerType === 'mvt') {
    if (!l.tileUrl) {
      errors.push({
        path: `${path}.tileUrl`,
        message: 'MVT layer requires tileUrl',
        expected: 'URL with {z}/{x}/{y} placeholders'
      });
    }
  } else if (layerType === 'raster') {
    if (!l.tileUrl && !l.imageUrl) {
      errors.push({
        path: `${path}`,
        message: 'Raster layer requires tileUrl or imageUrl',
        suggestion: 'Provide tileUrl for XYZ tiles or imageUrl for static image overlay'
      });
    }
  } else if (layerType === 'pmtiles') {
    if (!l.pmtilesUrl) {
      errors.push({
        path: `${path}.pmtilesUrl`,
        message: 'PMTiles layer requires pmtilesUrl',
        expected: 'URL to .pmtiles file'
      });
    }
  }

  // Validate style if present
  if (l.style) {
    validateStyle(l.style, `${path}.style`, errors, warnings);
  }

  // Validate id if present
  if (l.id !== undefined && typeof l.id !== 'string') {
    errors.push({
      path: `${path}.id`,
      message: 'id must be a string',
      received: typeof l.id,
      expected: 'string'
    });
  }

  // Validate tooltip if present
  if (l.tooltip !== undefined) {
    if (!Array.isArray(l.tooltip)) {
      errors.push({
        path: `${path}.tooltip`,
        message: 'tooltip must be an array of property names',
        received: typeof l.tooltip,
        expected: 'string[]'
      });
    } else if (!l.tooltip.every((t: unknown) => typeof t === 'string')) {
      errors.push({
        path: `${path}.tooltip`,
        message: 'tooltip array must contain only strings',
        expected: 'string[]'
      });
    }
  }
}

/**
 * Validate hex layer specific requirements
 */
function validateHexLayer(
  layer: Record<string, unknown>,
  path: string,
  errors: ValidationError[],
  warnings: string[]
): void {
  const hasData = layer.data !== undefined;
  const hasDataUrl = layer.dataUrl !== undefined;
  const hasTileUrl = layer.tileUrl !== undefined;
  const hasParquetUrl = layer.parquetUrl !== undefined;

  if (!hasData && !hasDataUrl && !hasTileUrl && !hasParquetUrl) {
    errors.push({
      path,
      message: 'Hex layer requires a data source',
      suggestion: 'Provide one of: data (inline H3 array), dataUrl, tileUrl, or parquetUrl'
    });
    return;
  }

  // Validate inline data
  if (hasData) {
    if (!Array.isArray(layer.data)) {
      errors.push({
        path: `${path}.data`,
        message: 'data must be an array of objects with h3 indices',
        received: typeof layer.data,
        expected: 'array',
        suggestion: 'Example: [{ h3: "8928308280fffff", value: 100 }]'
      });
    } else if (layer.data.length > 0) {
      const firstItem = (layer.data as any[])[0];
      if (!firstItem.h3 && !firstItem.H3 && !firstItem.hex) {
        errors.push({
          path: `${path}.data[0]`,
          message: 'H3 data items must have an "h3" property with the H3 index',
          received: Object.keys(firstItem).join(', '),
          expected: 'object with "h3" property',
          suggestion: 'Each item needs: { h3: "8928308280fffff", ...otherProps }'
        });
      }
    }
  }
}

/**
 * Validate vector layer specific requirements
 */
function validateVectorLayer(
  layer: Record<string, unknown>,
  path: string,
  errors: ValidationError[],
  warnings: string[]
): void {
  const hasData = layer.data !== undefined;
  const hasDataUrl = layer.dataUrl !== undefined;
  const hasGeojson = layer.geojson !== undefined;

  if (!hasData && !hasDataUrl && !hasGeojson) {
    errors.push({
      path,
      message: 'Vector layer requires a data source',
      suggestion: 'Provide one of: data (GeoJSON), dataUrl (URL to GeoJSON), or geojson'
    });
    return;
  }

  // Validate GeoJSON structure
  const geojson = (layer.data || layer.geojson) as Record<string, unknown> | undefined;
  if (geojson && typeof geojson === 'object') {
    if (geojson.type !== 'FeatureCollection') {
      errors.push({
        path: `${path}.data.type`,
        message: 'GeoJSON must be a FeatureCollection',
        received: geojson.type,
        expected: '"FeatureCollection"',
        suggestion: 'Wrap features in: { type: "FeatureCollection", features: [...] }'
      });
    } else if (!Array.isArray(geojson.features)) {
      errors.push({
        path: `${path}.data.features`,
        message: 'FeatureCollection must have a features array',
        expected: 'array of Feature objects'
      });
    }
  }
}

/**
 * Validate style configuration
 */
function validateStyle(
  style: unknown,
  path: string,
  errors: ValidationError[],
  warnings: string[]
): void {
  if (typeof style !== 'object' || style === null) {
    errors.push({
      path,
      message: 'style must be an object',
      received: typeof style,
      expected: 'object'
    });
    return;
  }

  const s = style as Record<string, unknown>;

  // Validate fillColor
  if (s.fillColor !== undefined) {
    validateColorValue(s.fillColor, `${path}.fillColor`, errors, warnings);
  }

  // Validate lineColor
  if (s.lineColor !== undefined) {
    validateColorValue(s.lineColor, `${path}.lineColor`, errors, warnings);
  }

  // Validate opacity
  if (s.opacity !== undefined) {
    if (typeof s.opacity !== 'number' || s.opacity < 0 || s.opacity > 1) {
      errors.push({
        path: `${path}.opacity`,
        message: 'opacity must be a number between 0 and 1',
        received: s.opacity,
        expected: 'number (0-1)'
      });
    }
  }

  // Validate pointRadius
  if (s.pointRadius !== undefined) {
    if (typeof s.pointRadius !== 'number' || s.pointRadius < 0) {
      errors.push({
        path: `${path}.pointRadius`,
        message: 'pointRadius must be a positive number',
        received: s.pointRadius,
        expected: 'number > 0'
      });
    }
  }

  // Validate lineWidth
  if (s.lineWidth !== undefined) {
    if (typeof s.lineWidth !== 'number' || s.lineWidth < 0) {
      errors.push({
        path: `${path}.lineWidth`,
        message: 'lineWidth must be a positive number',
        received: s.lineWidth,
        expected: 'number > 0'
      });
    }
  }
}

/**
 * Validate a color value (can be string, array, or color scale object)
 */
function validateColorValue(
  color: unknown,
  path: string,
  errors: ValidationError[],
  warnings: string[]
): void {
  // String color (CSS color)
  if (typeof color === 'string') {
    // Basic validation - could be hex, rgb(), or named color
    if (!color.match(/^#[0-9a-f]{3,8}$/i) &&
        !color.match(/^(rgb|rgba|hsl|hsla)\s*\(/i) &&
        !isNamedColor(color)) {
      warnings.push(`${path}: "${color}" may not be a valid CSS color`);
    }
    return;
  }

  // RGB(A) array
  if (Array.isArray(color)) {
    if (color.length < 3 || color.length > 4) {
      errors.push({
        path,
        message: 'Color array must have 3 (RGB) or 4 (RGBA) elements',
        received: `array of length ${color.length}`,
        expected: '[r, g, b] or [r, g, b, a]'
      });
      return;
    }

    const allNumbers = color.every(v => typeof v === 'number');
    if (!allNumbers) {
      errors.push({
        path,
        message: 'Color array must contain only numbers',
        received: color.map(v => typeof v).join(', '),
        expected: 'numbers'
      });
      return;
    }

    // Check if values are in 0-1 range (common AI mistake)
    const maxVal = Math.max(...color);
    if (maxVal <= 1 && color.some(v => v > 0 && v < 1)) {
      warnings.push(`${path}: Color values appear to be in 0-1 range. FusedMaps expects 0-255. Will auto-convert.`);
    }

    return;
  }

  // Color scale object
  if (typeof color === 'object' && color !== null) {
    const c = color as Record<string, unknown>;

    if (!c.type) {
      errors.push({
        path: `${path}.type`,
        message: 'Color scale must have a "type" property',
        expected: '"continuous" or "categorical"'
      });
      return;
    }

    if (c.type !== 'continuous' && c.type !== 'categorical') {
      errors.push({
        path: `${path}.type`,
        message: `Invalid color scale type: "${c.type}"`,
        received: c.type,
        expected: '"continuous" or "categorical"',
        suggestion: c.type === 'linear' ? 'Did you mean "continuous"?' : undefined
      });
      return;
    }

    // attr is required
    if (!c.attr) {
      errors.push({
        path: `${path}.attr`,
        message: 'Color scale requires "attr" - the data property to map to color',
        suggestion: 'Example: { type: "continuous", attr: "value", palette: "Viridis" }'
      });
    } else if (typeof c.attr !== 'string') {
      errors.push({
        path: `${path}.attr`,
        message: 'attr must be a string (property name)',
        received: typeof c.attr,
        expected: 'string'
      });
    }

    // Validate palette
    if (c.palette !== undefined) {
      if (typeof c.palette !== 'string') {
        errors.push({
          path: `${path}.palette`,
          message: 'palette must be a string',
          received: typeof c.palette,
          expected: 'string'
        });
      } else if (!ALL_PALETTES.includes(c.palette as any)) {
        const closest = findClosestPalette(c.palette);
        errors.push({
          path: `${path}.palette`,
          message: `Unknown palette: "${c.palette}"`,
          received: c.palette,
          expected: 'Valid palette name',
          suggestion: closest
            ? `Did you mean "${closest}"?`
            : `Popular options: Viridis, Mint, Sunset, Bold, Prism`
        });
      }
    }

    // Validate domain for continuous
    if (c.type === 'continuous' && c.domain !== undefined) {
      if (!Array.isArray(c.domain) || c.domain.length !== 2) {
        errors.push({
          path: `${path}.domain`,
          message: 'domain must be [min, max] array',
          received: c.domain,
          expected: '[number, number]'
        });
      } else {
        const [min, max] = c.domain;
        if (typeof min !== 'number' || typeof max !== 'number') {
          errors.push({
            path: `${path}.domain`,
            message: 'domain values must be numbers',
            received: c.domain,
            expected: '[number, number]'
          });
        } else if (min >= max) {
          errors.push({
            path: `${path}.domain`,
            message: 'domain[0] (min) must be less than domain[1] (max)',
            received: c.domain,
            suggestion: `Swap values: [${max}, ${min}] → [${min}, ${max}]`
          });
        }
      }
    }

    return;
  }

  // Unknown type
  errors.push({
    path,
    message: 'Invalid color value',
    received: typeof color,
    expected: 'string, RGB array, or color scale object',
    suggestion: 'Examples: "#ff0000", [255, 0, 0], { type: "continuous", attr: "value", palette: "Viridis" }'
  });
}

/**
 * Find closest valid layer type for typo correction
 */
function findClosestLayerType(input: string): string | null {
  const lower = input.toLowerCase();

  const aliases: Record<string, string> = {
    'hexagon': 'hex',
    'hexagons': 'hex',
    'h3': 'hex',
    'geojson': 'vector',
    'json': 'vector',
    'points': 'vector',
    'polygons': 'vector',
    'lines': 'vector',
    'tiles': 'mvt',
    'vectortiles': 'mvt',
    'vector-tiles': 'mvt',
    'image': 'raster',
    'xyz': 'raster',
    'pmtile': 'pmtiles'
  };

  return aliases[lower] || null;
}

/**
 * Check if a string is a named CSS color
 */
function isNamedColor(color: string): boolean {
  const namedColors = new Set([
    'black', 'white', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta',
    'gray', 'grey', 'orange', 'pink', 'purple', 'brown', 'navy', 'teal',
    'olive', 'maroon', 'aqua', 'fuchsia', 'lime', 'silver', 'transparent'
  ]);
  return namedColors.has(color.toLowerCase());
}

/**
 * Quick validation check - returns true/false only
 */
export function isValid(config: unknown): boolean {
  return validate(config).valid;
}

/**
 * Format validation errors as a human-readable string
 */
export function formatErrors(result: ValidationResult): string {
  if (result.valid) return 'Config is valid';

  const lines: string[] = ['Validation failed:'];

  result.errors.forEach(err => {
    lines.push(`  • ${err.path || 'config'}: ${err.message}`);
    if (err.suggestion) {
      lines.push(`    → ${err.suggestion}`);
    }
  });

  if (result.warnings.length > 0) {
    lines.push('Warnings:');
    result.warnings.forEach(w => lines.push(`  ⚠ ${w}`));
  }

  return lines.join('\n');
}
