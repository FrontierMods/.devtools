/**
 * @file Config shapes: the raw `frontier.json5` contract and the resolved config.
 */

import type { CoreFlags, PathFlags } from "../flags.ts";
import type { CanonicalPath, Path } from "../types/data.ts";

/**
 * Core sections of `frontier.json5` that frontier interprets.
 * Plugin sections are passed through as-is.
 */
export interface ModConfig {
	/** Source and output path overrides for the mod. */
	path?: PathFlags;
	/** Game install reference, carrying the install path. */
	game?: {
		/** Path to the game install directory. */
		path: Path;
	};
	/** Plugin-specific sections, passed through untouched. */
	[plugin: string]: unknown;
}

/**
 * Resolved paths with all paths canonicalized.
 */
export interface ResolvedPaths {
	/** Canonical path to current working directory. */
	readonly cwd: CanonicalPath;
	/** Canonical path to source input directory. */
	readonly input: CanonicalPath;
	/** Canonical path to build output directory. */
	readonly output: CanonicalPath;
	/** Canonical path to game installation. */
	readonly game: CanonicalPath;
}

/**
 * Resolved configuration with all paths canonicalized.
 * Core properties are typed, and plugin sections remain as loaded.
 * Object is sealed to prevent accidental mutation.
 */
export interface ResolvedConfig extends Required<CoreFlags> {
	/** Canonicalized core paths for the resolved mod. */
	readonly paths: ResolvedPaths;

	/** Plugin-specific configuration sections (passed through from `frontier.json5`). */
	readonly [plugin: string]: unknown;
}
