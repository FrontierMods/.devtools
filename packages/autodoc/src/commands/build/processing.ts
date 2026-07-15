/**
 * @file Object evaluation: scan transformable objects and order them by their dependencies.
 */

import {
	type CompoundKey,
	type ModID,
	type ModScope,
	sortByDependencies,
} from "@frmds/frontier";
import { TYPE_TRANSFORM_SKIP } from "../../constants.ts";
import { modResolver } from "../../context.ts";
import { buildIdIndex, resolveCandidate } from "../../graph/resolve.ts";
import { scanAllObjects } from "../../phases/scan.ts";
import type {
	ExecutionMap,
	ProcessingItem,
	Transformer,
} from "../../types/types.ts";

/**
 * Result of {@link evaluateObjects evaluateObjects()}.
 */
export interface EvaluateObjectsResult {
	/** Processing items in dependency order. */
	sortedItems: ProcessingItem[];
	/** Execution maps. */
	executionMaps: Map<CompoundKey, ExecutionMap>;
	/** Transformers applied during evaluation. */
	transformers: Transformer[];
	/** Number of objects scanned and sorted. */
	evaluatedCount: number;
	/** Cross-object dependencies discovered by scan. */
	objectDependencies: Map<CompoundKey, Set<CompoundKey>>;
}

/**
 * Scans transformable objects and orders them by their cross-object dependencies.
 *
 * @param processingOrder The objects to evaluate, each with its mod and source path.
 * @param transformers The transformers applied during scanning.
 *
 * @returns The dependency-ordered items, execution maps, transformers, evaluated count, and discovered dependencies.
 */
export async function evaluateObjects(
	processingOrder: ProcessingItem[],
	transformers: Transformer[],
): Promise<EvaluateObjectsResult> {
	const scannableItems = processingOrder.filter(
		({ object }) => !TYPE_TRANSFORM_SKIP.includes(object.type),
	);

	const scanResults = await scanAllObjects(scannableItems, transformers);

	const availableKeys = new Set(scannableItems.map((item) => item.key));

	const idIndex = buildIdIndex(availableKeys);

	const scopeByModId = new Map<ModID, ModScope>();

	for (const { modId } of scannableItems)
		if (!scopeByModId.has(modId))
			scopeByModId.set(modId, modResolver.scopeFor(modId));

	const sorted = scanResults.objectDependencies.size
		? sortByDependencies(
				scannableItems,
				(item) => item.key,
				(item) => {
					const deps = scanResults.objectDependencies.get(item.key);

					if (!deps) return [];

					const scope = scopeByModId.get(item.modId)!;

					return [...deps].flatMap((dep) =>
						resolveCandidate(
							dep,
							scope,
							availableKeys,
							idIndex,
							item.key,
						),
					);
				},
				{ relaxed: true },
			)
		: scannableItems;

	return {
		sortedItems: sorted,
		executionMaps: scanResults.executionMaps,
		transformers,
		evaluatedCount: scannableItems.length,
		objectDependencies: scanResults.objectDependencies,
	};
}
