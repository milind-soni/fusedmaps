/**
 * Widget container management for proper stacking of UI widgets
 */

import type { WidgetPosition } from '../types';

const containerIds: Record<WidgetPosition, string> = {
  'top-left': 'fm-widgets-top-left',
  'top-right': 'fm-widgets-top-right',
  'bottom-left': 'fm-widgets-bottom-left',
  'bottom-right': 'fm-widgets-bottom-right',
  'top-center': 'fm-widgets-top-center',
};

/**
 * Get or create a widget container for a given position.
 * Widgets appended to the same position container will be arranged horizontally.
 */
export function getWidgetContainer(position: WidgetPosition): HTMLElement {
  const id = containerIds[position];
  let container = document.getElementById(id);

  if (!container) {
    container = document.createElement('div');
    container.id = id;
    container.className = `fm-widget-container fm-widget-${position}`;
    document.body.appendChild(container);
  }

  return container;
}
