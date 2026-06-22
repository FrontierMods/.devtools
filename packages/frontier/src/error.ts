/**
 * @file Error-handling utilities, kept free of defensive type coercion.
 */

/**
 * Extracts a message from an error value, falling back to a generic label for non-`Error` throwables.
 *
 * @param error The thrown value to read a message from.
 *
 * @returns The error message, or `"Unknown error"` when none is available.
 */
export function extractErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;

	return "Unknown error";
}
