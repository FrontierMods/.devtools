/**
 * @file Registry of known global config namespaces, each with its own leaf validator.
 */

import { toCanonicalPath } from "../file/paths.ts";
import type { JSONValue } from "../types/data.ts";

/**
 * A known config namespace: its dotted prefix, description, and leaf validator.
 */
export interface ConfigParam {
	/** Dotted namespace prefix used on the CLI and as the stored key prefix. */
	namespace: string;
	/** One-line description, surfaced by `frontier config --help`. */
	brief: string;
	/**
	 * Validates and normalizes a raw leaf value.
	 *
	 * @param raw Raw leaf value to validate.
	 *
	 * @returns The normalized leaf value.
	 *
	 * @throws ConfigError when the value is invalid.
	 */
	parse(raw: string): JSONValue;
}

/**
 * The game-installs namespace: each leaf is a canonical install path keyed by commit hash.
 *
 * `parse` only normalizes the path. Existence and `VERSION.txt` are validated by `hashFromInstall` when an install is added, so a since-deleted install never fails post-read validation.
 */
const GAME_PATH: ConfigParam = {
	namespace: "game.path",
	brief: "Cataclysm: Dark Days Ahead install directories, keyed by commit hash",
	parse: (raw) => toCanonicalPath(raw),
};

/**
 * Every known namespace, keyed by its dotted prefix.
 */
export const PARAMS: Record<string, ConfigParam> = {
	[GAME_PATH.namespace]: GAME_PATH,
};

/**
 * Resolves a dotted key to the param whose namespace is its longest segment-prefix.
 *
 * @param key Dotted config key to resolve.
 *
 * @returns The matching `ConfigParam`, or `undefined` when no namespace prefixes the key.
 */
export function paramForKey(key: string): ConfigParam | undefined {
	const segments = key.split(".");

	for (let length = segments.length; length > 0; length--) {
		const namespace = segments.slice(0, length).join(".");
		const param = PARAMS[namespace];

		if (param) return param;
	}

	return undefined;
}
