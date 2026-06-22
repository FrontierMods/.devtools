/**
 * @file Backend-agnostic cache stores: file metadata, key-value, validated objects, and bidirectional graphs.
 */

import fs from "fs-extra";
import type { CanonicalPath } from "../types/data.ts";
import type { StorageBackend } from "./backend.ts";
import type { ObjectEntry } from "./types.ts";
import { getFileMetadata, type FileMetadata } from "./validation.ts";

/**
 * File metadata store with backend-agnostic storage.
 * Uses mtime+size for fast change detection without reading file contents.
 */
export class FileStore {
	/**
	 * Wraps a storage backend as a file metadata store.
	 *
	 * @param backend Backend persisting the file metadata.
	 */
	constructor(private readonly backend: StorageBackend<FileMetadata>) {}

	/**
	 * Returns cached metadata for a file, statting and caching it on a miss.
	 *
	 * @param path Canonical path to the file.
	 *
	 * @returns The file's metadata.
	 *
	 * @throws Error when the file cannot be statted on a cache miss.
	 */
	async getMetadata(path: CanonicalPath): Promise<FileMetadata> {
		const cached = this.backend.get(path);

		if (cached) return cached;

		const stats = await fs.stat(path);

		const metadata: FileMetadata = {
			mtime: stats.mtimeMs,
			size: stats.size,
		};

		this.backend.put(path, metadata);

		return metadata;
	}

	/**
	 * Reports whether a file changed since its cached metadata, updating the cache when it has.
	 *
	 * @param path Canonical path to the file.
	 *
	 * @returns `true` when the file changed or was previously uncached.
	 *
	 * @throws Error when the file cannot be statted.
	 */
	async hasChanged(path: CanonicalPath): Promise<boolean> {
		const previous = this.backend.get(path);
		const stats = await fs.stat(path);

		const current: FileMetadata = {
			mtime: stats.mtimeMs,
			size: stats.size,
		};

		const changed =
			!previous ||
			previous.mtime !== current.mtime ||
			previous.size !== current.size;

		if (changed) this.backend.put(path, current);

		return changed;
	}

	/** Removes all cached file metadata. */
	clear(): void {
		this.backend.clear();
	}
}

/**
 * Key-value store with backend-agnostic storage.
 */
export class KVStore<T> {
	/**
	 * Wraps a storage backend as a key-value store.
	 *
	 * @param backend Backend persisting the stored values.
	 */
	constructor(private readonly backend: StorageBackend<T>) {}

	/**
	 * Reads the value stored under the given key.
	 *
	 * @param key Key whose value is read.
	 *
	 * @returns The stored value, or `undefined` when the key is absent.
	 */
	get(key: string): T | undefined {
		return this.backend.get(key);
	}

	/**
	 * Writes a value under the given key.
	 *
	 * @param key Key to write under.
	 * @param value Value to store.
	 */
	set(key: string, value: T): void {
		this.backend.put(key, value);
	}

	/**
	 * Removes the value stored under the given key.
	 *
	 * @param key Key whose value is removed.
	 */
	delete(key: string): void {
		this.backend.remove(key);
	}

	/** Removes all stored values. */
	clear(): void {
		this.backend.clear();
	}
}

/**
 * Object store with mtime+size validation and backend-agnostic storage.
 * Validation always compares against fresh file stats. Callers iterating many files should pre-stat in parallel and pass `current` to avoid sequential stat latency.
 */
export class ObjectStore<T> {
	/**
	 * Wraps a storage backend as an object store.
	 *
	 * @param backend Backend persisting the cached object entries.
	 */
	constructor(private readonly backend: StorageBackend<ObjectEntry>) {}

	/**
	 * Reads a file's cached objects, returning empty when absent or stale.
	 * Pass `current` to validate against an already-fetched stat instead of statting here.
	 *
	 * @param file Canonical path to the source file.
	 * @param current Already-fetched metadata used to validate freshness instead of statting.
	 *
	 * @returns The cached objects, or an empty array when absent or stale.
	 *
	 * @throws SyntaxError when the cached JSON entry is malformed.
	 */
	async getObjects(
		file: CanonicalPath,
		current?: FileMetadata,
	): Promise<T[]> {
		const entry = this.backend.get(file);

		// * entries without `json` predate the JSON-string format and read as misses
		if (!entry || typeof entry.json !== "string") return [];

		const valid = await this.isValid(file, entry, current);

		return valid ? (JSON.parse(entry.json) as T[]) : [];
	}

	/**
	 * Caches a file's parsed objects.
	 * Pass `current` to record an already-fetched stat. Statting before the file read guarantees a mid-read modification invalidates the entry.
	 *
	 * @param file Canonical path to the source file.
	 * @param objects Parsed objects to cache.
	 * @param current Already-fetched metadata recorded instead of statting the file.
	 */
	async setObjects(
		file: CanonicalPath,
		objects: T[],
		current?: FileMetadata,
	): Promise<void> {
		let metadata: FileMetadata | undefined;

		try {
			metadata = current ?? (await getFileMetadata(file));
		} catch {
			// file doesn't exist yet, store without metadata
		}

		this.backend.put(file, {
			json: JSON.stringify(objects),
			mtime: metadata?.mtime,
			size: metadata?.size,
		});
	}

	/**
	 * Reads a file's cached objects without freshness validation, synchronously. Serves callers that validated the whole file set up front (e.g. an aggregate fingerprint) and need reads inside synchronous lookup paths. Everyone else uses {@link getObjects}.
	 *
	 * @param file Canonical path to the source file.
	 *
	 * @returns The cached objects, or an empty array when absent.
	 *
	 * @throws SyntaxError when the cached JSON entry is malformed.
	 */
	getObjectsTrusted(file: CanonicalPath): T[] {
		const entry = this.backend.get(file);

		if (!entry || typeof entry.json !== "string") return [];

		return JSON.parse(entry.json) as T[];
	}

	/**
	 * Reports whether a cached entry still matches the source file's stats.
	 *
	 * @param file Canonical path to the source file.
	 * @param entry Cached entry whose recorded stats are compared.
	 * @param current Already-fetched metadata used instead of statting the file.
	 *
	 * @returns `true` when the entry's recorded mtime and size match the file.
	 */
	private async isValid(
		file: CanonicalPath,
		entry: ObjectEntry,
		current?: FileMetadata,
	): Promise<boolean> {
		if (entry.mtime === undefined || entry.size === undefined) return false;

		try {
			const metadata = current ?? (await getFileMetadata(file));

			return (
				metadata.mtime === entry.mtime && metadata.size === entry.size
			);
		} catch {
			return false;
		}
	}

	/**
	 * Removes a file's cached objects.
	 *
	 * @param file Canonical path whose cached objects are removed.
	 */
	invalidate(file: CanonicalPath): void {
		this.backend.remove(file);
	}

	/** Removes all cached objects. */
	clear(): void {
		this.backend.clear();
	}
}

/**
 * Identifier of a node in a {@link GraphStore}, stored verbatim as an edge endpoint.
 */
type GraphNode = string;

/**
 * Bidirectional graph store with backend-agnostic storage.
 */
export class GraphStore {
	/**
	 * Wraps forward and reverse backends as a bidirectional graph store.
	 *
	 * @param forward Backend storing outgoing edges per node.
	 * @param reverse Backend storing incoming edges per node.
	 */
	constructor(
		private readonly forward: StorageBackend<GraphNode[]>,
		private readonly reverse: StorageBackend<GraphNode[]>,
	) {}

	/**
	 * Adds a directed edge, recording it in both the forward and reverse indices.
	 *
	 * @param from Source node of the edge.
	 * @param to Target node of the edge.
	 */
	addEdge(from: GraphNode, to: GraphNode): void {
		const forwardEdges = this.forward.get(from) ?? [];

		if (!forwardEdges.includes(to)) {
			forwardEdges.push(to);

			this.forward.put(from, forwardEdges);
		}

		const reverseEdges = this.reverse.get(to) ?? [];

		if (!reverseEdges.includes(from)) {
			reverseEdges.push(from);

			this.reverse.put(to, reverseEdges);
		}
	}

	/**
	 * Removes a directed edge from both the forward and reverse indices.
	 *
	 * @param from Source node of the edge.
	 * @param to Target node of the edge.
	 */
	removeEdge(from: GraphNode, to: GraphNode): void {
		const forwardEdges = this.forward.get(from);

		if (forwardEdges)
			this.forward.put(
				from,
				forwardEdges.filter((edge) => edge !== to),
			);

		const reverseEdges = this.reverse.get(to);

		if (reverseEdges)
			this.reverse.put(
				to,
				reverseEdges.filter((edge) => edge !== from),
			);
	}

	/**
	 * Returns the outgoing neighbors of a node.
	 *
	 * @param of Node whose outgoing neighbors are read.
	 *
	 * @returns The target nodes reachable directly from the node.
	 */
	neighbors(of: GraphNode): GraphNode[] {
		return this.forward.get(of) ?? [];
	}

	/**
	 * Returns the incoming neighbors of a node.
	 *
	 * @param of Node whose incoming neighbors are read.
	 *
	 * @returns The source nodes that point directly at the node.
	 */
	reverseNeighbors(of: GraphNode): GraphNode[] {
		return this.reverse.get(of) ?? [];
	}

	/** Removes all edges from both indices. */
	clear(): void {
		this.forward.clear();
		this.reverse.clear();
	}
}
