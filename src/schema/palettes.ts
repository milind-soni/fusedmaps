/**
 * Palette discovery and metadata for AI agents.
 *
 * Provides information about available color palettes so AI agents
 * can make informed choices when generating map configurations.
 */

/**
 * Palette categories with recommended use cases
 */
export const PALETTE_CATEGORIES = {
  /** Sequential palettes - good for continuous numeric data (low → high) */
  sequential: [
    'Viridis', 'Mint', 'BluGrn', 'Sunset', 'Magenta', 'SunsetDark',
    'Teal', 'TealGrn', 'Purp', 'PurpOr', 'Emrld', 'OrYel',
    'Peach', 'Burg', 'RedOr', 'BurgYl', 'BluYl', 'PinkYl', 'DarkMint'
  ],

  /** Diverging palettes - good for data with a meaningful midpoint */
  diverging: [
    'TealRose', 'Temps', 'Tropic', 'Earth', 'Fall', 'Geyser', 'ArmyRose'
  ],

  /** Qualitative palettes - good for categorical/discrete data */
  qualitative: [
    'Bold', 'Prism', 'Safe', 'Vivid', 'Pastel', 'Antique'
  ]
} as const;

/**
 * All available palette names
 */
export const ALL_PALETTES = [
  ...PALETTE_CATEGORIES.sequential,
  ...PALETTE_CATEGORIES.diverging,
  ...PALETTE_CATEGORIES.qualitative
];

/**
 * Palette metadata with descriptions for AI context
 */
export const PALETTE_INFO: Record<string, { category: string; description: string; goodFor: string }> = {
  // Sequential
  Viridis: { category: 'sequential', description: 'Purple to yellow, perceptually uniform', goodFor: 'General purpose, works well for most numeric data' },
  Mint: { category: 'sequential', description: 'Light to dark mint green', goodFor: 'Environmental data, growth metrics' },
  BluGrn: { category: 'sequential', description: 'Blue to green gradient', goodFor: 'Water, environmental, cool-toned data' },
  Sunset: { category: 'sequential', description: 'Yellow to purple through orange/pink', goodFor: 'Warm data, intensity, heat' },
  Magenta: { category: 'sequential', description: 'Light pink to deep magenta', goodFor: 'Single-hue emphasis, density' },
  SunsetDark: { category: 'sequential', description: 'Dark version of Sunset', goodFor: 'Dark backgrounds, high contrast' },
  Teal: { category: 'sequential', description: 'Light to dark teal', goodFor: 'Water depth, calm data' },
  TealGrn: { category: 'sequential', description: 'Teal to green', goodFor: 'Nature, ecology data' },
  Purp: { category: 'sequential', description: 'Light to dark purple', goodFor: 'Density, single-hue data' },
  PurpOr: { category: 'sequential', description: 'Purple to orange', goodFor: 'Wide value range, attention-grabbing' },
  Emrld: { category: 'sequential', description: 'Light to emerald green', goodFor: 'Currency, growth, positive metrics' },
  OrYel: { category: 'sequential', description: 'Orange to yellow', goodFor: 'Warm metrics, energy' },
  Peach: { category: 'sequential', description: 'Light peach to deep coral', goodFor: 'Soft data visualization' },
  Burg: { category: 'sequential', description: 'Light to burgundy', goodFor: 'Wine, health, serious data' },
  RedOr: { category: 'sequential', description: 'Red to orange', goodFor: 'Heat, urgency, warnings' },

  // Diverging
  TealRose: { category: 'diverging', description: 'Teal ↔ neutral ↔ rose', goodFor: 'Positive/negative, above/below average' },
  Temps: { category: 'diverging', description: 'Cool ↔ warm temperature feel', goodFor: 'Temperature, sentiment' },
  Tropic: { category: 'diverging', description: 'Cyan ↔ neutral ↔ magenta', goodFor: 'Bipolar data, contrast' },
  Earth: { category: 'diverging', description: 'Green ↔ brown earth tones', goodFor: 'Land use, terrain' },
  Fall: { category: 'diverging', description: 'Autumn color diverging', goodFor: 'Seasonal, natural data' },
  Geyser: { category: 'diverging', description: 'Blue ↔ neutral ↔ orange', goodFor: 'Classic diverging, politics' },
  ArmyRose: { category: 'diverging', description: 'Army green ↔ rose', goodFor: 'Contrast, opposing categories' },

  // Qualitative
  Bold: { category: 'qualitative', description: 'High-contrast distinct colors', goodFor: 'Categories that need to stand out' },
  Prism: { category: 'qualitative', description: 'Rainbow-like distinct colors', goodFor: 'Many categories, playful data' },
  Safe: { category: 'qualitative', description: 'Colorblind-safe palette', goodFor: 'Accessibility-critical visualizations' },
  Vivid: { category: 'qualitative', description: 'Bright saturated colors', goodFor: 'Eye-catching categories' },
  Pastel: { category: 'qualitative', description: 'Soft muted colors', goodFor: 'Subtle category distinction' },
  Antique: { category: 'qualitative', description: 'Muted vintage colors', goodFor: 'Historical data, elegant style' }
};

/**
 * Get list of palettes by category
 */
export function getPalettesByCategory(category: 'sequential' | 'diverging' | 'qualitative'): string[] {
  return [...PALETTE_CATEGORIES[category]];
}

/**
 * Get all available palette names
 */
export function getAllPalettes(): string[] {
  return [...ALL_PALETTES];
}

/**
 * Get palette info including description and recommended use
 */
export function getPaletteInfo(name: string): { category: string; description: string; goodFor: string } | undefined {
  return PALETTE_INFO[name];
}

/**
 * Suggest a palette based on data type and use case
 */
export function suggestPalette(options: {
  dataType: 'continuous' | 'categorical' | 'diverging';
  useCase?: string;
  colorblindSafe?: boolean;
}): string {
  const { dataType, colorblindSafe } = options;

  if (colorblindSafe && dataType === 'categorical') {
    return 'Safe';
  }

  switch (dataType) {
    case 'continuous':
      return 'Viridis'; // Best general-purpose sequential
    case 'categorical':
      return 'Bold'; // High contrast categories
    case 'diverging':
      return 'Geyser'; // Classic blue-orange diverging
    default:
      return 'Viridis';
  }
}

/**
 * Get actual color values for a palette (requires cartocolor to be loaded)
 */
export function getPaletteColors(name: string, steps: number = 7): string[] | null {
  if (typeof window === 'undefined') return null;

  const cartocolor = (window as any).cartocolor;
  if (!cartocolor) return null;

  const pal = cartocolor[name];
  if (!pal) return null;

  // Find the best matching step count
  const keys = Object.keys(pal)
    .map(Number)
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);

  const best = keys.find(n => n >= steps) || keys[keys.length - 1];
  return pal[best] ? [...pal[best]] : null;
}

/**
 * Check if a palette name is valid
 */
export function isValidPalette(name: string): boolean {
  return ALL_PALETTES.includes(name as any);
}

/**
 * Find closest matching palette name (for typo correction)
 */
export function findClosestPalette(name: string): string | null {
  const lower = name.toLowerCase();

  // Exact match (case-insensitive)
  const exact = ALL_PALETTES.find(p => p.toLowerCase() === lower);
  if (exact) return exact;

  // Common aliases
  const aliases: Record<string, string> = {
    'blue-green': 'BluGrn',
    'bluegreen': 'BluGrn',
    'purple': 'Purp',
    'tealgreen': 'TealGrn',
    'teal-green': 'TealGrn',
    'orange-yellow': 'OrYel',
    'red-orange': 'RedOr',
    'purple-orange': 'PurpOr'
  };

  if (aliases[lower]) return aliases[lower];

  // Starts with match
  const startsWith = ALL_PALETTES.find(p => p.toLowerCase().startsWith(lower));
  if (startsWith) return startsWith;

  return null;
}
