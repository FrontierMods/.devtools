/**
 * @file Scan phase: walks objects to discover transformer targets and cross-object dependencies.
 */

import type {
	CanonicalPath,
	CompoundKey,
	GameObject,
	JSONValue,
	ModID,
	PropertyPath,
} from "@frmds/frontier";
import {
	deepWalk,
	extractErrorMessage,
	getPluginConfig,
	makeKey,
	makeKeyFromObject,
	resolveObjectID,
} from "@frmds/frontier";
import pLimit from "p-limit";
import { config } from "../context.ts";
import { createExecutionTarget } from "../path-cache.ts";
import type {
	AutodocConfig,
	ExecutionMap,
	ExecutionTarget,
	ObjectScanResult,
	ProcessingItem,
	Transformer,
} from "../types/types.ts";
import {
	collectPositionalMatches,
	pathsComparable,
	matchesContent,
	partitionTransformers,
} from "./targeting.ts";
import type { ScanResults } from "./types.ts";

/**
 * Records a matched transformer by pushing its execution target and merging any dependencies it extracts.
 * Shared by the traversal and positional branches so both produce targets identically.
 *
 * @param transformer The matched transformer.
 * @param value The value at the matched path.
 * @param context Base context (object, mod, source, and property path).
 * @param depth Nesting depth of the match, for sort ordering.
 * @param targets Accumulator the new execution target is pushed into.
 * @param dependencies Accumulator extracted dependency keys are merged into.
 * @param objectId ID of the scanned object, for error messages.
 *
 * @throws When a transformer's `extractDependencies` call fails.
 */
function recordMatch(
	transformer: Transformer,
	value: JSONValue,
	context: {
		currentObject: GameObject;
		modId: ModID;
		sourcePath: CanonicalPath;
		propertyPath: PropertyPath;
	},
	depth: number,
	targets: ExecutionTarget[],
	dependencies: Set<CompoundKey>,
	objectId: string,
): void {
	targets.push(
		createExecutionTarget(context.propertyPath, transformer, depth),
	);

	// eslint-disable-next-line typescript/unbound-method -- transformer hook is a closure, never bound to `this`
	const extract = transformer.extractDependencies;

	if (!extract) return;

	try {
		for (const dependency of extract(value, context))
			dependencies.add(dependency);
	} catch (error) {
		throw new Error(
			`scanObject(): Failed to extract dependencies\n` +
				`  Transformer: ${transformer.name}\n` +
				`  Object: ${objectId}\n` +
				`  Path: ${context.propertyPath.join(".")}\n` +
				`  Error: ${extractErrorMessage(error)}`,
		);
	}
}

/**
 * Scans a single object to find all transformer targets and dependencies.
 *
 * @param object Object to scan.
 * @param transformers All registered transformers.
 * @param context Source context for error messages.
 *
 * @returns Scan results for this object.
 *
 * @throws When the object has no ID, or when a transformer's dependency extraction fails.
 */
export function scanObject(
	object: GameObject,
	transformers: Transformer[],
	context: { sourcePath: CanonicalPath; modId: ModID },
): ObjectScanResult {
	const objectId = resolveObjectID(object).id;

	const targets: ExecutionTarget[] = [];
	const dependencies = new Set<CompoundKey>();

	// * emit even when `copy-from` matches the object's own ID
	// * a same-ID `copy-from` depends on the base definition in a dependency mod, which `resolveCandidate` finds by excluding the object's own key
	if (typeof object["copy-from"] === "string" && object["copy-from"].trim()) {
		dependencies.add(
			makeKey(object["copy-from"], object.type, context.modId),
		);
	}

	const { traversal, positional } = partitionTransformers(transformers);

	deepWalk(object, (path: PropertyPath, value: JSONValue, depth: number) => {
		const matchContext = {
			currentObject: object,
			modId: context.modId,
			sourcePath: context.sourcePath,
			propertyPath: path,
		};

		for (const transformer of traversal)
			if (matchesContent(transformer.target.content, value))
				recordMatch(
					transformer,
					value,
					matchContext,
					depth,
					targets,
					dependencies,
					objectId,
				);
	});

	for (const match of collectPositionalMatches(object, positional)) {
		const matchContext = {
			currentObject: object,
			modId: context.modId,
			sourcePath: context.sourcePath,
			propertyPath: match.path,
		};

		recordMatch(
			match.transformer,
			match.value,
			matchContext,
			match.path.length,
			targets,
			dependencies,
			objectId,
		);
	}

	return {
		objectId,
		executionMap: { objectId, targets },
		dependencies,
	};
}

/**
 * Scans all objects to build execution maps and dependency graph.
 *
 * @param items Processing items to scan.
 * @param transformers All registered transformers.
 *
 * @returns Aggregated scan results for all objects.
 *
 * @throws When scanning or dependency extraction fails for any object.
 */
export async function scanAllObjects(
	items: ProcessingItem[],
	transformers: Transformer[],
): Promise<ScanResults> {
	const { concurrency = 16 } = getPluginConfig<AutodocConfig>(
		config,
		"autodoc",
	);

	const parallel = pLimit(concurrency);

	const scanResults = await Promise.all(
		items.map((item) => {
			const context = {
				sourcePath: item.sourcePath,
				modId: item.modId,
			};

			return parallel(() =>
				scanObject(item.object, transformers, context),
			);
		}),
	);

	const executionMaps = new Map<CompoundKey, ExecutionMap>();
	const objectDependencies = new Map<CompoundKey, Set<CompoundKey>>();

	for (let index = 0; index < scanResults.length; index++) {
		const result = scanResults[index]!;
		const item = items[index]!;
		const key = makeKeyFromObject(item.object, item.modId);

		executionMaps.set(key, result.executionMap);

		if (result.dependencies.size)
			objectDependencies.set(key, result.dependencies);
	}

	return { executionMaps, objectDependencies };
}

/**
 * Scans a value subtree for transformable patterns.
 * Adjusts paths to be relative to root object.
 *
 * @param value Value to scan.
 * @param basePath Path to this value in the parent object.
 * @param transformers All registered transformers.
 * @param context Context with the current object, `modId`, and `sourcePath`.
 *
 * @returns Execution targets with paths adjusted to root.
 */
export function scanValueSubtree(
	value: JSONValue,
	basePath: PropertyPath,
	transformers: Transformer[],
	context: {
		currentObject: GameObject;
		modId: ModID;
		sourcePath: CanonicalPath;
	},
): ExecutionTarget[] {
	const targets: ExecutionTarget[] = [];
	const { traversal, positional } = partitionTransformers(transformers);

	deepWalk(
		value,
		(relativePath: PropertyPath, val: JSONValue, relativeDepth: number) => {
			const propertyPath = [...basePath, ...relativePath];
			const depth = basePath.length + relativeDepth;

			for (const transformer of traversal)
				if (matchesContent(transformer.target.content, val))
					targets.push(
						createExecutionTarget(propertyPath, transformer, depth),
					);
		},
	);

	for (const match of collectPositionalMatches(
		context.currentObject,
		positional,
	))
		if (pathsComparable(match.path, basePath))
			targets.push(
				createExecutionTarget(
					match.path,
					match.transformer,
					match.path.length,
				),
			);

	return targets;
}
