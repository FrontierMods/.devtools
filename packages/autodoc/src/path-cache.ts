/**
 * @file Symbol-based path caching for execution targets.
 *
 * A module-private `Symbol` caches each target's stringified path, staying invisible to `JSON.stringify`, `Object.keys`, and `for...in`.
 */

import type { PropertyPath } from "@frmds/frontier";
import type { ExecutionTarget, Transformer } from "./types/types.ts";

/**
 * {@link ExecutionTarget} with `Symbol`-based path cache.
 * The `Symbol` property is invisible to normal operations but provides fast access to the stringified path.
 */
export type CachedExecutionTarget = ExecutionTarget & {
	[PATH_KEY]?: string;
};

/**
 * Private Symbol for cached path strings.
 */
const PATH_KEY = Symbol("pathKey");

/**
 * Creates an {@link ExecutionTarget} with cached stringified path.
 * Use this instead of object literal construction for optimal performance.
 *
 * @param path Property path to the transformation target.
 * @param transformer Transformer to apply.
 * @param depth Nesting depth. Used for sorting.
 *
 * @returns {@link ExecutionTarget} with cached path string.
 *
 * @example
 * const target = createExecutionTarget(
 *   ["flags", "TOOL"],
 *   mathTransformer,
 *   2
 * );
 * const key = getPathKey(target);
 */
export function createExecutionTarget(
	path: PropertyPath,
	transformer: Transformer,
	depth: number,
): CachedExecutionTarget {
	const target: CachedExecutionTarget = { path, transformer, depth };

	target[PATH_KEY] = JSON.stringify(path);

	return target;
}

/**
 * Gets the stringified path for an {@link ExecutionTarget}.
 *
 * Offers double the performance of `JSON.stringify(target.path)`.
 *
 * @param target {@link ExecutionTarget} to get path string for.
 *
 * @returns Stringified path.
 */
export function getPathKey(target: CachedExecutionTarget): string {
	return target[PATH_KEY] ?? JSON.stringify(target.path);
}
