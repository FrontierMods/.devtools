/**
 * @file Shared cache types: store options, the cached-object entry shape, and the reserved namespace prefix.
 */

import { META_NAMESPACE } from "../constants.ts";

/**
 * Options for creating a {@link Cache} instance.
 */
export interface CacheOptions {
	/**
	 * Base directory for cache storage.
	 * Cache files are stored at `<path>/.frontier/`.
	 *
	 * @default process.cwd()
	 */
	path?: string;

	/**
	 * Whether to use persistent (LMDB) storage.
	 * If true, tries LMDB and falls back to in-memory on failure.
	 * If false, uses in-memory storage directly.
	 *
	 * @default true
	 */
	persistent?: boolean;
}

/**
 * A cached file's parsed objects plus the source file's stats at parse time.
 * Objects are stored as a single JSON string: native `JSON.parse` decodes roughly 3× faster than structured msgpack decoding, which dominates cache read time for large mods.
 */
export interface ObjectEntry {
	/** The file's parsed objects, JSON-serialized. */
	json: string;
	/** Source file modification time at parse, for invalidation. */
	mtime?: number;
	/** Source file size at parse, for invalidation. */
	size?: number;
}

/**
 * Reserved namespace prefix for internal cache metadata.
 */
export const RESERVED_NAMESPACE_PREFIX = META_NAMESPACE;
