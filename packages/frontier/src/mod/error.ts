/**
 * @file The errors raised when mod discovery, resolution, or versioning fails.
 */

/**
 * Error thrown when mod resolution fails.
 */
export class ModResolverError extends Error {
	readonly name = "ModResolverError";
}

/**
 * Error thrown when reading, validating, or rewriting a mod's version fails.
 */
export class ModVersionError extends Error {
	readonly name = "ModVersionError";
}
