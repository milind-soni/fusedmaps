/**
 * Debug panel palette dropdown helpers
 *
 * Encapsulates cartocolor palette listing + dropdown wiring (open/close, rebuild swatches).
 * Kept separate to reduce the size/coupling of `ui/debug.ts`.
 */

export function getPaletteNames(): string[] {
  try {
    return Object.keys((window as any).cartocolor || {}).sort((a, b) => a.localeCompare(b));
  } catch (_) {
    return [];
  }
}

export function setPaletteOptions(sel: HTMLSelectElement, palettes: string[]): void {
  try {
    sel.innerHTML = palettes.map((p) => `<option value="${p}">${p}</option>`).join('');
  } catch (_) {}
}

function getPaletteColors(paletteName: string, steps: number): string[] | null {
  try {
    const pal = (window as any).cartocolor?.[paletteName];
    if (!pal) return null;
    const keys = Object.keys(pal)
      .map((x: any) => Number(x))
      .filter((n: number) => Number.isFinite(n))
      .sort((a: number, b: number) => a - b);
    const best = keys.find((n: number) => n >= steps) ?? keys[keys.length - 1];
    const cols = pal[best];
    return Array.isArray(cols) ? [...cols] : null;
  } catch (_) {
    return null;
  }
}

function paletteGradient(paletteName: string, steps: number, reverse: boolean): string {
  const cols0 = getPaletteColors(paletteName, Math.max(steps, 3));
  const cols = (reverse && cols0?.length) ? [...cols0].reverse() : cols0;
  if (!cols?.length) return 'linear-gradient(90deg, #555, #999)';
  const g = cols.map((c: string, i: number) => `${c} ${(i / Math.max(1, cols.length - 1)) * 100}%`).join(', ');
  return `linear-gradient(90deg, ${g})`;
}

export interface PaletteDropdown {
  refresh: () => void;
  destroy: () => void;
}

interface DropdownOpts {
  palettes: string[];
  selectEl: HTMLSelectElement;
  menuEl: HTMLElement;
  swatchEl: HTMLElement;
  triggerEl: HTMLButtonElement;
  getSteps: () => number;
  getReverse: () => boolean;
  onPicked: () => void;
  closeAll: () => void;
}

function buildMenu(opts: DropdownOpts) {
  const reverse = !!opts.getReverse();
  const steps = Math.max(2, Math.min(20, opts.getSteps()));
  opts.menuEl.innerHTML = opts.palettes
    .map((p) => {
      const bg = paletteGradient(p, steps, reverse);
      return `<div class="pal-item" data-pal="${p}" title="${p}">
        <div class="pal-item-swatch" style="background:${bg};"></div>
      </div>`;
    })
    .join('');

  opts.menuEl.querySelectorAll('.pal-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch (_) {}
      const pal = (el as HTMLElement).getAttribute('data-pal') || '';
      if (pal) opts.selectEl.value = pal;
      opts.menuEl.style.display = 'none';
      // Update swatch to reflect the newly selected palette
      updateSwatch(opts);
      try {
        opts.onPicked();
      } catch (_) {}
    });
  });
}

function updateSwatch(opts: DropdownOpts) {
  try {
    const reverse = !!opts.getReverse();
    const steps = Math.max(2, Math.min(20, opts.getSteps()));
    const name = opts.selectEl.value || 'Palette';
    opts.swatchEl.style.background = paletteGradient(name, steps, reverse);
    opts.triggerEl.title = name;
  } catch (_) {}
}

export function createPaletteDropdownManager(palettes: string[]): {
  attach: (opts: Omit<DropdownOpts, 'palettes' | 'closeAll'>) => PaletteDropdown;
  refreshAll: () => void;
  destroy: () => void;
} {
  const menus: HTMLElement[] = [];
  const attached: PaletteDropdown[] = [];

  const closeAll = () => {
    try {
      menus.forEach((m) => {
        try {
          m.style.display = 'none';
        } catch (_) {}
      });
    } catch (_) {}
  };

  const onDocClick = () => closeAll();

  try {
    document.addEventListener('click', onDocClick);
    window.addEventListener('blur', onDocClick);
  } catch (_) {}

  const attach = (partial: Omit<DropdownOpts, 'palettes' | 'closeAll'>): PaletteDropdown => {
    const opts: DropdownOpts = { ...partial, palettes, closeAll };
    menus.push(opts.menuEl);

    // Initial build
    try {
      buildMenu(opts);
      updateSwatch(opts);
    } catch (_) {}

    const onTrigger = (e: Event) => {
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch (_) {}
      const isOpen = opts.menuEl.style.display !== 'none';
      opts.closeAll();
      // Rebuild each open so gradient reflects current steps/reverse.
      try {
        buildMenu(opts);
        updateSwatch(opts);
      } catch (_) {}
      opts.menuEl.style.display = isOpen ? 'none' : 'block';
    };

    try {
      opts.triggerEl.addEventListener('click', onTrigger);
    } catch (_) {}

    const dropdown: PaletteDropdown = {
      refresh: () => {
        try {
          buildMenu(opts);
          updateSwatch(opts);
        } catch (_) {}
      },
      destroy: () => {
        try {
          opts.triggerEl.removeEventListener('click', onTrigger);
        } catch (_) {}
        try {
          const idx = menus.indexOf(opts.menuEl);
          if (idx >= 0) menus.splice(idx, 1);
        } catch (_) {}
      }
    };
    attached.push(dropdown);
    return dropdown;
  };

  return {
    attach,
    refreshAll: () => {
      try {
        attached.forEach((d) => d.refresh());
      } catch (_) {}
    },
    destroy: () => {
      try {
        attached.forEach((d) => d.destroy());
      } catch (_) {}
      try {
        document.removeEventListener('click', onDocClick);
        window.removeEventListener('blur', onDocClick);
      } catch (_) {}
    }
  };
}


