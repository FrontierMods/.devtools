/**
 * @file The unified cache: LMDB persistence with in-memory fallback, vending namespaced KV, object, and graph stores.
 */

import fs from "fs-extra";
import type { RootDatabase } from "lmdb";
import { open } from "lmdb";
import path from "path";
import { FRONTIER_CACHE_DIR } from "../constants.ts";
import { extractErrorMessage } from "../error.ts";
import { normalizePath, toCanonicalPath } from "../file/paths.ts";
import { logger } from "../logger.ts";
import type { CanonicalPath } from "../types/data.ts";
import { LMDBBackend, MemoryBackend } from "./backend.ts";
import { GraphStore, KVStore, ObjectStore } from "./stores.ts";
import {
	RESERVED_NAMESPACE_PREFIX,
	type CacheOptions,
	type ObjectEntry,
} from "./types.ts";

/**
 * Cache logger.
 */
const LOGGER = logger.getChild("cache");

/**
 * Validates that a namespace does not use the reserved prefix.
 *
 * @param namespace Namespace to validate.
 *
 * @throws Error when the namespace uses the reserved prefix.
 */
function validateNamespace(namespace: string): void {
	if (namespace.startsWith(RESERVED_NAMESPACE_PREFIX))
		throw new Error(
			`Namespace \`${namespace}\` uses reserved prefix \`${RESERVED_NAMESPACE_PREFIX}\``,
		);
}

/**
 * Unified cache with LMDB persistence and in-memory fallback.
 *
 * @example
 * ```typescript
 * // Default: uses CWD, tries LMDB with in-memory fallback
 * const cache = new Cache();
 *
 * // Custom path (e.g., game data cache)
 * const gameCache = new Cache({ path: "/path/to/game/data" });
 *
 * // Force in-memory only
 * const volatileCache = new Cache({ persistent: false });
 *
 * // Access stores
 * const kv = cache.kv<MyType>("my-namespace");
 * const objects = cache.objects<GameObject>("parsed");
 * const graph = cache.graph("dependencies");
 * const files = cache.files();
 *
 * // Cleanup
 * await cache.close();
 * ```
 */
export class Cache {
	/** Resolved canonical path to cache directory. */
	readonly path: CanonicalPath;

	private lmdb: RootDatabase | null = null;
	private readonly stores = new Map<
		string,
		// * don't type the stores here to avoid type issues
		// * they get properly typed at endpoints
		KVStore<unknown> | ObjectStore<unknown> | GraphStore
	>();

	/**
	 * Constructs a cache, initializing LMDB or in-memory storage per the options.
	 *
	 * @param options Cache configuration controlling path and persistence.
	 */
	constructor(options: CacheOptions = {}) {
		const basePath = options.path ?? process.cwd();

		this.path = normalizePath(
			path.join(toCanonicalPath(basePath), FRONTIER_CACHE_DIR),
		);

		const persistent = options.persistent ?? true;

		if (persistent) {
			this.initializeLMDB();
		} else {
			this.initializeMemory();
		}
	}

	/**
	 * Gets a key-value store for the given namespace.
	 * Creates the store on first access, then returns the cached instance on subsequent calls.
	 *
	 * @param namespace Namespace the store is scoped to.
	 *
	 * @returns The key-value store for the namespace.
	 *
	 * @throws Error when the namespace uses the reserved prefix.
	 */
	kv<T>(namespace: string): KVStore<T> {
		validateNamespace(namespace);

		const key = `${namespace}:kv`;

		if (this.stores.has(key)) return this.stores.get(key) as KVStore<T>;

		const backend = this.lmdb
			? new LMDBBackend<T>(this.lmdb.openDB({ name: key }))
			: new MemoryBackend<T>();

		const store = new KVStore<T>(backend);

		this.stores.set(key, store);

		return store;
	}

	/**
	 * Gets an object store for the given namespace.
	 * Creates the store on first access, then returns the cached instance on subsequent calls.
	 *
	 * @param namespace Namespace the store is scoped to.
	 *
	 * @returns The object store for the namespace.
	 *
	 * @throws Error when the namespace uses the reserved prefix.
	 */
	objects<T>(namespace: string): ObjectStore<T> {
		validateNamespace(namespace);

		const key = `${namespace}:object`;

		if (this.stores.has(key)) return this.stores.get(key) as ObjectStore<T>;

		const backend = this.lmdb
			? new LMDBBackend<ObjectEntry>(this.lmdb.openDB({ name: key }))
			: new MemoryBackend<ObjectEntry>();

		const store = new ObjectStore<T>(backend);

		this.stores.set(key, store);

		return store;
	}

	/**
	 * Gets a graph store for the given namespace.
	 * Creates the store on first access, then returns the cached instance on subsequent calls.
	 *
	 * @param namespace Namespace the store is scoped to.
	 *
	 * @returns The graph store for the namespace.
	 *
	 * @throws Error when the namespace uses the reserved prefix.
	 */
	graph(namespace: string): GraphStore {
		validateNamespace(namespace);

		const key = `${namespace}:graph`;

		if (this.stores.has(key)) return this.stores.get(key) as GraphStore;

		const forwardBackend = this.lmdb
			? new LMDBBackend<string[]>(
					this.lmdb.openDB({ name: `${key}:forward` }),
				)
			: new MemoryBackend<string[]>();

		const reverseBackend = this.lmdb
			? new LMDBBackend<string[]>(
					this.lmdb.openDB({ name: `${key}:reverse` }),
				)
			: new MemoryBackend<string[]>();

		const store = new GraphStore(forwardBackend, reverseBackend);

		this.stores.set(key, store);

		return store;
	}

	/**
	 * Clears all cached data and removes the cache directory.
	 *
	 * @throws Error when removing the cache directory fails.
	 */
	async clear(): Promise<void> {
		await this.closeBackend();

		// Wait for filesystem to release locks (Windows)
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Remove cache directory
		if (await fs.pathExists(this.path)) {
			await fs.remove(this.path);

			LOGGER.info(`Cache cleared: ${this.path}`);
		}
	}

	/**
	 * Releases resources by closing LMDB handles.
	 */
	async close(): Promise<void> {
		await this.closeBackend();
	}

	/**
	 * Opens LMDB storage, falling back to in-memory storage on failure.
	 */
	private initializeLMDB(): void {
		try {
			// * ensure cache directory exists
			fs.ensureDirSync(this.path);

			this.lmdb = open({
				path: this.path,
				compression: true,
			});

			LOGGER.debug(`LMDB cache initialized: ${this.path}`);
		} catch (error) {
			LOGGER.warn(
				`LMDB initialization failed, using in-memory cache: ${extractErrorMessage(
					error,
				)}`,
			);

			this.initializeMemory();
		}
	}

	/**
	 * Switches the cache to in-memory storage by clearing the LMDB handle.
	 */
	private initializeMemory(): void {
		this.lmdb = null;

		LOGGER.debug("Using in-memory cache");
	}

	/**
	 * Closes the LMDB handle if open and discards the cached stores.
	 */
	private async closeBackend(): Promise<void> {
		if (this.lmdb) {
			await this.lmdb.close();

			this.lmdb = null;
		}

		this.stores.clear();
	}
}
