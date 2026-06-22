/**
 * @file Execute phase: applies transformers to objects in dependency order.
 */

import {
	extractErrorMessage,
	getAtPath,
	makeKey,
	makeKeyFromObject,
	type ModWorkspace,
	readKey,
	resolveObjectID,
	resolvePatchPath,
	sortByDependencies,
	timelineCurrent,
	timelineRaw,
	WorkQueue,
	type ApplyResult,
	type CanonicalPath,
	type CompoundKey,
	type ModID,
	type ModScope,
	type Patch,
} from "@frmds/frontier";
import { buildIdIndex, resolveCandidate } from "../graph/resolve.ts";
import { AUTODOC_LOGGER } from "../logger.ts";
import { finalize } from "../object/enrichment.ts";
import type { ObjectStoreReader } from "../object/store-view.ts";
import { getPathKey } from "../path-cache.ts";
import { TransformerSkip } from "../transformers/skip.ts";
import type {
	ExecutionMap,
	ExecutionTarget,
	GameObject,
	ObjectContext,
	TransformContext,
	Transformer,
} from "../types/types.ts";
import { validatePositionalTargets } from "./output-validation.ts";
import { collectModifiedPaths, filterWorkQueue } from "./path-mutations.ts";
import { scanObject, scanValueSubtree } from "./scan.ts";
import {
	createTargetComparator,
	deduplicateTargets,
	sortExecutionTargets,
} from "./sort.ts";
import { partitionTransformers } from "./targeting.ts";
import type { ExecuteResults, SortResults } from "./types.ts";

/**
 * Per-object transform context: the full {@link TransformContext} minus the per-target `currentObject` and `propertyPath`, which {@link applyTransformation} supplies for each target.
 */
type ObjectTransformContext = Omit<
	TransformContext,
	"currentObject" | "propertyPath"
>;

/**
 * Reports execute-phase progress: the count processed so far, the total expected, and the reporting phase label.
 */
type ProgressCallback = (current: number, total: number, phase: string) => void;

/**
 * Execute-phase base context.
 * Transformers receive the read-only {@link ObjectStoreReader} view.
 */
interface ExecuteBaseContext {
	/** The writable workspace transforms apply their patches to. */
	workspace: ModWorkspace;
	/** Read-only view of all objects, handed to transformers. */
	objects: ObjectStoreReader;
	/** The mod scope the execute phase resolves dependencies within. */
	scope: ModScope;
	/** Abort signal that cancels processing when triggered. */
	signal?: AbortSignal;
	/** Announces the source file whose object is about to be processed, so the recording view uses it to attribute reads. Optional: tests and non-incremental callers omit it. */
	setReadConsumer?: (file: CanonicalPath | null) => void;
}

/**
 * Grouped parameters for batch object processing.
 */
interface BatchContext {
	/** Execution maps for the batch, keyed by `CompoundKey`. */
	executionMaps: Map<CompoundKey, ExecutionMap>;
	/** Context metadata for each object in the batch, keyed by `CompoundKey`. */
	objectContexts: Map<CompoundKey, ObjectContext>;
}

/**
 * A spawned object awaiting processing, paired with the context recording where it came from.
 */
interface PendingObject {
	/** The spawned object awaiting processing. */
	object: GameObject;
	/** Context recording the mod and source the object came from. */
	context: ObjectContext;
}

/**
 * Child logger scoped to the execute phase.
 */
const LOGGER = AUTODOC_LOGGER.getChild("execute");

/**
 * Applies a single transformation at a specific path.
 *
 * @param object The object to transform.
 * @param target Execution target specifying path and transformer.
 * @param position The object's live position within its file array (patch base root).
 * @param baseContext Transformation context.
 *
 * @returns Array of patches with file-rooted absolute paths.
 *
 * @throws When the path is not found, validation fails, or the transformation fails.
 */
function applyTransformation(
	object: GameObject,
	target: ExecutionTarget,
	position: number,
	baseContext: ObjectTransformContext,
): Patch[] {
	const value = getAtPath(object, target.path);

	if (value === undefined && target.path.length)
		throw new Error(
			`applyTransformation(): Path not found in object\n` +
				`  Path: ${target.path.join(".")}\n` +
				`  Object: ${baseContext.modId}:${object.type}:${
					resolveObjectID(object).id
				}\n` +
				`  Transformer: ${target.transformer.name}\n` +
				`  This likely indicates a bug in the scan phase or progressive re-scanning logic.`,
		);

	const context: TransformContext = {
		...baseContext,
		currentObject: object,
		propertyPath: target.path,
	};

	try {
		const patches = target.transformer.transform(value!, context);

		if (!Array.isArray(patches))
			throw new Error(
				`applyTransformation(): Transformer must return array of patches, got: ${typeof patches}`,
			);

		const resolvedPatches = patches.map((patch) =>
			resolvePatchPath(patch, [
				String(position),
				...context.propertyPath,
			]),
		);

		return resolvedPatches;
	} catch (error) {
		if (error instanceof TransformerSkip) throw error;

		throw new Error(
			`applyTransformation(): Transformation failed at ${baseContext.modId}:${object.type}:${
				resolveObjectID(object).id
			}\n` +
				`  Path: ${target.path.join(".")}\n` +
				`  Transformer: ${target.transformer.name}\n` +
				`  Error: ${extractErrorMessage(error)}`,
		);
	}
}

/**
 * Scans modified paths for new transformer targets.
 *
 * @param modifiedPaths Set of stringified paths to rescan.
 * @param currentObject Object after patches were applied.
 * @param transformers All registered transformers.
 * @param context Mod and source path context.
 *
 * @returns New execution targets found in modified subtrees.
 */
function rescanModifiedPaths(
	modifiedPaths: Set<string>,
	currentObject: GameObject,
	transformers: Transformer[],
	context: { modId: ModID; sourcePath: CanonicalPath },
): ExecutionTarget[] {
	const targets: ExecutionTarget[] = [];

	for (const pathKey of modifiedPaths) {
		const path = JSON.parse(pathKey);
		const value = getAtPath(currentObject, path);

		if (value !== undefined) {
			targets.push(
				...scanValueSubtree(value, path, transformers, {
					currentObject,
					modId: context.modId,
					sourcePath: context.sourcePath,
				}),
			);
		}
	}

	return targets;
}

/**
 * Processes a batch of objects through the execution pipeline.
 * Shared logic for both initial objects and newly-created objects.
 *
 * @param objects Objects to process.
 * @param batch Grouped maps for execution context, object context, and results.
 * @param baseContext Base transformation context.
 * @param transformers All registered transformers.
 * @param onSpawn Callback invoked for each object a transformation creates.
 * @param onProgress Optional progress callback.
 *
 * @returns The number of objects processed in this batch.
 *
 * @throws When transformers stay unresolved after the rescan loop settles, or when patch application fails.
 */
async function processObjectBatch(
	objects: GameObject[],
	batch: BatchContext,
	baseContext: ExecuteBaseContext,
	transformers: Transformer[],
	onSpawn: (
		object: GameObject,
		modId: ModID,
		sourcePath: CanonicalPath,
	) => void,
	onProgress?: (current: number, total: number) => void,
): Promise<number> {
	const comparator = createTargetComparator();

	const strictPositional = partitionTransformers(
		transformers,
	).positional.filter((transformer) => transformer.target.strict);

	let processed = 0;

	for (const object of objects) {
		const currentModId = baseContext.scope[0]!;
		const objectContextKey = makeKeyFromObject(object, currentModId);

		const objectContext = batch.objectContexts.get(objectContextKey);

		if (!objectContext) continue;

		baseContext.setReadConsumer?.(objectContext.sourcePath);

		const executionMapKey = makeKeyFromObject(object, objectContext.modId);
		const executionMap = batch.executionMaps.get(executionMapKey);

		if (!executionMap) {
			finalize(baseContext.workspace, executionMapKey, baseContext.scope);

			processed++;

			onProgress?.(processed, objects.length);

			continue;
		}

		const context = {
			...baseContext,
			sourcePath: objectContext.sourcePath,
			modId: objectContext.modId,
		} satisfies ObjectTransformContext;

		let currentObject: GameObject | null = timelineCurrent(
			baseContext.workspace.timeline(executionMapKey)!,
		)!;

		const queue = new WorkQueue<ExecutionTarget>(
			sortExecutionTargets([...executionMap.targets]),
			{
				keyOf: (target): string =>
					`${getPathKey(target)}:${target.transformer.name}`,
				compare: comparator,
				signal: baseContext.signal,
				label: `object ${resolveObjectID(object).id}`,
			},
		);

		let skipped: ExecutionTarget[] = [];
		let skipMessages: string[] = [];
		let progressedSinceFlush = false;

		while (queue.hasNext() || skipped.length) {
			if (!queue.hasNext()) {
				if (!progressedSinceFlush)
					throw new Error(
						`processObjectBatch(): unresolved transformers on \`${executionMapKey}\` after the rescan loop settled:\n  ${skipMessages.join("\n  ")}`,
					);

				queue.update(skipped, []);

				skipped = [];
				skipMessages = [];
				progressedSinceFlush = false;

				continue;
			}

			const target = queue.next();
			const file = baseContext.workspace.fileOf(executionMapKey)!;
			const position = baseContext.workspace.positionOf(executionMapKey)!;

			let allPatches: Patch[];

			try {
				allPatches = applyTransformation(
					currentObject,
					target,
					position,
					context,
				);
			} catch (error) {
				if (error instanceof TransformerSkip) {
					LOGGER.info(
						`Skipped \`${target.transformer.name}\` on \`${executionMapKey}\`: ${error.message}`,
					);

					skipped.push(target);
					skipMessages.push(
						`${target.transformer.name} at ${target.path.join(".")}: ${error.message}`,
					);

					continue;
				}

				throw error;
			}

			let result: ApplyResult;

			try {
				result = baseContext.workspace.apply(
					allPatches,
					{ modId: objectContext.modId, file },
					target.transformer.name,
					executionMapKey,
				);
			} catch (error) {
				throw new Error(
					`processObjectBatch(): Patch application failed\n` +
						`  Transformer: ${target.transformer.name}\n` +
						`  Object: ${executionMapKey}\n` +
						`  Error: ${extractErrorMessage(error)}`,
				);
			}

			for (const createdKey of result.created) {
				const createdTimeline =
					baseContext.workspace.timeline(createdKey)!;

				const [createdModId] = readKey(createdKey);

				onSpawn(
					timelineRaw(createdTimeline),
					createdModId,
					baseContext.workspace.fileOf(createdKey)!,
				);
			}

			if (result.tombstonedSelf) {
				currentObject = null;

				break;
			}

			currentObject = timelineCurrent(
				baseContext.workspace.timeline(executionMapKey)!,
			)!;

			progressedSinceFlush = true;

			const modifiedPaths = collectModifiedPaths(result.selfPatches);

			const filtered = filterWorkQueue(
				queue.remaining(),
				result.selfPatches,
			);

			skipped = filterWorkQueue(skipped, result.selfPatches);

			const newTargets = rescanModifiedPaths(
				modifiedPaths,
				currentObject,
				transformers,
				context,
			);

			queue.update(filtered, newTargets);
		}

		if (currentObject !== null) {
			if (strictPositional.length) {
				const positionalErrors = validatePositionalTargets(
					currentObject,
					timelineRaw(
						baseContext.workspace.timeline(executionMapKey)!,
					),
					strictPositional,
				);

				if (positionalErrors.length)
					throw new Error(
						`Object failed validation: ${executionMapKey}\n  ${positionalErrors.join("\n  ")}`,
					);
			}

			finalize(baseContext.workspace, executionMapKey, baseContext.scope);
		}

		processed++;

		onProgress?.(processed, objects.length);
	}

	baseContext.setReadConsumer?.(null);

	return processed;
}

/**
 * Executes transformations on all objects in sorted order.
 * Uses queue-based progressive scanning to handle patterns created by transformations.
 * Recursively processes newly-created objects until no more objects are created.
 *
 * @param sortResults Sorted objects and execution maps.
 * @param objectContexts Map of object IDs to their context metadata.
 * @param baseContext Base transformation context (excluding per-object fields).
 * @param transformers All registered transformers.
 * @param onProgress Optional progress callback.
 *
 * @returns Transformed objects.
 *
 * @throws When the abort signal fires during the execute phase.
 */
export async function executePhase(
	sortResults: SortResults,
	objectContexts: Map<CompoundKey, ObjectContext>,
	baseContext: ExecuteBaseContext,
	transformers: Transformer[],
	onProgress?: ProgressCallback,
): Promise<ExecuteResults> {
	const pendingObjects: PendingObject[] = [];

	let processedCount = 0;

	function onSpawn(
		object: GameObject,
		modId: ModID,
		sourcePath: CanonicalPath,
	): void {
		pendingObjects.push({ object, context: { sourcePath, modId } });
	}

	processedCount += await processObjectBatch(
		sortResults.sortedObjects,
		{
			executionMaps: sortResults.executionMaps,
			objectContexts,
		},
		baseContext,
		transformers,
		onSpawn,
		(current, total) => {
			onProgress?.(current, total, "execute");
		},
	);

	while (pendingObjects.length) {
		if (baseContext.signal?.aborted)
			throw new Error("Transformation aborted during execute phase");

		const batch = pendingObjects.splice(0, pendingObjects.length);

		const newObjectContexts = new Map<CompoundKey, ObjectContext>();

		for (const { object, context } of batch) {
			const key = makeKey(
				resolveObjectID(object).id,
				object.type,
				context.modId,
			);

			newObjectContexts.set(key, context);
		}

		const newScanResults = batch.map(({ object, context }) =>
			scanObject(object, transformers, context),
		);

		const newExecutionMaps = new Map<CompoundKey, ExecutionMap>();
		const dependenciesByKey = new Map<CompoundKey, Set<CompoundKey>>();

		for (let index = 0; index < newScanResults.length; index++) {
			const result = newScanResults[index]!;
			const { object, context } = batch[index]!;

			const key = makeKey(result.objectId, object.type, context.modId);

			newExecutionMaps.set(key, result.executionMap);
			dependenciesByKey.set(key, result.dependencies);
		}

		const sortableBatch = batch.map(({ object, context }) => {
			const id = resolveObjectID(object).id;
			const key = makeKey(id, object.type, context.modId);

			return { object, context, key };
		});
		const availableKeys = new Set<CompoundKey>(
			sortableBatch.map((item) => item.key),
		);

		const idIndex = buildIdIndex(availableKeys);

		const sortedNewObjects = sortByDependencies(
			sortableBatch,
			({ key }) => key,
			({ context, key }) => {
				const scope =
					context.modId === baseContext.scope[0]
						? baseContext.scope
						: ([context.modId] as ModScope);

				const deps = dependenciesByKey.get(key);

				if (!deps) return [];

				return [...deps].flatMap((dep) =>
					resolveCandidate(dep, scope, availableKeys, idIndex, key),
				);
			},
			{ relaxed: true },
		).map((item) => item.object);

		for (const [key, executionMap] of newExecutionMaps) {
			const deduplicated = deduplicateTargets(executionMap.targets);
			const sorted = sortExecutionTargets(deduplicated);

			newExecutionMaps.set(key, {
				objectId: executionMap.objectId,
				targets: sorted,
			});
		}

		processedCount += await processObjectBatch(
			sortedNewObjects,
			{
				executionMaps: newExecutionMaps,
				objectContexts: newObjectContexts,
			},
			baseContext,
			transformers,
			onSpawn,
		);
	}

	return { processedCount };
}
