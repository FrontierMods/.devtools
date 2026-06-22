/**
 * @file Lazy hydration for cached dependency mods: a workspace miss loads just the owning file's objects from the LMDB cache.
 *
 * Index freshness is the caller's responsibility, so reads here are trusted.
 */

import type {
	Cache,
	CanonicalPath,
	LazyObjectSource,
	ModID,
	ModWorkspace,
	ObjectID,
} from "@frmds/frontier";
import { loadObjectsIntoFile, type LoadableGameObject } from "./loader.ts";
import { AUTODOC_LOGGER } from "./logger.ts";

/**
 * Validity gate for the persisted index.
 */
export interface DependencyIndexMeta {
	/** Bump when the index schema changes. */
	version: number;
	/** Aggregate fingerprint of the mod's file set at index-build time. */
	fingerprint: string;
	/** Every cached file of the mod, for `hydrateAll`. */
	files: CanonicalPath[];
}

/**
 * Cache namespace mapping each object ID to its owning files.
 */
const INDEX_NAMESPACE = "object-id-index";

/**
 * Cache namespace holding the index validity meta.
 */
const META_NAMESPACE = "object-id-index-meta";

/**
 * Sole key under which the meta record is stored.
 */
const META_KEY = "meta";

/**
 * Child logger scoped to lazy hydration.
 */
const logger = AUTODOC_LOGGER.getChild("lazy");

/**
 * Bump when the index schema changes.
 */
export const INDEX_VERSION = 1;

/**
 * Persists the ID index and its validity meta after an eager (cold) load.
 *
 * @param cache The dependency mod's cache to persist into.
 * @param fingerprint The mod's aggregate fingerprint at load time.
 * @param filesByObjectId Owning files per object ID (IDs post alias expansion).
 * @param files All cached files of the mod.
 */
export function writeDependencyIndex(
	cache: Cache,
	fingerprint: string,
	filesByObjectId: Map<ObjectID, CanonicalPath[]>,
	files: CanonicalPath[],
): void {
	const indexStore = cache.kv<CanonicalPath[]>(INDEX_NAMESPACE);

	for (const [objectId, owningFiles] of filesByObjectId)
		indexStore.set(objectId, owningFiles);

	cache.kv<DependencyIndexMeta>(META_NAMESPACE).set(META_KEY, {
		version: INDEX_VERSION,
		fingerprint,
		files,
	});
}

/**
 * Reads the index meta, returning `undefined` when absent or schema-mismatched.
 *
 * @param cache The dependency mod's cache to read from.
 *
 * @returns The stored meta record, or `undefined` when missing or stale.
 */
export function readDependencyIndexMeta(
	cache: Cache,
): DependencyIndexMeta | undefined {
	const meta = cache.kv<DependencyIndexMeta>(META_NAMESPACE).get(META_KEY);

	if (!meta || meta.version !== INDEX_VERSION) return undefined;

	return meta;
}

/**
 * Builds the lazy source for one cached dependency mod.
 * The cache must outlive the build. The caller owns closing it.
 *
 * @param cache The dependency mod's open cache, which must outlive the build.
 * @param modId The dependency mod being lazily hydrated.
 * @param workspace The workspace that receives hydrated objects.
 *
 * @returns A lazy source that hydrates objects on demand.
 */
export function createLazyDependencySource(
	cache: Cache,
	modId: ModID,
	workspace: ModWorkspace,
): LazyObjectSource {
	const objectStore = cache.objects<LoadableGameObject>("objects");
	const indexStore = cache.kv<CanonicalPath[]>(INDEX_NAMESPACE);
	const meta = readDependencyIndexMeta(cache);
	const hydratedFiles = new Set<CanonicalPath>();

	function hydrateFile(filePath: CanonicalPath): boolean {
		if (hydratedFiles.has(filePath)) return false;

		hydratedFiles.add(filePath);
		loadObjectsIntoFile(
			objectStore.getObjectsTrusted(filePath),
			modId,
			filePath,
			workspace,
		);

		return true;
	}

	return {
		hydrate(id) {
			const owningFiles = indexStore.get(id);

			if (!owningFiles) return false;

			let hydrated = false;

			for (const filePath of owningFiles)
				hydrated = hydrateFile(filePath) || hydrated;

			return hydrated;
		},

		hydrateAll() {
			logger.warn(
				`createLazyDependencySource(): Full hydration of \`${modId}\` triggered. Lazy savings lost for this build.`,
			);

			let hydrated = false;

			if (meta)
				for (const filePath of meta.files)
					hydrated = hydrateFile(filePath) || hydrated;

			return hydrated;
		},
	};
}
