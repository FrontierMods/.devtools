/**
 * @file Resolves relative patch paths (`[".."]`, `["..", "sibling"]`) against a base path, plus a descendant check.
 */

import type { PropertyPath } from "../types/data.ts";
import { normalizePath, type Patch } from "./patch.ts";

/**
 * Resolves a relative path to an absolute path from a base path.
 *
 * @param basePath Starting path (typically context.propertyPath).
 * @param relativePath Relative path with possible ".." segments.
 *
 * @returns Absolute path from root.
 *
 * @throws Error if navigation goes above root.
 */
export function resolveRelativePath(
	basePath: PropertyPath,
	relativePath: PropertyPath,
): PropertyPath {
	const result = [...basePath];

	for (const segment of relativePath) {
		if (segment === "..") {
			if (!result.length)
				throw new Error(
					`Cannot navigate above root\n` +
						`  Base path: ${JSON.stringify(basePath)}\n` +
						`  Relative path: ${JSON.stringify(relativePath)}`,
				);

			result.pop();
		} else {
			result.push(segment);
		}
	}

	return result;
}

/**
 * Checks whether a path is a descendant of another path.
 *
 * @param childPath Potential descendant path.
 * @param parentPath Potential ancestor path.
 *
 * @returns true if childPath starts with all segments of parentPath.
 *
 * @example
 * ```ts
 * isDescendantPath(["a", "b", "c"], ["a", "b"]) // true
 * isDescendantPath(["a", "b"], ["a", "b"]) // false (not descendant, same path)
 * isDescendantPath(["a", "x"], ["a", "b"]) // false
 * ```
 */
export function isDescendantPath(
	childPath: PropertyPath,
	parentPath: PropertyPath,
): boolean {
	if (childPath.length <= parentPath.length) return false;

	return parentPath.every((segment, index) => childPath[index] === segment);
}

/**
 * Resolves a patch's relative path, and for move/copy its `from` path, to absolute paths.
 *
 * @param patch Patch with potentially relative paths.
 * @param basePath Base path to resolve from (`[position, ...context.propertyPath]`).
 *
 * @returns New patch with absolute paths.
 *
 * @throws Error if a relative path navigates above root.
 */
export function resolvePatchPath(patch: Patch, basePath: PropertyPath): Patch {
	const relativePath = normalizePath(patch);
	const absolutePath = resolveRelativePath(basePath, relativePath);

	const { path: _, key: __, ...patchWithoutPath } = patch;

	if ("from" in patchWithoutPath && Array.isArray(patchWithoutPath.from))
		return {
			...patchWithoutPath,
			path: absolutePath,
			from: resolveRelativePath(basePath, patchWithoutPath.from),
		};

	return { ...patchWithoutPath, path: absolutePath };
}
