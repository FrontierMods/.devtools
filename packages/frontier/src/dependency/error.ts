/**
 * @file The error raised when a dependency sort fails, carrying the involved IDs and failure kind.
 */

import type { ObjectID } from "../types/data.ts";

/**
 * Why a dependency sort failed: a cycle in the graph or a missing dependency.
 */
type DependencySortErrorType = "cycle" | "missing";

/**
 * Error thrown when dependency sorting fails.
 */
export class DependencySortError extends Error {
	readonly name = "DependencySortError";

	/** IDs of items involved in the error */
	readonly itemIDs: ObjectID[];

	/** Type of error */
	readonly errorType: DependencySortErrorType;

	/**
	 * Creates a new DependencySortError.
	 *
	 * @param message Human-readable description of the failure.
	 * @param itemIDs IDs of the items involved in the error.
	 * @param errorType Whether the failure was a cycle or a missing dependency.
	 */
	constructor(
		message: string,
		itemIDs: ObjectID[],
		errorType: DependencySortErrorType,
	) {
		super(message);

		this.itemIDs = itemIDs;
		this.errorType = errorType;
	}
}
