/**
 * @file Manifest persistence: a single KV entry in the mod's `.frontier/` cache.
 *
 * LMDB writes are atomic, so a failed build never half-updates it.
 */

import type { Cache } from "@frmds/frontier";
import { MANIFEST_VERSION, type BuildManifest } from "./types.ts";

/**
 * Cache namespace holding the manifest snapshot.
 */
const MANIFEST_NAMESPACE = "build-manifest";

/**
 * Sole key under which the manifest is stored.
 */
const MANIFEST_KEY = "latest";

/**
 * Reads the persisted manifest.
 * Anything other than a clean manifest counts as "rebuild everything" by the pipeline.
 *
 * @param cache The mod's cache holding the manifest snapshot.
 *
 * @returns The stored manifest, or `undefined` when absent or version-mismatched.
 */
export function readManifest(cache: Cache): BuildManifest | undefined {
	const stored = cache
		.kv<BuildManifest>(MANIFEST_NAMESPACE)
		.get(MANIFEST_KEY);

	if (!stored || stored.version !== MANIFEST_VERSION) return undefined;

	return stored;
}

/**
 * Persists the manifest.
 * Call only after the full pipeline has succeeded.
 *
 * @param cache The mod's cache holding the manifest snapshot.
 * @param manifest The snapshot to persist.
 */
export function writeManifest(cache: Cache, manifest: BuildManifest): void {
	cache.kv<BuildManifest>(MANIFEST_NAMESPACE).set(MANIFEST_KEY, manifest);
}
