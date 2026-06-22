/**
 * @file Error type for global config operations.
 */

/**
 * Raised when a config value fails validation or an unknown key is used.
 */
export class ConfigError extends Error {
	readonly name = "ConfigError";
}
