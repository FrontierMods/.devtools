/**
 * @file Read queries: a serialized cross-object read and the resolver mapping it to the files owning matching objects.
 *
 * Queries omit the mod ID, unlike `CompoundKey`, so a read resolves to whichever file owns the answer regardless of mod.
 *
 * @example
 * ```
 * "gun:glock_19"  // a specific type
 * "*:glock_19"    // any type
 * ```
 */

import {
	readKey,
	resolveObjectID,
	type CanonicalPath,
	type CompoundKey,
	type ObjectID,
	type ObjectType,
} from "@frmds/frontier";
import type { FileContext } from "../types/types.ts";

/**
 * A serialized read: `type:id` or `*:id`.
 */
export type ReadQuery = `${string}:${string}`;

/**
 * Maps a query to the sorted CWD source files owning matching objects.
 */
export type QueryResolver = (query: ReadQuery) => CanonicalPath[];

/**
 * Serializes a read. An omitted type means a type-agnostic lookup.
 *
 * @param id The object ID being read.
 * @param type The object type, omitted for a type-agnostic lookup.
 *
 * @returns The serialized read query.
 */
export function makeQuery(id: ObjectID, type?: ObjectType): ReadQuery {
	return `${type ?? "*"}:${id}`;
}

/**
 * Converts a scan-phase dependency key (`mod:type:id`, possibly wildcard-typed) to a query.
 *
 * @param key The scan-phase dependency key to convert.
 *
 * @returns The query derived from the key.
 */
export function queryFromKey(key: CompoundKey): ReadQuery {
	const [, type, id] = readKey(key);

	return makeQuery(id, type === "*" ? undefined : type);
}

/**
 * Indexes the CWD mod's objects by typed and untyped query for owner resolution. Built once per rebuild from the loaded file contexts (pre-transform shapes, where IDs and types never change during execution).
 *
 * @param fileContexts The loaded file contexts whose objects are indexed.
 *
 * @returns A resolver mapping a query to its owning source files.
 */
export function buildQueryResolver(fileContexts: FileContext[]): QueryResolver {
	const ownersByQuery = new Map<ReadQuery, Set<CanonicalPath>>();

	function record(query: ReadQuery, owner: CanonicalPath): void {
		let owners = ownersByQuery.get(query);

		if (!owners) {
			owners = new Set();

			ownersByQuery.set(query, owners);
		}

		owners.add(owner);
	}

	for (const { sourcePath, objects } of fileContexts) {
		for (const object of objects) {
			const { id } = resolveObjectID(object);

			record(makeQuery(id, object.type), sourcePath);
			record(makeQuery(id), sourcePath);
		}
	}

	return function resolve(query: ReadQuery): CanonicalPath[] {
		return [...(ownersByQuery.get(query) ?? [])].sort();
	};
}
