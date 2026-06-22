/**
 * @file Resolve a mod's effective config by layering defaults, `frontier.json5`, and CLI flags.
 */

import { JSON5 } from "bun";
import fs from "fs-extra";
import path from "path";

import { MOD_CONFIG_FILENAME, PATH_DEFAULTS } from "../constants.ts";
import { extractErrorMessage } from "../error.ts";
import { normalizePath, toCanonicalPath } from "../file/paths.ts";
import type { CoreFlags, PathFlags } from "../flags.ts";
import type { CanonicalPath } from "../types/data.ts";
import { isArray, isObject } from "../types/guards.ts";
import { resolveGamePath } from "../game/installs.ts";
import { isValidModConfig } from "./guards.ts";
import type { ModConfig, ResolvedConfig } from "./types.ts";

/**
 * Options for resolving configuration.
 */
export interface ResolveConfigOptions<F extends CoreFlags & PathFlags> {
	/** Root mod directory. */
	cwd: string;
	/** Parsed CLI flags. */
	flags: F;
}

/**
 * Loads and parses Frontier mod config from the given directory.
 *
 * @param cwd Path to directory containing mod config.
 *
 * @returns Parsed config object (may be empty if file doesn't exist).
 *
 * @throws Error if the file is missing, is not an array, fails validation, or cannot be parsed.
 */
function loadModConfig(cwd: CanonicalPath): ModConfig {
	const configPath = path.join(cwd, MOD_CONFIG_FILENAME);

	if (!fs.pathExistsSync(configPath))
		throw new Error("Mod config file doesn't exist");

	try {
		const content = fs.readFileSync(configPath, "utf8");
		const parsed = JSON5.parse(content);

		// * mod config is an array of objects, like game files
		if (!isArray(parsed))
			throw new Error("Expected array of objects, got different type");

		const merged = parsed
			.filter((item) => isObject(item))
			.reduce<Partial<ModConfig>>(
				(accumulator, object) => ({ ...accumulator, ...object }),
				{},
			);

		if (!isValidModConfig(merged))
			throw new Error("`game` block must contain a string `path`");

		return merged;
	} catch (error) {
		throw new Error(
			`Failed to parse \`${MOD_CONFIG_FILENAME}\`: ${extractErrorMessage(error)}`,
		);
	}
}

/**
 * Resolves a path candidate (relative or absolute) to a canonical path.
 *
 * @param cwd Base directory for relative path resolution.
 * @param candidate Path to resolve.
 *
 * @returns Canonical absolute path.
 */
function resolvePath(cwd: CanonicalPath, candidate: string): CanonicalPath {
	const normalized = normalizePath(candidate);

	return path.isAbsolute(normalized)
		? toCanonicalPath(normalized)
		: toCanonicalPath(path.join(cwd, normalized));
}

/**
 * Resolves configuration from CWD and CLI flags.
 *
 * Resolution order (later overrides earlier):
 * 1. Built-in defaults
 * 2. Mod config values
 * 3. CLI flags
 *
 * @param options Resolution inputs carrying the mod directory and parsed CLI flags.
 *
 * @returns Sealed ResolvedConfig object.
 *
 * @throws Error if the mod config is missing or malformed.
 *
 * @example
 * ```typescript
 * const config = resolveConfig({
 *   cwd: process.cwd(),
 *   flags: { cache: true, verbose: true },
 * });
 *
 * console.log(config.paths.inputDir);
 * console.log(config.verbose);
 * ```
 */
export function resolveConfig<F extends CoreFlags & PathFlags>(
	options: ResolveConfigOptions<F>,
): ResolvedConfig {
	const cwd = toCanonicalPath(options.cwd);
	const { flags } = options;

	const modConfig = loadModConfig(cwd);

	const game = resolveGamePath({
		game: flags.game ?? modConfig.game?.path,
		cwd,
	});

	const input = resolvePath(
		cwd,
		flags.input ?? modConfig.path?.input ?? PATH_DEFAULTS.input,
	);
	const output = resolvePath(
		cwd,
		flags.output ?? modConfig.path?.output ?? PATH_DEFAULTS.output,
	);

	// Separate core sections from plugin sections
	const { path: _path, game: _game, ...pluginSections } = modConfig;

	return Object.seal({
		verbose: flags.verbose ?? false,
		silent: flags.silent ?? false,
		strict: flags.strict ?? false,
		clean: flags.clean ?? false,
		log: flags.log ?? false,
		cache: flags.cache,

		paths: {
			cwd,
			input,
			output,
			game,
		},

		...pluginSections,
	});
}

/**
 * Provides a type-safe accessor for plugin configuration sections.
 *
 * Plugins should define their own accessor function that encapsulates the type boundary. This keeps the type assertion in one place.
 *
 * @param config Resolved config to read the plugin section from.
 * @param namespace Plugin section key to look up.
 *
 * @returns The plugin section narrowed to `Partial<T>`, or an empty object when absent.
 */
export function getPluginConfig<T extends Record<string, unknown>>(
	config: ResolvedConfig,
	namespace: string,
): Partial<T> {
	const section = config[namespace];

	if (isObject(section)) return section as Partial<T>;

	return {};
}
