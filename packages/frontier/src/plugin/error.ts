/**
 * @file Plugin registry error type plus helpers that map raw filesystem and parse failures to stable codes and user-facing messages.
 */

import { isObject } from "../types/guards.ts";

/**
 * Construction options for {@link RegistryReadError}, carrying the failure code, file path, and underlying cause.
 */
interface RegistryReadErrorOptions {
	/** Stable error code, e.g. `ENOENT` or `INVALID_SCHEMA`. */
	code: string;
	/** Path of the registry file the failure relates to. */
	path: string;
	/** The original thrown value that triggered this one. */
	cause: unknown;
}

/**
 * Raised when the plugin registry cannot be read or parsed, exposing the code and path for handling.
 */
export class RegistryReadError extends Error {
	readonly name = "RegistryReadError";

	public readonly code: string;
	public readonly path: string;

	/**
	 * Constructs the error, copying the code and path off the options for handling.
	 *
	 * @param message Human-readable description of the failure.
	 * @param options Failure code, file path, and underlying cause.
	 */
	constructor(message: string, options: RegistryReadErrorOptions) {
		super(message, options);

		this.code = options.code;
		this.path = options.path;
	}
}

/**
 * Derives a stable error code from an unknown thrown value. Maps `SyntaxError` to `PARSE_ERROR`, reads a string `code` off object-shaped errors, and falls back to `UNKNOWN`.
 *
 * @param error The thrown value to classify.
 *
 * @returns A stable error code string.
 */
export function getErrorCode(error: unknown): string {
	if (error instanceof SyntaxError) return "PARSE_ERROR";

	if (isObject(error) && typeof error.code === "string") return error.code;

	return "UNKNOWN";
}

/**
 * Builds a user-facing message for a registry read failure, tailored to the error `code` and the registry `filePath`.
 *
 * @param code Stable error code that selects the message variant.
 * @param filePath Path of the registry file referenced in the message.
 *
 * @returns A user-facing failure message.
 */
export function getErrorMessage(code: string, filePath: string): string {
	switch (code) {
		case "ENOENT":
			return `Plugin registry not found: ${filePath}`;
		case "EACCES":
		case "EPERM":
			return `Permission denied reading plugin registry: ${filePath}`;
		case "PARSE_ERROR":
			return `Plugin registry is corrupted (invalid JSON): ${filePath}. Run 'frontier plugin reset' to clear the registry. You will have to re-add each plugin afterwards.`;
		default:
			return `Failed to read plugin registry: ${filePath}`;
	}
}
