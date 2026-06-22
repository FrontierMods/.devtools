/**
 * @file Object evaluation: build contexts, scan transformable objects, and sort execution targets.
 */

import {
	type CompoundKey,
	makeKeyFromObject,
	type ModID,
	type ModScope,
	sortByDependencies,
} from "@frmds/frontier";
import { TYPE_TRANSFORM_SKIP } from "../../constants.ts";
import { modResolver } from "../../context.ts";
import { buildIdIndex, resolveCandidate } from "../../graph/resolve.ts";
import { scanAllObjects } from "../../phases/scan.ts";
import { sortPhase } from "../../phases/sort.ts";
import type { SortResults } from "../../phases/types.ts";
import type {
	ObjectContext,
	ProcessingItem,
	Transformer,
} from "../../types/types.ts";

/**
 * Result of {@link evaluateObjects evaluateObjects()}.
 */
export interface EvaluateObjectsResult {
	/** Sorted execution targets per object. */
	sortResults: SortResults;
	/** Source path and mod for each processed object. */
	objectContexts: Map<CompoundKey, ObjectContext>;
	/** Transformers applied during evaluation. */
	transformers: Transformer[];
	/** Number of objects scanned and sorted. */
	evaluatedCount: number;
	/** Cross-object dependencies discovered by scan. */
	objectDependencies: Map<CompoundKey, Set<CompoundKey>>;
}

/**
 * Builds object contexts, scans transformable objects, and sorts execution targets within each object.
 *
 * @param processingOrder The objects to evaluate, each with its mod and source path.
 * @param transformers The transformers applied during scanning.
 *
 * @returns The sorted execution targets, object contexts, transformers, evaluated count, and discovered dependencies.
 */
export async function evaluateObjects(
	processingOrder: ProcessingItem[],
	transformers: Transformer[],
): Promise<EvaluateObjectsResult> {
	const scannableItems = processingOrder.filter(
		({ object }) => !TYPE_TRANSFORM_SKIP.includes(object.type),
	);

	const objectContexts = new Map<CompoundKey, ObjectContext>();

	for (const item of processingOrder) {
		const { object, modId, sourcePath } = item;
		const key = makeKeyFromObject(object, modId);

		objectContexts.set(key, { sourcePath, modId });
	}

	const scanResults = await scanAllObjects(scannableItems, transformers);

	const availableKeys = new Set(
		scannableItems.map((item) =>
			makeKeyFromObject(item.object, item.modId),
		),
	);

	const idIndex = buildIdIndex(availableKeys);

	const scopeByModId = new Map<ModID, ModScope>();

	for (const { modId } of scannableItems)
		if (!scopeByModId.has(modId))
			scopeByModId.set(modId, modResolver.scopeFor(modId));

	const sorted = scanResults.objectDependencies.size
		? sortByDependencies(
				scannableItems,
				(item) => makeKeyFromObject(item.object, item.modId),
				(item) => {
					const key = makeKeyFromObject(item.object, item.modId);
					const deps = scanResults.objectDependencies.get(key);

					if (!deps) return [];

					const scope = scopeByModId.get(item.modId)!;

					return [...deps].flatMap((dep) =>
						resolveCandidate(
							dep,
							scope,
							availableKeys,
							idIndex,
							key,
						),
					);
				},
				{ relaxed: true },
			)
		: scannableItems;

	const objects = sorted.map((item) => item.object);
	const sortResults = sortPhase(objects, scanResults);

	return {
		sortResults,
		objectContexts,
		transformers,
		evaluatedCount: scannableItems.length,
		objectDependencies: scanResults.objectDependencies,
	};
}
