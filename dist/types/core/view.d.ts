/**
 * View state management utilities
 */
/**
 * Get bounds array from map [west, south, east, north]
 */
export declare function getBoundsArray(map: mapboxgl.Map): [number, number, number, number];
/**
 * Check if two bounds arrays are approximately equal
 */
export declare function boundsEqual(a: [number, number, number, number] | null, b: [number, number, number, number] | null): boolean;
