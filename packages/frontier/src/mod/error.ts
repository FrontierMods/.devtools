/**
 * @file The error raised when mod discovery or resolution fails.
 */

/**
 * Error thrown when mod resolution fails.
 */
export class ModResolverError extends Error {
	readonly name = "ModResolverError";
}
