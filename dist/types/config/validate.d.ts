/**
 * Deep validation with actionable error messages for AI agents.
 *
 * When AI agents generate invalid configs, these errors help them
 * understand exactly what went wrong and how to fix it.
 */
/**
 * Validation error with path and suggestion
 */
export interface ValidationError {
    /** JSON path to the error (e.g., "layers[0].style.fillColor.palette") */
    path: string;
    /** Human-readable error message */
    message: string;
    /** Suggestion for how to fix the error */
    suggestion?: string;
    /** The value that was received */
    received?: unknown;
    /** Description of what was expected */
    expected?: string;
}
/**
 * Validation result
 */
export interface ValidationResult {
    /** Whether the config is valid */
    valid: boolean;
    /** List of validation errors */
    errors: ValidationError[];
    /** Non-fatal warnings */
    warnings: string[];
}
/**
 * Validate a FusedMaps configuration.
 * Returns detailed errors with paths and suggestions.
 */
export declare function validate(config: unknown): ValidationResult;
/**
 * Quick validation check - returns true/false only
 */
export declare function isValid(config: unknown): boolean;
/**
 * Format validation errors as a human-readable string
 */
export declare function formatErrors(result: ValidationResult): string;
