/**
 * @file Small value-shape transforms shared across tools.
 */

/**
 * Ensures the input value is output as an array.
 *
 * @param value Single value or array to normalize.
 *
 * @returns The value as an array, wrapping a single value when needed.
 */
export function ensureFlatArray<T>(value: T | T[]): T[] {
	return Array.isArray(value) ? value : [value];
}
