/**
 * Build Mapbox GL style expressions from color configurations
 */
import type { ColorConfig } from '../types';
interface CategoryPair {
    value: string | number;
    label: string;
}
/**
 * Extract unique categories from data for an attribute
 */
export declare function getUniqueCategories(data: Array<Record<string, unknown>> | undefined, attr: string, labelAttr?: string): CategoryPair[];
/**
 * Build a Mapbox GL color expression from a color config
 */
export declare function buildColorExpr(cfg: ColorConfig | undefined, data?: Array<Record<string, unknown>>): unknown | null;
export {};
