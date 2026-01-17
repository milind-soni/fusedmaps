/**
 * Widget container management for proper stacking of UI widgets
 */
import type { WidgetPosition } from '../types';
/**
 * Get or create a widget container for a given position.
 * Widgets appended to the same position container will be arranged horizontally.
 */
export declare function getWidgetContainer(position: WidgetPosition): HTMLElement;
