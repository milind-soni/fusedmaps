/**
 * Shared tile loader spinner for all tile-based layers (Deck.gl hex tiles, MVT, raster, PMTiles)
 */

let loaderEl: HTMLElement | null = null;
let textEl: HTMLElement | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;
let loadingCount = 0;

/**
 * Ensure the tile loader element exists in the DOM
 */
function ensureLoaderElement(): void {
  if (loaderEl) return;

  loaderEl = document.getElementById('tile-loader');
  if (!loaderEl) {
    loaderEl = document.createElement('div');
    loaderEl.id = 'tile-loader';
    loaderEl.innerHTML = `<div class="loader-spinner"></div><span id="loader-text">Loading tiles...</span>`;
    document.body.appendChild(loaderEl);
  }
  textEl = document.getElementById('loader-text');
}

/**
 * Update loading count and show/hide spinner
 */
export function setTileLoading(delta: number): void {
  ensureLoaderElement();
  loadingCount = Math.max(0, loadingCount + delta);

  if (!loaderEl) return;

  if (loadingCount > 0) {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    loaderEl.classList.add('active');
    if (textEl) {
      textEl.textContent = loadingCount === 1 ? 'Loading tile...' : `Loading ${loadingCount} tiles...`;
    }
  } else {
    // Delay hiding to avoid flicker
    hideTimeout = setTimeout(() => {
      loaderEl?.classList.remove('active');
    }, 300);
  }
}

/**
 * Track Mapbox vector/raster source loading
 * Returns cleanup function
 */
export function trackMapboxTileLoading(map: mapboxgl.Map, sourceIds: string[]): () => void {
  if (!sourceIds.length) return () => {};

  const sourceSet = new Set(sourceIds);
  const loadingSources = new Set<string>();

  const onSourceDataLoading = (e: any) => {
    const sourceId = e?.sourceId;
    if (!sourceId || !sourceSet.has(sourceId)) return;
    if (e?.tile && !loadingSources.has(`${sourceId}-${e.tile.tileID?.key}`)) {
      const key = `${sourceId}-${e.tile.tileID?.key || Math.random()}`;
      loadingSources.add(key);
      setTileLoading(1);
    }
  };

  const onSourceData = (e: any) => {
    const sourceId = e?.sourceId;
    if (!sourceId || !sourceSet.has(sourceId)) return;
    if (e?.tile) {
      const key = `${sourceId}-${e.tile.tileID?.key || ''}`;
      // Find and remove any matching key
      for (const k of loadingSources) {
        if (k.startsWith(`${sourceId}-`)) {
          loadingSources.delete(k);
          setTileLoading(-1);
          break;
        }
      }
    }
  };

  const onIdle = () => {
    // Clear all loading sources on idle
    const count = loadingSources.size;
    loadingSources.clear();
    if (count > 0) {
      setTileLoading(-count);
    }
  };

  map.on('sourcedataloading', onSourceDataLoading);
  map.on('sourcedata', onSourceData);
  map.on('idle', onIdle);

  return () => {
    map.off('sourcedataloading', onSourceDataLoading);
    map.off('sourcedata', onSourceData);
    map.off('idle', onIdle);
    // Clear any remaining
    const count = loadingSources.size;
    loadingSources.clear();
    if (count > 0) {
      setTileLoading(-count);
    }
  };
}
