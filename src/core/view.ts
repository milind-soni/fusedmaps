/**
 * View state management utilities
 */

/**
 * Get bounds array from map [west, south, east, north]
 */
export function getBoundsArray(map: mapboxgl.Map): [number, number, number, number] {
  const b = map.getBounds();
  return [
    +b.getWest().toFixed(6),
    +b.getSouth().toFixed(6),
    +b.getEast().toFixed(6),
    +b.getNorth().toFixed(6)
  ];
}

/**
 * Check if two bounds arrays are approximately equal
 */
export function boundsEqual(
  a: [number, number, number, number] | null,
  b: [number, number, number, number] | null
): boolean {
  if (!a || !b) return false;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}






