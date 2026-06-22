/**
 * @file Pure path bookkeeping for the execute phase: derive which paths applied patches touched, and reconcile the pending work queue against them.
 */

import {
	isDefined,
	isDescendantPath,
	isNumericOnly,
	normalizePath,
	type Patch,
	type PropertyPath,
} from "@frmds/frontier";
import {
	createExecutionTarget,
	getPathKey,
	type CachedExecutionTarget,
} from "../path-cache.ts";
import type { ExecutionTarget } from "../types/types.ts";

/**
 * Collects paths modified by a set of patches.
 * Simulates sequential array index changes to track which positions receive new content after insert/remove operations.
 *
 * @param patches Applied patches.
 *
 * @returns Set of stringified paths that were modified.
 */
export function collectModifiedPaths(patches: Patch[]): Set<string> {
	const modifiedPaths = new Set<string>();
	const arrayIndices = new Map<string, Set<number>>();

	for (const patch of patches) {
		const path = normalizePath(patch);
		const lastSegment = path[path.length - 1];

		const isArrayOp =
			lastSegment !== undefined && isNumericOnly(lastSegment);

		if (!isArrayOp) {
			if (patch.op !== "remove") modifiedPaths.add(JSON.stringify(path));

			continue;
		}

		// * simulate index changes
		const arrayPath = JSON.stringify(path.slice(0, -1));
		const index = parseInt(lastSegment);

		if (!arrayIndices.has(arrayPath))
			arrayIndices.set(arrayPath, new Set<number>());

		const indices = arrayIndices.get(arrayPath)!;

		if (patch.op === "insert") {
			// * insert: shift existing indices >= this index right, then add this index
			const shifted = new Set<number>();

			for (const idx of indices)
				shifted.add(idx >= index ? idx + 1 : idx);

			shifted.add(index);
			arrayIndices.set(arrayPath, shifted);
		} else if (patch.op === "remove") {
			// * remove: delete this index, shift indices > this index left
			const shifted = new Set<number>();

			for (const idx of indices) {
				if (idx === index) {
					// This index is removed, don't keep it
				} else if (idx > index) {
					shifted.add(idx - 1);
				} else {
					shifted.add(idx);
				}
			}

			arrayIndices.set(arrayPath, shifted);
		} else {
			// * other operations: mark this index as modified
			indices.add(index);
		}
	}

	for (const [arrayPathString, indices] of arrayIndices) {
		const arrayPath = JSON.parse(arrayPathString) as PropertyPath;

		for (const index of indices)
			modifiedPaths.add(JSON.stringify([...arrayPath, index.toString()]));
	}

	return modifiedPaths;
}

/**
 * Filters work queue to remove targets invalidated by patches.
 * Removes targets at deleted paths, modified paths, and descendants of both.
 * Also adjusts array indices after insert/remove operations.
 *
 * @param remaining Remaining targets in work queue.
 * @param patches Patches that were applied (with absolute paths).
 *
 * @returns Filtered and index-adjusted targets that remain valid.
 */
export function filterWorkQueue(
	remaining: ExecutionTarget[],
	patches: Patch[],
): ExecutionTarget[] {
	const removedPaths = new Set<string>();
	const modifiedPaths = new Set<string>();

	for (const patch of patches) {
		const path = normalizePath(patch);
		const key = JSON.stringify(path);

		if (patch.op === "remove") {
			removedPaths.add(key);
		} else if (patch.op === "insert") {
			const lastSegment = path[path.length - 1];

			const isArrayInsert =
				isDefined(lastSegment) && isNumericOnly(lastSegment);

			if (!isArrayInsert) modifiedPaths.add(key);
		} else {
			modifiedPaths.add(key);
		}
	}

	const filtered = remaining.filter((target) => {
		const targetKey = getPathKey(target as CachedExecutionTarget);

		if (removedPaths.has(targetKey)) return false;

		for (const removed of removedPaths) {
			if (isDescendantPath(target.path, JSON.parse(removed)))
				return false;
		}

		if (modifiedPaths.has(targetKey)) return false;

		for (const modified of modifiedPaths) {
			if (isDescendantPath(target.path, JSON.parse(modified)))
				return false;
		}

		return true;
	});

	const hasArrayOps = patches.some((patch) => {
		if (patch.op !== "insert" && patch.op !== "remove") return false;

		const path = normalizePath(patch);
		const lastSegment = path[path.length - 1];

		return lastSegment !== undefined && isNumericOnly(lastSegment);
	});

	if (!hasArrayOps) return filtered;

	return filtered.map((target) => {
		const adjustedPath = [...target.path];

		let adjusted = false;

		for (const patch of patches) {
			if (patch.op !== "insert" && patch.op !== "remove") continue;

			const patchPath = normalizePath(patch);
			const lastSegment = patchPath[patchPath.length - 1];

			if (!isDefined(lastSegment) || !isNumericOnly(lastSegment))
				continue;

			const affectedIndex = parseInt(lastSegment);
			const arrayPath = patchPath.slice(0, -1);

			if (adjustedPath.length <= arrayPath.length) continue;

			const isInSameArray = arrayPath.every(
				(segment, index) => adjustedPath[index] === segment,
			);

			if (!isInSameArray) continue;

			const targetIndex = adjustedPath[arrayPath.length];

			if (targetIndex === undefined || !isNumericOnly(targetIndex))
				continue;

			const numericIndex = parseInt(targetIndex);

			if (patch.op === "insert" && numericIndex >= affectedIndex) {
				adjustedPath[arrayPath.length] = (numericIndex + 1).toString();

				adjusted = true;
			} else if (patch.op === "remove" && numericIndex > affectedIndex) {
				adjustedPath[arrayPath.length] = (numericIndex - 1).toString();

				adjusted = true;
			}
		}

		if (!adjusted) return target;

		return createExecutionTarget(
			adjustedPath,
			target.transformer,
			target.depth,
		);
	});
}
