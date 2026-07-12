/**
 * @file The shared complete object index: every ID-bearing object in a file set, keyed `[id, type]`, fingerprint-gated for freshness.
 *
 * Completeness contract: a valid meta record guarantees the index AND the `objects` store are fully populated for `meta.files`, so consumers may trust-read both. Any producer writing meta must have written all three namespaces.
 */

import type { Cache } from "../cache/cache.ts";
import type { CacheKey } from "../cache/types.ts";
import { getFileMetadata, type FileMetadata } from "../cache/validation.ts";
import { readFiles } from "../file/reader.ts";
import { hashString } from "../hash.ts";
import { logger } from "../logger.ts";
import { resolveObjectIDs } from "../object/identity.ts";
import type { LoadableGameObject } from "../object/types.ts";
import type { CanonicalPath, ObjectID, ObjectType } from "../types/data.ts";

/**
 * A composite index key: an object's ID paired with its type.
 */
export type ObjectIndexKey = [ObjectID, ObjectType];

/**
 * The outcome of a freshness check: the stored index either matched or was rebuilt.
 */
export type IndexFreshness = "fresh" | "rebuilt";

/**
 * Accumulated index entries: owning files per ID, per type.
 */
export type ObjectIndexEntries = Map<
	ObjectID,
	Map<ObjectType, CanonicalPath[]>
>;

/**
 * Validity gate for the persisted index.
 */
export interface ObjectIndexMeta {
	/** Matches {@link OBJECT_INDEX_VERSION} when the schema is current. */
	version: number;
	/** Aggregate fingerprint of the file set at index-build time. */
	fingerprint: string;
	/** Every indexed file, for full hydration and freshness checks. */
	files: CanonicalPath[];
}

/**
 * One index hit: an object type and the files owning the ID under it.
 */
export interface OwningEntry {
	/** The object type of the indexed entries. */
	type: ObjectType;
	/** The files owning the ID under this type. */
	files: CanonicalPath[];
}

/**
 * Cache namespace mapping `[id, type]` to owning files.
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
 * Child logger scoped to the object index.
 */
const LOGGER = logger.getChild("object-index");

/**
 * Cache namespace holding each file's parsed objects, shared with autodoc's loader.
 */
export const OBJECT_STORE_NAMESPACE = "objects";

/**
 * Bump when the index schema changes. Version 2 introduced complete `[id, type]` keys.
 */
export const OBJECT_INDEX_VERSION = 2;

/**
 * Narrows a cache key to a composite index key.
 *
 * @param key The cache key to test.
 *
 * @returns `true` when the key is a two-part `[id, type]` array.
 */
function isObjectIndexKey(key: CacheKey): key is ObjectIndexKey {
	return Array.isArray(key) && key.length === 2;
}

/**
 * Stats all files in parallel for fingerprinting and cache validation.
 * Missing files are simply absent from the map, which downstream treats as a cache miss.
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
				// missing or unreadable file: leave unmapped, the consumer re-reads it
			}
		}),
	);

	return metadataByFile;
}

/**
 * Hashes a file-set's stats into one order-independent fingerprint. One changed mtime, size, added, or removed file changes the result.
 *
 * @param metadataByFile The stats for every file in the set, keyed by path.
 *
 * @returns The order-independent fingerprint of the file set.
 */
export function aggregateFingerprint(
	metadataByFile: Map<CanonicalPath, FileMetadata>,
): string {
	const lines = [...metadataByFile]
		.map(
			([filePath, metadata]) =>
				`${filePath}:${metadata.mtime}:${metadata.size}`,
		)
		.sort();

	return hashString(lines.join("\n"));
}

/**
 * Reads the index meta, returning `undefined` when absent or schema-mismatched.
 *
 * @param cache The mod's cache to read from.
 *
 * @returns The stored meta record, or `undefined` when missing or stale.
 */
export function readObjectIndexMeta(cache: Cache): ObjectIndexMeta | undefined {
	const meta = cache.kv<ObjectIndexMeta>(META_NAMESPACE).get(META_KEY);

	if (!meta || meta.version !== OBJECT_INDEX_VERSION) return undefined;

	return meta;
}

/**
 * Accumulates one file's objects into the index entries. Every ID-bearing object is indexed regardless of type, aliases expanded.
 *
 * @param entries The accumulator to extend.
 * @param sourcePath The file the objects were parsed from.
 * @param objects The file's parsed objects.
 */
export function collectObjectIndexEntries(
	entries: ObjectIndexEntries,
	sourcePath: CanonicalPath,
	objects: LoadableGameObject[],
): void {
	for (const object of objects) {
		if (typeof object.type !== "string") continue;

		for (const { id } of resolveObjectIDs(object)) {
			const byType =
				entries.get(id) ?? new Map<ObjectType, CanonicalPath[]>();

			const owningFiles = byType.get(object.type) ?? [];

			if (!owningFiles.includes(sourcePath)) owningFiles.push(sourcePath);

			byType.set(object.type, owningFiles);
			entries.set(id, byType);
		}
	}
}

/**
 * Persists the index and its validity meta, clearing prior entries first.
 *
 * The entry writes buffer in the backend and commit as one transaction, so a base-game-scale index lands in a single pass.
 *
 * @param cache The mod's cache to persist into.
 * @param entries The accumulated index entries.
 * @param fingerprint The file set's aggregate fingerprint at build time.
 * @param files All indexed files of the mod.
 */
export function writeObjectIndex(
	cache: Cache,
	entries: ObjectIndexEntries,
	fingerprint: string,
	files: CanonicalPath[],
): void {
	const indexStore = cache.kv<CanonicalPath[]>(INDEX_NAMESPACE);

	// * clearing keeps writes idempotent and purges keys from older schema versions
	indexStore.clear();

	for (const [id, byType] of entries)
		for (const [type, owningFiles] of byType)
			indexStore.set([id, type], owningFiles);

	// * completeness contract: the index and objects stores must be committed before the meta gate that vouches for them can land
	cache.flush();

	cache.kv<ObjectIndexMeta>(META_NAMESPACE).set(META_KEY, {
		version: OBJECT_INDEX_VERSION,
		fingerprint,
		files,
	});
}

/**
 * Guarantees a fresh index for the file set, rebuilding when cold or stale.
 *
 * A rebuild re-parses only changed or uncached files: valid per-file entries in the `objects` store are reused, so a schema-version bump over a warm store stays cheap.
 *
 * @param cache The mod's cache holding the index.
 * @param files The mod's current source file set.
 *
 * @returns `"fresh"` when the stored index already matched, `"rebuilt"` after a rebuild.
 *
 * @throws Error when a file cannot be read or parsed during a rebuild.
 */
export async function ensureObjectIndex(
	cache: Cache,
	files: CanonicalPath[],
): Promise<IndexFreshness> {
	const metadataByFile = await statFiles(files);
	const fingerprint = aggregateFingerprint(metadataByFile);
	const meta = readObjectIndexMeta(cache);

	if (meta && meta.fingerprint === fingerprint) return "fresh";

	const objectsStore = cache.objects<LoadableGameObject>(
		OBJECT_STORE_NAMESPACE,
	);

	const objectsByFile = new Map<CanonicalPath, LoadableGameObject[]>();
	const missedFiles: CanonicalPath[] = [];

	for (const filePath of files) {
		const cached = await objectsStore.getObjects(
			filePath,
			metadataByFile.get(filePath),
		);

		if (cached.length) objectsByFile.set(filePath, cached);
		else missedFiles.push(filePath);
	}

	const parsedFiles = await readFiles<LoadableGameObject[]>(missedFiles, {
		format: "json5",
	});

	for (const { sourcePath, data } of parsedFiles) {
		await objectsStore.setObjects(
			sourcePath,
			data,
			metadataByFile.get(sourcePath),
		);
		objectsByFile.set(sourcePath, data);
	}

	const entries: ObjectIndexEntries = new Map();

	for (const [filePath, objects] of objectsByFile)
		collectObjectIndexEntries(entries, filePath, objects);

	writeObjectIndex(cache, entries, fingerprint, files);

	LOGGER.info(
		`Object index rebuilt: ${files.length} files (${missedFiles.length} parsed), ${entries.size} IDs`,
	);

	return "rebuilt";
}

/**
 * Finds the files owning an ID, optionally narrowed to one type.
 *
 * @param cache The mod's cache holding the index.
 * @param id The object ID to look up.
 * @param type Object type filter, applied when provided.
 *
 * @returns One entry per type owning the ID, empty when unknown.
 */
export function findOwningFiles(
	cache: Cache,
	id: ObjectID,
	type?: ObjectType,
): OwningEntry[] {
	const indexStore = cache.kv<CanonicalPath[]>(INDEX_NAMESPACE);

	if (type) {
		const files = indexStore.get([id, type]);

		return files ? [{ type, files }] : [];
	}

	const owning: OwningEntry[] = [];

	for (const [key, files] of indexStore.prefixEntries([id]))
		if (isObjectIndexKey(key)) owning.push({ type: key[1], files });

	return owning;
}

/**
 * Lists every `[id, type]` key in the index.
 *
 * @param cache The mod's cache holding the index.
 *
 * @returns Every composite key in the index.
 */
export function listIndexKeys(cache: Cache): ObjectIndexKey[] {
	const keys: ObjectIndexKey[] = [];

	for (const [key] of cache.kv<CanonicalPath[]>(INDEX_NAMESPACE).entries())
		if (isObjectIndexKey(key)) keys.push(key);

	return keys;
}

/**
 * Trust-reads one file's parsed objects. Valid only under a fresh meta.
 *
 * @param cache The mod's cache holding the objects.
 * @param file The indexed file to read.
 *
 * @returns The file's parsed objects, empty when absent.
 */
export function readIndexedObjects(
	cache: Cache,
	file: CanonicalPath,
): LoadableGameObject[] {
	return cache
		.objects<LoadableGameObject>(OBJECT_STORE_NAMESPACE)
		.getObjectsTrusted(file);
}
