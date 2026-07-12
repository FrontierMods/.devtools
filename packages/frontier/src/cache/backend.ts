/**
 * @file Primitive key-value storage backends: in-memory and LMDB-backed.
 */

import type { Database, RangeIterable } from "lmdb";
import type { CacheKey } from "./types.ts";

/**
 * A buffered write awaiting commit: either a value to store or a removal.
 */
type PendingWrite<V> =
	| { operation: "put"; key: CacheKey; value: V }
	| { operation: "remove"; key: CacheKey };

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
	get(key: CacheKey): V | undefined;
	/**
	 * Writes a value under the given key.
	 *
	 * @param key Key to write under.
	 * @param value Value to store.
	 */
	put(key: CacheKey, value: V): void;
	/**
	 * Removes the value stored under the given key.
	 *
	 * @param key Key whose value is removed.
	 */
	remove(key: CacheKey): void;
	/** Iterates every stored key and value pair. */
	entries(): IterableIterator<[CacheKey, V]>;
	/** Iterates array-keyed entries whose leading elements equal the prefix. */
	prefixEntries(prefix: string[]): IterableIterator<[CacheKey, V]>;
	/** Commits buffered writes to storage. No-op for backends that write through immediately. */
	flush(): void;
	/** Removes every value from the backend. */
	clear(): void;
}

/**
 * Sentinel sorting after every realistic key element, closing a prefix range.
 */
const PREFIX_END = "\uffff";

/**
 * Serializes a key for `Map` storage. The kind marker keeps a string key from colliding with an array key that stringifies identically.
 *
 * @param key Key to serialize.
 *
 * @returns A collision-safe string form of the key.
 */
function serializeKey(key: CacheKey): string {
	return typeof key === "string" ? `s:${key}` : `a:${JSON.stringify(key)}`;
}

/**
 * Yields LMDB range results as key and value pairs.
 *
 * @param range Lazy LMDB range over the queried keys.
 *
 * @returns An iterator over key and value pairs.
 */
function* iterateRange<V>(
	range: RangeIterable<{ key: CacheKey; value: V }>,
): IterableIterator<[CacheKey, V]> {
	for (const { key, value } of range) yield [key, value];
}

/**
 * In-memory storage backend.
 */
export class MemoryBackend<V> implements StorageBackend<V> {
	// * keep the original key beside the value so iteration yields it verbatim
	private readonly data = new Map<string, [CacheKey, V]>();

	/**
	 * Reads the value stored under the given key.
	 *
	 * @param key Key whose value is read.
	 *
	 * @returns The stored value, or `undefined` when the key is absent.
	 */
	get(key: CacheKey): V | undefined {
		return this.data.get(serializeKey(key))?.[1];
	}

	/**
	 * Writes a value under the given key.
	 *
	 * @param key Key to write under.
	 * @param value Value to store.
	 */
	put(key: CacheKey, value: V): void {
		this.data.set(serializeKey(key), [key, value]);
	}

	/**
	 * Removes the value stored under the given key.
	 *
	 * @param key Key whose value is removed.
	 */
	remove(key: CacheKey): void {
		this.data.delete(serializeKey(key));
	}

	/**
	 * Iterates every stored key and value pair.
	 *
	 * @returns An iterator over key and value pairs.
	 */
	*entries(): IterableIterator<[CacheKey, V]> {
		yield* this.data.values();
	}

	/**
	 * Iterates array-keyed entries whose leading elements equal the prefix.
	 *
	 * @param prefix Leading key elements to match.
	 *
	 * @returns An iterator over matching key and value pairs.
	 */
	*prefixEntries(prefix: string[]): IterableIterator<[CacheKey, V]> {
		for (const [key, value] of this.data.values()) {
			if (!Array.isArray(key)) continue;

			if (prefix.every((part, index) => key[index] === part))
				yield [key, value];
		}
	}

	/** No-op: in-memory writes land in the `Map` immediately. */
	flush(): void {}

	/** Removes every value from the backend. */
	clear(): void {
		this.data.clear();
	}
}

/**
 * LMDB storage backend, writing behind and flushing before reads.
 *
 * A standalone LMDB sync write commits its own transaction and blocks the thread for milliseconds, so writes buffer here instead and commit as one transaction at the next read or {@link flush}. Every read flushes first, so a write is always visible to the reader that follows it.
 *
 * Durability is deferred until a flush: writes pending at a crash are lost, which the cache absorbs by rebuilding from source files.
 */
export class LMDBBackend<V> implements StorageBackend<V> {
	// * insertion-ordered and keyed by serialized key, so repeated writes under one key collapse to the last
	private readonly pending = new Map<string, PendingWrite<V>>();

	/**
	 * Wraps an LMDB database handle as a storage backend.
	 *
	 * @param db LMDB database handle backing this store.
	 */
	constructor(private readonly db: Database<V, CacheKey>) {}

	/**
	 * Reads the value stored under the given key, flushing buffered writes first.
	 *
	 * @param key Key whose value is read.
	 *
	 * @returns The stored value, or `undefined` when the key is absent.
	 */
	get(key: CacheKey): V | undefined {
		this.flush();

		return this.db.get(key);
	}

	/**
	 * Buffers a value to be written under the given key. The write commits at the next read or {@link flush}.
	 *
	 * @param key Key to write under.
	 * @param value Value to store.
	 */
	put(key: CacheKey, value: V): void {
		this.pending.set(serializeKey(key), { operation: "put", key, value });
	}

	/**
	 * Buffers a removal of the given key. The removal commits at the next read or {@link flush}.
	 *
	 * @param key Key whose value is removed.
	 */
	remove(key: CacheKey): void {
		this.pending.set(serializeKey(key), { operation: "remove", key });
	}

	/**
	 * Iterates every stored key and value pair, flushing buffered writes first.
	 *
	 * @returns An iterator over key and value pairs.
	 */
	entries(): IterableIterator<[CacheKey, V]> {
		// * flush eagerly rather than inside a generator body, which would defer it to the first iteration step
		this.flush();

		return iterateRange(this.db.getRange());
	}

	/**
	 * Iterates array-keyed entries whose leading elements equal the prefix, flushing buffered writes first.
	 *
	 * @param prefix Leading key elements to match.
	 *
	 * @returns An iterator over matching key and value pairs.
	 */
	prefixEntries(prefix: string[]): IterableIterator<[CacheKey, V]> {
		this.flush();

		return iterateRange(
			this.db.getRange({ start: prefix, end: [...prefix, PREFIX_END] }),
		);
	}

	/**
	 * Commits all buffered writes as one synchronous LMDB transaction.
	 *
	 * @throws Error when the underlying LMDB commit fails.
	 */
	flush(): void {
		if (this.pending.size === 0) return;

		this.db.transactionSync(() => {
			for (const write of this.pending.values())
				if (write.operation === "put")
					this.db.putSync(write.key, write.value);
				else this.db.removeSync(write.key);
		});

		this.pending.clear();
	}

	/**
	 * Removes every value from the backend, dropping buffered writes and clearing storage synchronously.
	 *
	 * @throws Error when the underlying LMDB clear fails.
	 */
	clear(): void {
		this.pending.clear();
		this.db.clearSync();
	}
}
