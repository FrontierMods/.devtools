/**
 * @file Primitive key-value storage backends: in-memory and LMDB-backed.
 */

import type { Database } from "lmdb";

/**
 * Primitive key-value storage backend.
 * Implementations handle persistence, while stores handle logic.
 */
export interface StorageBackend<V> {
	/**
	 * Reads the value stored under the given key.
	 *
	 * @param key Key whose value is read.
	 *
	 * @returns The stored value, or `undefined` when the key is absent.
	 */
	get(key: string): V | undefined;
	/**
	 * Writes a value under the given key.
	 *
	 * @param key Key to write under.
	 * @param value Value to store.
	 */
	put(key: string, value: V): void;
	/**
	 * Removes the value stored under the given key.
	 *
	 * @param key Key whose value is removed.
	 */
	remove(key: string): void;
	/** Removes every value from the backend. */
	clear(): void;
}

/**
 * In-memory storage backend.
 */
export class MemoryBackend<V> implements StorageBackend<V> {
	private readonly data = new Map<string, V>();

	/**
	 * Reads the value stored under the given key.
	 *
	 * @param key Key whose value is read.
	 *
	 * @returns The stored value, or `undefined` when the key is absent.
	 */
	get(key: string): V | undefined {
		return this.data.get(key);
	}

	/**
	 * Writes a value under the given key.
	 *
	 * @param key Key to write under.
	 * @param value Value to store.
	 */
	put(key: string, value: V): void {
		this.data.set(key, value);
	}

	/**
	 * Removes the value stored under the given key.
	 *
	 * @param key Key whose value is removed.
	 */
	remove(key: string): void {
		this.data.delete(key);
	}

	/** Removes every value from the backend. */
	clear(): void {
		this.data.clear();
	}
}

/**
 * LMDB storage backend.
 */
export class LMDBBackend<V> implements StorageBackend<V> {
	/**
	 * Wraps an LMDB database handle as a storage backend.
	 *
	 * @param db LMDB database handle backing this store.
	 */
	constructor(private readonly db: Database<V, string>) {}

	/**
	 * Reads the value stored under the given key.
	 *
	 * @param key Key whose value is read.
	 *
	 * @returns The stored value, or `undefined` when the key is absent.
	 */
	get(key: string): V | undefined {
		return this.db.get(key);
	}

	// TODO: refactor the three methods below to either `await` or ???
	/**
	 * Writes a value under the given key.
	 *
	 * @param key Key to write under.
	 * @param value Value to store.
	 *
	 * @throws Error when the underlying LMDB write rejects.
	 */
	put(key: string, value: V): void {
		this.db.put(key, value).catch((reason) => {
			throw new Error(reason);
		});
	}

	/**
	 * Removes the value stored under the given key.
	 *
	 * @param key Key whose value is removed.
	 *
	 * @throws Error when the underlying LMDB removal rejects.
	 */
	remove(key: string): void {
		this.db.remove(key).catch((reason) => {
			throw new Error(reason);
		});
	}

	/**
	 * Removes every value from the backend.
	 *
	 * @throws Error when the underlying LMDB clear rejects.
	 */
	clear(): void {
		this.db.clearAsync().catch((reason) => {
			throw new Error(reason);
		});
	}
}
