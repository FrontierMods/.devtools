/**
 * @file The validated commit-hash type and its parse/guard boundary.
 */

import { ConfigError } from "../config/error.ts";
import type { FixedLength } from "../types/fixed-length.ts";

/**
 * A validated 40-hex commit hash. Produced only by `parseSHA` and distinct from a raw string downstream.
 */
export type SHA = string & { readonly type: "SHA" };

/**
 * Type-level 40-char check for SHA literals.
 */
export type SHA40<Hash extends string> = FixedLength<Hash, 40>;

/**
 * A 40-char lowercase-hex commit hash.
 */
const SHA_PATTERN = /^[0-9a-f]{40}$/;

/**
 * Normalizes and validates a raw string into a `SHA`. Throws when it is not 40 hex chars.
 *
 * @param raw Raw string to normalize and validate.
 *
 * @returns The normalized lowercase 40-hex commit hash.
 *
 * @throws {@link ConfigError} When the trimmed, lowercased value is not 40 hex chars.
 */
export function parseSHA(raw: string): SHA {
	const value = raw.trim().toLowerCase();

	if (!SHA_PATTERN.test(value))
		throw new ConfigError(`Not a 40-character commit SHA: \`${raw}\``);

	return value as SHA;
}

/**
 * Reports whether `value` is a 40-hex commit hash, without throwing.
 *
 * @param value String to test.
 *
 * @returns Whether the trimmed, lowercased value is a 40-hex commit hash.
 */
export function isSHA(value: string): boolean {
	return SHA_PATTERN.test(value.trim().toLowerCase());
}
