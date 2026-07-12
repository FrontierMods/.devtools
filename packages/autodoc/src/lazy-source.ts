/**
 * @file Lazy hydration for cached dependency mods: a workspace miss loads just the owning file's objects from the LMDB cache.
 *
 * Index freshness is the caller's responsibility, so reads here are trusted.
 */

import {
	findOwningFiles,
	OBJECT_STORE_NAMESPACE,
	readObjectIndexMeta,
} from "@frmds/frontier";
import type {
	Cache,
	CanonicalPath,
	LazyObjectSource,
	LoadableGameObject,
	ModID,
	ModWorkspace,
} from "@frmds/frontier";
import { loadObjectsIntoFile } from "./loader.ts";
import { AUTODOC_LOGGER } from "./logger.ts";

/**
 * Child logger scoped to lazy hydration.
 */
const logger = AUTODOC_LOGGER.getChild("lazy");

/**
 * Builds the lazy source for one cached dependency mod.
 * The cache must outlive the build. The caller owns closing it.
 *
 * Hydration may load a file whose target object is then skipped by type.
 * The miss stays a miss and the file is not revisited.
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
	const objectStore = cache.objects<LoadableGameObject>(
		OBJECT_STORE_NAMESPACE,
	);

	const meta = readObjectIndexMeta(cache);
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
			let hydrated = false;

			for (const { files } of findOwningFiles(cache, id))
				for (const filePath of files)
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
