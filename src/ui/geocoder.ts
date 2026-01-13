/**
 * Location search widget using Mapbox Geocoding API
 */

import { getWidgetContainer } from './widget-container';

export interface GeocoderOptions {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center';
  placeholder?: string;
  mapboxToken: string;
}

export interface GeocoderHandle {
  destroy: () => void;
}

/**
 * Setup the geocoder/location search widget
 */
export function setupGeocoder(
  map: mapboxgl.Map,
  options: GeocoderOptions
): GeocoderHandle {
  const {
    position = 'top-right',
    placeholder = 'Search location...',
    mapboxToken
  } = options;

  // Get widget container for proper stacking (except top-center which stays fixed)
  const useWidgetContainer = position !== 'top-center';

  // Create container
  let container = document.getElementById('location-search');
  if (!container) {
    container = document.createElement('div');
    container.id = 'location-search';

    if (useWidgetContainer) {
      const widgetContainer = getWidgetContainer(position as any);
      widgetContainer.appendChild(container);
    } else {
      document.body.appendChild(container);
      // Apply position styles for top-center (fixed positioning)
      Object.assign(container.style, {
        position: 'fixed',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        right: 'auto',
        bottom: 'auto'
      });
    }
  }

  // Create input and results
  container.innerHTML = `
    <input type="text" id="search-input" placeholder="${placeholder}" autocomplete="off" />
    <div class="search-results" id="search-results"></div>
  `;

  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  const searchResults = document.getElementById('search-results') as HTMLElement;

  let debounceTimer: any = null;

  // Input handler with debounce
  function onInput(e: Event): void {
    const query = (e.target as HTMLInputElement).value.trim();
    if (debounceTimer) clearTimeout(debounceTimer);

    if (query.length < 2) {
      searchResults.classList.remove('visible');
      searchResults.innerHTML = '';
      return;
    }

    debounceTimer = setTimeout(() => {
      fetchLocations(query);
    }, 300);
  }

  // Escape key handler
  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      searchResults.classList.remove('visible');
      searchInput.blur();
    }
  }

  // Click outside handler
  function onDocumentClick(e: MouseEvent): void {
    if (!(e.target as HTMLElement)?.closest?.('#location-search')) {
      searchResults.classList.remove('visible');
    }
  }

  // Fetch locations from Mapbox Geocoding API
  async function fetchLocations(query: string): Promise<void> {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}&limit=5`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Geocoding failed');
      const data = await res.json();

      if (data.features && data.features.length > 0) {
        renderResults(data.features);
      } else {
        searchResults.innerHTML = '<div class="search-item" style="color:var(--ui-muted);">No results found</div>';
        searchResults.classList.add('visible');
      }
    } catch (err) {
      console.error('[Geocoder] Error:', err);
      searchResults.classList.remove('visible');
    }
  }

  // Render search results
  function renderResults(features: any[]): void {
    searchResults.innerHTML = features.map(f => {
      const placeName = f.text || f.place_name;
      const context = f.place_name.replace(f.text + ', ', '').replace(f.text, '');
      return `
        <div class="search-item" data-lng="${f.center[0]}" data-lat="${f.center[1]}" data-bbox="${f.bbox ? f.bbox.join(',') : ''}">
          <div class="place-name">${placeName}</div>
          ${context ? `<div class="place-context">${context}</div>` : ''}
        </div>
      `;
    }).join('');
    searchResults.classList.add('visible');

    // Add click handlers to results
    searchResults.querySelectorAll('.search-item').forEach(item => {
      item.addEventListener('click', () => {
        const el = item as HTMLElement;
        const lng = parseFloat(el.dataset.lng || '0');
        const lat = parseFloat(el.dataset.lat || '0');
        const bbox = el.dataset.bbox;

        if (bbox) {
          const [west, south, east, north] = bbox.split(',').map(Number);
          map.fitBounds([[west, south], [east, north]], { padding: 50, duration: 1500 });
        } else {
          map.flyTo({ center: [lng, lat], zoom: 12, duration: 1500 });
        }

        searchInput.value = el.querySelector('.place-name')?.textContent || '';
        searchResults.classList.remove('visible');
      });
    });
  }

  // Wire up events
  searchInput.addEventListener('input', onInput);
  searchInput.addEventListener('keydown', onKeydown);
  document.addEventListener('click', onDocumentClick);

  function destroy(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    searchInput.removeEventListener('input', onInput);
    searchInput.removeEventListener('keydown', onKeydown);
    document.removeEventListener('click', onDocumentClick);
    container?.remove();
  }

  return { destroy };
}
