/**
 * Palette discovery and metadata for AI agents.
 *
 * Provides information about available color palettes so AI agents
 * can make informed choices when generating map configurations.
 */
/**
 * Palette categories with recommended use cases
 */
export declare const PALETTE_CATEGORIES: {
    /** Sequential palettes - good for continuous numeric data (low → high) */
    readonly sequential: readonly ["Viridis", "Mint", "BluGrn", "Sunset", "Magenta", "SunsetDark", "Teal", "TealGrn", "Purp", "PurpOr", "Emrld", "OrYel", "Peach", "Burg", "RedOr", "BurgYl", "BluYl", "PinkYl", "DarkMint"];
    /** Diverging palettes - good for data with a meaningful midpoint */
    readonly diverging: readonly ["TealRose", "Temps", "Tropic", "Earth", "Fall", "Geyser", "ArmyRose"];
    /** Qualitative palettes - good for categorical/discrete data */
    readonly qualitative: readonly ["Bold", "Prism", "Safe", "Vivid", "Pastel", "Antique"];
};
/**
 * All available palette names
 */
export declare const ALL_PALETTES: ("ArmyRose" | "Antique" | "BluGrn" | "BluYl" | "Bold" | "Burg" | "BurgYl" | "DarkMint" | "Earth" | "Emrld" | "Fall" | "Geyser" | "Magenta" | "Mint" | "OrYel" | "Pastel" | "Peach" | "PinkYl" | "Prism" | "Purp" | "PurpOr" | "RedOr" | "Safe" | "Sunset" | "SunsetDark" | "Teal" | "TealGrn" | "TealRose" | "Temps" | "Tropic" | "Vivid" | "Viridis")[];
/**
 * Palette metadata with descriptions for AI context
 */
export declare const PALETTE_INFO: Record<string, {
    category: string;
    description: string;
    goodFor: string;
}>;
/**
 * Get list of palettes by category
 */
export declare function getPalettesByCategory(category: 'sequential' | 'diverging' | 'qualitative'): string[];
/**
 * Get all available palette names
 */
export declare function getAllPalettes(): string[];
/**
 * Get palette info including description and recommended use
 */
export declare function getPaletteInfo(name: string): {
    category: string;
    description: string;
    goodFor: string;
} | undefined;
/**
 * Suggest a palette based on data type and use case
 */
export declare function suggestPalette(options: {
    dataType: 'continuous' | 'categorical' | 'diverging';
    useCase?: string;
    colorblindSafe?: boolean;
}): string;
/**
 * Get actual color values for a palette (requires cartocolor to be loaded)
 */
export declare function getPaletteColors(name: string, steps?: number): string[] | null;
/**
 * Check if a palette name is valid
 */
export declare function isValidPalette(name: string): boolean;
/**
 * Find closest matching palette name (for typo correction)
 */
export declare function findClosestPalette(name: string): string | null;
