/**
 * @file The object registry's error type, raised on configuration or invariant violations.
 */

/**
 * Error thrown when object registry operations fail due to configuration or invariant violations.
 */
export class ObjectRegistryError extends Error {
	readonly name = "ObjectRegistryError";
}
