/**
 * @file Result types passed between the scan, sort, and execute phases.
 */

import type { CompoundKey } from "@frmds/frontier";
import type { ExecutionMap, GameObject } from "../types/types.ts";

/**
 * Aggregates results from scanning all objects.
 */
export interface ScanResults {
	/** Execution maps for all objects. */
	executionMaps: Map<CompoundKey, ExecutionMap>;
	/** Object dependencies for topological sorting. */
	objectDependencies: Map<CompoundKey, Set<CompoundKey>>;
}

/**
 * Holds the results from sorting objects and execution targets.
 */
export interface SortResults {
	/** Objects sorted by dependencies. */
	sortedObjects: GameObject[];
	/** Execution maps with sorted targets. */
	executionMaps: Map<CompoundKey, ExecutionMap>;
}

/**
 * Holds the results from executing all transformations.
 */
export interface ExecuteResults {
	/** Count of objects processed through the execute pipeline. */
	processedCount: number;
}
