/**
 * @file File discovery: glob-based discovery, recursive name search, and glob-based exclusion filtering.
 */

import fs from "fs-extra";
import path from "path";
import picomatch from "picomatch";
import { glob } from "tinyglobby";
import type { AbsolutePath, CanonicalPath, Path } from "../types/data.ts";
import { normalizePath } from "./paths.ts";

/**
 * Options for glob-based file discovery.
 */
export interface DiscoveryOptions {
	/** Include glob patterns, e.g., ["**\/*.json5"] */
	patterns: string[];
	/** Exclude glob patterns, e.g., ["obsolete/**"] */
	exclude?: string[];
	/** Follow symbolic links. Default: true */
	followSymlinks?: boolean;
}

/**
 * Options for glob-based exclusion filtering.
 */
export interface FilterByGlobsOptions {
	/**
	 * Match dotfiles.
	 *
	 * @default true
	 */
	dot?: boolean;
}

/**
 * Reads directory entries, returning empty array for unreadable directories.
 *
 * @param directory Directory to read entries from.
 *
 * @returns Directory entries, or an empty array when the directory is unreadable
 */
function readdirSyncSafe(directory: Path): fs.Dirent[] {
	try {
		return fs.readdirSync(directory, { withFileTypes: true });
	} catch {
		return [];
	}
}

/**
 * Recursively scans a directory, collecting paths that match a predicate.
 *
 * Skips unreadable directories but continues scanning siblings.
 *
 * @param directory Directory to scan recursively.
 * @param predicate Test applied to each entry to decide whether its path is collected.
 *
 * @returns Absolute paths of entries that satisfy the predicate
 */
function scanSync(
	directory: Path,
	predicate: (entry: fs.Dirent, fullPath: Path) => boolean,
): AbsolutePath[] {
	return readdirSyncSafe(directory).flatMap((entry) => {
		const fullPath = path.join(directory, entry.name);

		if (entry.isDirectory()) return scanSync(fullPath, predicate);

		if (entry.isSymbolicLink()) {
			try {
				const stat = fs.statSync(fullPath);

				if (stat.isDirectory()) return scanSync(fullPath, predicate);
			} catch {
				// broken symlink or inaccessible target, skip
			}
		}

		return predicate(entry, fullPath) ? [fullPath] : [];
	});
}

/**
 * Discovers files matching glob patterns within a root directory.
 *
 * Returns canonical paths (absolute, forward-slashed, symlinks resolved), sorted lexicographically: the glob walks directories concurrently and yields in I/O-completion order, which varies run to run, and everything downstream (workspace insertion order, dependency sort tie-breaking) must be deterministic.
 *
 * @param root Root directory to search within.
 * @param options Glob patterns and filtering options.
 *
 * @returns Array of canonical paths to discovered files
 *
 * @example
 * ```typescript
 * const sources = await discoverFiles(inputDir, {
 *     patterns: ["**\/*.json5"],
 *     exclude: ["obsolete/**"],
 * });
 * ```
 */
export async function discoverFiles(
	root: CanonicalPath,
	options: DiscoveryOptions,
): Promise<CanonicalPath[]> {
	const { patterns, exclude, followSymlinks = true } = options;

	const discovered = await glob(patterns, {
		cwd: root,
		absolute: true,
		dot: false,
		ignore: exclude,
		followSymbolicLinks: followSymlinks,
	});

	return discovered.map((file) => normalizePath(file)).sort();
}

/**
 * Recursively finds all files with a specific name.
 *
 * Silently skips unreadable directories (permission errors, etc.).
 *
 * @param directory Root directory to search.
 * @param filename Exact filename to match (e.g., "modinfo.json").
 *
 * @returns Array of absolute paths to matching files
 *
 * @example
 * ```typescript
 * const modinfos = findFilesRecursiveSync("<game>/mods", "modinfo.json");
 * // → ["<game>/mods/my_mod/modinfo.json", "<game>/mods/other/modinfo.json"]
 * ```
 */
export function findFilesRecursiveSync(
	directory: Path,
	filename: string,
): Path[] {
	return scanSync(
		directory,
		(entry) => entry.isFile() && entry.name === filename,
	);
}

/**
 * Filters file paths by glob patterns (exclusion).
 *
 * Returns files that do NOT match any of the provided patterns.
 * Patterns are matched against paths relative to the base directory.
 *
 * @param files Array of canonical file paths.
 * @param patterns Glob patterns to exclude.
 * @param baseDir Base directory for relative path matching.
 * @param options Filtering options.
 *
 * @returns Files that don't match any pattern
 *
 * @example
 * ```typescript
 * const filtered = filterByGlobs(
 *   files,
 *   ["obsolete/**", "*.old.json"],
 *   "/mods/mod_one"
 * );
 * // → files that don't match either pattern
 * ```
 */
export function filterByGlobs(
	files: CanonicalPath[],
	patterns: string[],
	baseDir: CanonicalPath,
	options: FilterByGlobsOptions = {},
): CanonicalPath[] {
	if (!patterns.length) return files;

	const { dot = true } = options;

	const matchers = patterns.map((pattern) => picomatch(pattern, { dot }));

	return files.filter((file) => {
		const relative = normalizePath(path.relative(baseDir, file));

		return !matchers.some((matcher) => matcher(relative));
	});
}
