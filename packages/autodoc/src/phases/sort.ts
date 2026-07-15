/**
 * @file Execution-target ordering: deduplicates and sorts targets within each object. The scan phase applies these to every execution map it emits.
 */

import { getPathKey } from "../path-cache.ts";
import type { ExecutionTarget } from "../types/types.ts";

/**
 * Removes duplicate execution targets.
 * A target is considered a duplicate if it has the same path and transformer.
 *
 * @param targets Execution targets to deduplicate.
 *
 * @returns Deduplicated targets.
 */
export function deduplicateTargets(
	targets: ExecutionTarget[],
): ExecutionTarget[] {
	const seen = new Set<string>();
	const deduplicated: ExecutionTarget[] = [];

	for (const target of targets) {
		const key = `${getPathKey(target)}:${target.transformer.name}`;

		if (!seen.has(key)) {
			seen.add(key);
			deduplicated.push(target);
		}
	}

	return deduplicated;
}

/**
 * Sorts execution targets within a single object.
 *
 * Ordering rules (in priority order):
 * 1. Depth (optimization, innermost first) - e.g., resolve { ref: { math: 5 } } as: math then ref
 * 2. Stable/deterministic order (by path)
 *
 * @param targets Execution targets to sort.
 *
 * @returns Sorted execution targets.
 */
export function sortExecutionTargets(
	targets: ExecutionTarget[],
): ExecutionTarget[] {
	return targets.toSorted(createTargetComparator());
}

/**
 * Creates a comparator for sorting execution targets: deeper nodes first, then path order for determinism.
 *
 * @returns Comparator function for `ExecutionTarget` sorting.
 */
export function createTargetComparator(): (
	left: ExecutionTarget,
	right: ExecutionTarget,
) => number {
	return (left: ExecutionTarget, right: ExecutionTarget): number => {
		// * deeper nodes come first
		if (left.depth !== right.depth) return right.depth - left.depth;

		const pathA = getPathKey(left);
		const pathB = getPathKey(right);

		// * sort by path for deterministic ordering
		return pathA.localeCompare(pathB);
	};
}
