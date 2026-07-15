/**
 * @file Result types passed between the scan and execute phases.
 */

import type { CompoundKey } from "@frmds/frontier";
import type { ExecutionMap } from "../types/types.ts";

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
 * Holds the results from executing all transformations.
 */
export interface ExecuteResults {
	/** Count of objects processed through the execute pipeline. */
	processedCount: number;
}
