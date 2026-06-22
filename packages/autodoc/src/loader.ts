/**
 * @file File-loading functions for the build pipeline.
 */

import {
	Cache,
	getFileMetadata,
	hasObjectID,
	ID_PROPERTIES,
	isBaseGame,
	pluralize,
	type ModWorkspace,
	readFile,
	readFiles,
	resolveObjectID,
	type CanonicalPath,
	type FileMetadata,
	type ModID,
	type ObjectID,
} from "@frmds/frontier";
import path from "path";
import { TYPE_LOAD_SKIP } from "./constants.ts";
import { modResolver } from "./context.ts";
import {
	createLazyDependencySource,
	readDependencyIndexMeta,
	writeDependencyIndex,
} from "./lazy-source.ts";
import { AUTODOC_LOGGER } from "./logger.ts";
import { aggregateFingerprint } from "./manifest/fingerprint.ts";
import type {
	FileContext,
	GameObject,
	LoadFilesResult,
} from "./types/types.ts";

/**
 * One recognized ID property name.
 */
type IDProperty = (typeof ID_PROPERTIES)[number];

/**
 * A {@link GameObject} as parsed from disk, before ID normalization.
 *
 * Any {@link IDProperty} may still hold an array of aliases rather than a single value.
 */
export type LoadableGameObject = {
	[key in keyof GameObject]: key extends IDProperty
		? string | string[] | undefined
		: GameObject[key];
};

/**
 * Child logger scoped to file loading.
 */
const logger = AUTODOC_LOGGER.getChild("loader");

/**
 * Expands objects that use array-valued `id` aliases into one object per ID.
 *
 * DDA allows `id: ["a", "b"]` for some types (e.g., overmap terrain aliases).
 * Our registry expects one string ID per object key, so this normalization preserves aliases by emitting cloned objects with singular IDs.
 *
 * @param objects The parsed objects to expand.
 * @param sourcePath The file the objects were parsed from.
 *
 * @returns The objects with array-valued IDs expanded into one object per ID.
 */
function expandAliasedObjectIds(
	objects: LoadableGameObject[],
	sourcePath: CanonicalPath,
): GameObject[] {
	const expandedObjects = [];

	let expandedAliasCount = 0;

	for (const object of objects) {
		const idLikeProperty = ID_PROPERTIES.find((property) =>
			Array.isArray(object[property]),
		);

		if (!idLikeProperty) {
			expandedObjects.push(object as GameObject);

			continue;
		}

		const idLikeValue = object[idLikeProperty];

		const aliasIds = (Array.isArray(idLikeValue) ? idLikeValue : [])
			.filter((aliasId): aliasId is string => typeof aliasId === "string")
			.map((aliasId) => aliasId.trim())
			.filter((aliasId) => aliasId.length > 0);

		if (!aliasIds.length) {
			logger.debug(
				`Skipping object with invalid array-valued \`${idLikeProperty}\` in ${sourcePath}: ${JSON.stringify(idLikeValue)}`,
			);

			continue;
		}

		for (const aliasId of aliasIds) {
			const expandedObject = {
				...object,
				[idLikeProperty]: aliasId,
			} as GameObject;

			expandedObjects.push(expandedObject);
		}

		expandedAliasCount += aliasIds.length - 1;
	}

	if (expandedAliasCount > 0)
		logger.debug(
			`Expanded ${expandedAliasCount} aliased ID ${expandedAliasCount === 1 ? "entry" : "entries"} in ${sourcePath}`,
		);

	return expandedObjects;
}

/**
 * Loads a single dependency mod.
 * dda: cached in <gamePath>/data/.frontier/
 * Others: read from disk, no cache.
 *
 * @param modId The dependency mod to load.
 * @param workspace The workspace that receives the loaded objects.
 * @param knownFingerprint The mod's precomputed fingerprint, when already available.
 *
 * @returns The load result, including any open cache for base-game mods.
 *
 * @throws Error when the base-game mod cannot be resolved by ID.
 */
async function loadDependency(
	modId: ModID,
	workspace: ModWorkspace,
	knownFingerprint?: string,
): Promise<LoadFilesResult> {
	const modFiles = await modResolver.getFiles(modId);

	if (isBaseGame(modId)) {
		const mod = modResolver.findById(modId);

		if (!mod)
			throw new Error(`loadDependency(): mod not found: \`${modId}\``);

		const cache = new Cache({ path: path.dirname(mod.contentRoot) });

		const fingerprint =
			knownFingerprint ?? aggregateFingerprint(await statFiles(modFiles));

		const meta = readDependencyIndexMeta(cache);

		if (meta && meta.fingerprint === fingerprint) {
			workspace.registerLazySource(
				modId,
				createLazyDependencySource(cache, modId, workspace),
			);

			logger.debug(
				`Registered lazy source for ${modId}: ${meta.files.length} ${pluralize(meta.files.length, "file")} deferred`,
			);

			return {
				filesLoaded: 0,
				objectsLoaded: 0,
				fileContexts: [],
				openCache: cache,
			};
		}

		const result = await loadWithCache(modFiles, modId, cache, workspace);

		writeDependencyIndex(
			cache,
			fingerprint,
			buildIdIndexFromContexts(result.fileContexts),
			modFiles,
		);
		await cache.close();

		return result;
	}

	return loadFromDisk(modFiles, modId, workspace);
}

/**
 * Builds an index of owning files per object ID, from freshly-loaded file contexts. IDs are post alias expansion, matching what lazy hydration produces.
 *
 * @param fileContexts The freshly-loaded file contexts to index.
 *
 * @returns A map from each object ID to the files that own it.
 */
function buildIdIndexFromContexts(
	fileContexts: FileContext[],
): Map<ObjectID, CanonicalPath[]> {
	const filesByObjectId = new Map<ObjectID, CanonicalPath[]>();

	for (const { sourcePath, objects } of fileContexts) {
		for (const object of objects) {
			const { id } = resolveObjectID(object);
			const owningFiles = filesByObjectId.get(id) ?? [];

			if (!owningFiles.includes(sourcePath)) owningFiles.push(sourcePath);

			filesByObjectId.set(id, owningFiles);
		}
	}

	return filesByObjectId;
}

/**
 * Loads files using cache with per-file mtime+size validation.
 * Cache hits skip reading and parsing, while misses read, parse, and update the cache.
 *
 * @param files The files to load.
 * @param modId The mod the files belong to.
 * @param cache The cache used for validation and storage.
 * @param workspace The workspace that receives the loaded objects.
 *
 * @returns The load result for the given files.
 *
 * @throws Error when a cache-missed file cannot be read or parsed.
 */
async function loadWithCache(
	files: CanonicalPath[],
	modId: ModID,
	cache: Cache,
	workspace: ModWorkspace,
): Promise<LoadFilesResult> {
	const cacheStore = cache.objects<LoadableGameObject>("objects");
	const fileContexts: FileContext[] = [];
	const metadataByFile = await statFiles(files);

	let objectsLoaded = 0;
	let cacheHits = 0;

	for (const filePath of files) {
		const metadata = metadataByFile.get(filePath);
		const cached = await cacheStore.getObjects(filePath, metadata);

		let loadableObjects: LoadableGameObject[];

		if (cached.length) {
			loadableObjects = cached;

			cacheHits++;
		} else {
			const { data } = await readFile<LoadableGameObject[]>(filePath, {
				format: "json5",
			});

			loadableObjects = data;

			await cacheStore.setObjects(filePath, loadableObjects, metadata);
		}

		objectsLoaded += loadObjectsIntoFile(
			loadableObjects,
			modId,
			filePath,
			workspace,
		);

		fileContexts.push({
			sourcePath: filePath,
			modId,
			objects: workspace.liveProjection(modId, filePath) as GameObject[],
		});
	}

	logger.debug(
		`Loaded ${modId}: ${files.length} ${pluralize(files.length, "file")}, ${cacheHits} cache ${pluralize(cacheHits, "hit")}, ${objectsLoaded} ${pluralize(objectsLoaded, "object")}`,
	);

	return { filesLoaded: files.length, objectsLoaded, fileContexts };
}

/**
 * Loads files directly from disk without caching.
 *
 * @param files The files to load.
 * @param modId The mod the files belong to.
 * @param workspace The workspace that receives the loaded objects.
 *
 * @returns The load result for the given files.
 *
 * @throws Error when a file cannot be read or parsed.
 */
async function loadFromDisk(
	files: CanonicalPath[],
	modId: ModID,
	workspace: ModWorkspace,
): Promise<LoadFilesResult> {
	const fileContexts: FileContext[] = [];

	const parsedFiles = await readFiles<LoadableGameObject[]>(files, {
		format: "json5",
	});

	let objectsLoaded = 0;

	for (const { sourcePath, data } of parsedFiles) {
		objectsLoaded += loadObjectsIntoFile(
			data,
			modId,
			sourcePath,
			workspace,
		);

		fileContexts.push({
			sourcePath,
			modId,
			objects: workspace.liveProjection(
				modId,
				sourcePath,
			) as GameObject[],
		});
	}

	logger.debug(
		`Loaded ${modId} from disk: ${files.length} ${pluralize(files.length, "file")}, ${objectsLoaded} ${pluralize(objectsLoaded, "object")}`,
	);

	return { filesLoaded: files.length, objectsLoaded, fileContexts };
}

/**
 * Stats all files in parallel for cache validation.
 * One batched pass beats per-file stats inside the load loop. Missing files are simply absent from the map, which downstream treats as a cache miss.
 *
 * @param files The files to stat.
 *
 * @returns A map from each file to its metadata, omitting unreadable files.
 */
export async function statFiles(
	files: CanonicalPath[],
): Promise<Map<CanonicalPath, FileMetadata>> {
	const metadataByFile = new Map<CanonicalPath, FileMetadata>();

	await Promise.all(
		files.map(async (filePath) => {
			try {
				metadataByFile.set(filePath, await getFileMetadata(filePath));
			} catch {
				// missing or unreadable file: leave unmapped, the loader re-reads it
			}
		}),
	);

	return metadataByFile;
}

/**
 * Normalizes and loads one file's parsed objects into the workspace: expand aliased IDs, drop objects without IDs or with load-skipped types. Single shared path for eager loading and lazy hydration, so the two cannot drift.
 *
 * @param loadableObjects The parsed objects to normalize and load.
 * @param modId The mod the objects belong to.
 * @param filePath The file the objects were parsed from.
 * @param workspace The workspace that receives the loaded objects.
 *
 * @returns Count of objects loaded.
 */
export function loadObjectsIntoFile(
	loadableObjects: LoadableGameObject[],
	modId: ModID,
	filePath: CanonicalPath,
	workspace: ModWorkspace,
): number {
	const objects = expandAliasedObjectIds(loadableObjects, filePath);

	let objectsLoaded = 0;

	for (const object of objects) {
		if (!hasObjectID(object)) {
			logger.debug(
				`Skipping unprocessable object in ${filePath}: no ${ID_PROPERTIES.join(" or ")} property`,
			);

			continue;
		}

		if (!object.type) continue;
		if (TYPE_LOAD_SKIP.includes(object.type)) continue;

		workspace.load(object, modId, filePath);

		objectsLoaded++;
	}

	return objectsLoaded;
}

/**
 * Parses source files and loads them into the `ModWorkspace`.
 * Uses CWD cache for per-file mtime+size validation.
 *
 * @param files The source files to parse and load.
 * @param modId The mod the files belong to.
 * @param workspace The workspace that receives the loaded objects.
 *
 * @returns The load result for the given files.
 *
 * @throws Error when a file cannot be read or parsed.
 */
export async function loadFiles(
	files: CanonicalPath[],
	modId: ModID,
	workspace: ModWorkspace,
): Promise<LoadFilesResult> {
	const cache = new Cache();

	try {
		return await loadWithCache(files, modId, cache, workspace);
	} finally {
		await cache.close();
	}
}

/**
 * Loads all dependency mods into the `ModWorkspace`.
 *
 * @param dependencies The dependency mods to load, in resolution order.
 * @param workspace The workspace that receives the loaded objects.
 * @param dependencyFingerprints Precomputed fingerprints per mod, when already available.
 *
 * @returns Aggregate load counts and any caches left open for lazy sources.
 *
 * @throws Error when a dependency mod cannot be resolved, read, or parsed.
 */
export async function loadDependencies(
	dependencies: ModID[],
	workspace: ModWorkspace,
	dependencyFingerprints?: Map<ModID, string>,
): Promise<{
	modsLoaded: number;
	filesLoaded: number;
	objectsLoaded: number;
	fileContexts: FileContext[];
	openCaches: Cache[];
}> {
	// * sequential on purpose: loading is CPU-bound on one thread, so concurrency buys nothing, and sequence makes `workspace.load` insertion order exactly the resolver's dependency order
	const results = [];

	for (const modId of dependencies)
		results.push(
			await loadDependency(
				modId,
				workspace,
				dependencyFingerprints?.get(modId),
			),
		);

	const fileContexts = results.flatMap((result) => result.fileContexts);

	return {
		modsLoaded: dependencies.length,
		filesLoaded: fileContexts.length,
		objectsLoaded: fileContexts.reduce(
			(total, file) => total + file.objects.length,
			0,
		),
		fileContexts,
		openCaches: results
			.map((result) => result.openCache)
			.filter((cache): cache is Cache => cache !== undefined),
	};
}
