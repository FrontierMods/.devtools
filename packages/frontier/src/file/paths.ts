/**
 * @file Path canonicalization helpers: normalization, absolute and canonical resolution, cache dir, and deepest-prefix matching.
 */

import fs from "fs-extra";
import path from "path";
import { FRONTIER_CACHE_DIR } from "../constants.ts";
import type { AbsolutePath, CanonicalPath, Path } from "../types/data.ts";

/**
 * Converts backslashes to forward slashes for cross-platform stability.
 *
 * @param path Path whose separators are normalized.
 *
 * @returns Path with backslashes replaced by forward slashes
 */
export function normalizePath(path: Path): Path {
	return path.replaceAll(/\\/g, "/");
}

/**
 * Resolves to an absolute path without resolving symlinks, normalized.
 *
 * @param input Path to resolve.
 *
 * @returns Absolute, normalized path with symlinks left unresolved
 */
export function toAbsolutePath(input: string): AbsolutePath {
	return normalizePath(path.resolve(input));
}

/**
 * Resolves to canonical path: absolute, forward slashes, with symlinks resolved.
 * If the path does not exist, return absolute normalized without realpath.
 *
 * @param input Path to canonicalize.
 *
 * @returns Canonical path, or the absolute normalized path when the input does not exist
 */
export async function toCanonicalPathAsync(
	input: Path,
): Promise<CanonicalPath> {
	const absolutePath = toAbsolutePath(input);
	const absolutePathExists = await fs.pathExists(absolutePath);

	if (!absolutePathExists) return absolutePath;

	const realPath = await fs.realpath(absolutePath);

	return normalizePath(realPath);
}

/**
 * Synchronous variant of {@link toCanonicalPathAsync}.
 *
 * @param input Path to canonicalize.
 *
 * @returns Canonical path, or the absolute normalized path when the input does not exist
 */
export function toCanonicalPath(input: Path): CanonicalPath {
	const absolutePath = toAbsolutePath(input);

	if (!fs.pathExistsSync(absolutePath)) return absolutePath;

	const realPath = fs.realpathSync(absolutePath);

	return normalizePath(realPath);
}

/**
 * Gets the cache directory path for a mod.
 *
 * @param modPath Canonical path to mod root directory (where modinfo.json is).
 *
 * @returns Canonical path to mod's cache directory: `<modPath>/.frontier`
 */
export function getCachePath(modPath: Path): CanonicalPath {
	return normalizePath(path.join(modPath, FRONTIER_CACHE_DIR));
}

/**
 * Finds the deepest matching prefix from a set of candidates.
 *
 * Useful for determining ownership when paths can be nested (e.g., finding which mod's content root owns a file when mods can be nested within each other).
 *
 * @param filePath Canonical path to check (must use forward slashes).
 * @param prefixes Iterable of candidate prefixes to match against.
 *
 * @returns Deepest matching prefix, or undefined if none match
 *
 * @example
 * ```typescript
 * const roots = new Set([
 *   "/mods/core",
 *   "/mods/core/submods/addon",
 *   "/mods/other",
 * ]);
 *
 * findDeepestPrefix("/mods/core/submods/addon/items.json", roots);
 * // → "/mods/core/submods/addon" (deeper match wins)
 *
 * findDeepestPrefix("/mods/core/items.json", roots);
 * // → "/mods/core"
 *
 * findDeepestPrefix("/mods/unknown/items.json", roots);
 * // → undefined
 * ```
 */
export function findDeepestPrefix(
	filePath: CanonicalPath,
	prefixes: Iterable<CanonicalPath>,
): CanonicalPath | undefined {
	const matches = [...prefixes].filter(
		(prefix) => filePath === prefix || filePath.startsWith(prefix + "/"),
	);

	if (!matches.length) return undefined;

	return matches.sort((left, right) => right.length - left.length)[0];
}
