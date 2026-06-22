/**
 * @file Mod type vocabulary: identifiers, scope, `modinfo.json` shape, and the indexed-entry record.
 */

import type { CATEGORIES } from "../constants.ts";
import type { CanonicalPath, JSONObject, Path } from "../types/data.ts";

/**
 * A mod's file: an array of game objects of one shape.
 */
export type ModFile<T extends JSONObject> = T[];

/**
 * A mod's unique identifier.
 */
export type ModID = string;

/**
 * A resolution scope: the current mod first, then its dependencies in load order.
 */
export type ModScope = [current: ModID, ...ModID[]];

/**
 * Categories of mods.
 */
export type Category = (typeof CATEGORIES)[number];

/**
 * Where a mod was discovered.
 */
export type ModSource = "cwd" | "user" | "default";

/**
 * Mod information parsed from `modinfo.json`.
 */
export interface ModInfo extends JSONObject {
	/**
	 * Type of object. For mod information, must be `MOD_INFO`.
	 */
	type: "MOD_INFO";
	/**
	 * Unique identifier of the mod.
	 */
	id: ModID;
	/**
	 * Name of the mod.
	 */
	name: string;
	/**
	 * Original creators of the mod.
	 */
	authors?: string[];
	/**
	 * Current maintainers of the mod.
	 */
	maintainers?: string[];
	/**
	 * Mod description. Displayed in the mod menu.
	 */
	description?: string;
	/**
	 * Which category the mod will be listed under in the mod menu.
	 */
	category?: Category;
	/**
	 * Version of the mod.
	 */
	version?: string;
	/**
	 * Qualifies mod as core. Core mods are treated differently from regular ones. Currently, the only in-repo core mod is `dda`.
	 */
	core?: boolean;
	/**
	 * Path to folder from which the game will load data.
	 */
	path?: Path;
	/**
	 * Marks the mod as obsolete. Obsolete mods load in existing worlds and saves for compatibility reasons but aren't displayed in the mod menu for new world, preventing them from being added by conventional means.
	 */
	obsolete?: boolean;
	/**
	 * Mods that this mod depends on.
	 */
	dependencies?: ModID[];
}

/**
 * File filtering configuration for a mod.
 * Used to exclude specific paths during dependency loading.
 */
export interface ModFileFilter {
	/**
	 * Glob patterns for paths to ignore when loading this mod's files.
	 * Only applied when loading as a dependency, not for the CWD mod.
	 *
	 * @example
	 * ```json5
	 * {
	 *   "ignorePaths": [
	 *     "**\/obsoletion_and_migration*\/**",
	 *     "**\/obsolete_*"
	 *   ]
	 * }
	 * ```
	 */
	ignorePaths?: string[];
}

/**
 * Indexed mod entry.
 */
export interface ModIndexEntry {
	/** Unique identifier of the mod. */
	readonly id: ModID;
	/** Display name of the mod. */
	readonly name: string;
	/** Canonical path to the mod's directory. */
	readonly path: CanonicalPath;
	/** Canonical path to the mod's `modinfo.json`. */
	readonly modinfoPath: CanonicalPath;
	/** Canonical path to the directory the game loads data from. */
	readonly contentRoot: CanonicalPath;
	/** IDs of mods this mod depends on. */
	readonly dependencies: ModID[];
	/** Where the mod was discovered. */
	readonly source: ModSource;
}

/**
 * Parsed `modinfo.json` result.
 */
export interface ParsedModInfo {
	/** Canonical path to the parsed `modinfo.json`. */
	path: CanonicalPath;
	/** Canonical path to the directory containing the `modinfo.json`. */
	directory: CanonicalPath;
	/** The parsed `MOD_INFO` object. */
	data: ModInfo;
}
