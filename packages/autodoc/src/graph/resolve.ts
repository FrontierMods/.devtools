/**
 * @file Generic dependency-key resolution: turns the scan's candidate keys into the actual object keys they constrain, across mod scope.
 */

import {
	makeKey,
	readKey,
	type CompoundKey,
	type ModScope,
} from "@frmds/frontier";

/**
 * Resolves an `(id, type)` pair against a mod scope to the first matching compound key in `availableKeys`, optionally excluding one key (to prevent self-dependencies).
 *
 * @param id The object ID to resolve.
 * @param type The object type to resolve.
 * @param scope The mod dependency chain to search, in order.
 * @param availableKeys All object keys in the build.
 * @param excludedKey A key to skip, used to prevent self-dependencies.
 *
 * @returns The first matching compound key in scope order, or `null` when none matches.
 */
export function resolveScopedKey(
	id: string,
	type: string,
	scope: ModScope,
	availableKeys: Set<CompoundKey>,
	excludedKey?: CompoundKey,
): CompoundKey | null {
	for (const scopedModId of scope) {
		const candidate = makeKey(id, type, scopedModId);

		if (candidate === excludedKey) continue;
		if (availableKeys.has(candidate)) return candidate;
	}

	return null;
}

/**
 * Resolves one transformer-declared dependency candidate to the actual object key(s) it constrains, across the full mod scope and excluding the declaring object itself.
 *
 * @param candidate A candidate key from a transformer's `extractDependencies` (or a native `copy-from` key).
 * @param scope The declaring object's mod dependency chain.
 * @param availableKeys All object keys in the build.
 * @param idIndex ID to keys index over `availableKeys`, for typeless resolution.
 * @param excludedKey The declaring object's own key, never returned as a dependency.
 *
 * @returns The actual object keys the candidate constrains, in scope order.
 */
export function resolveCandidate(
	candidate: CompoundKey,
	scope: ModScope,
	availableKeys: Set<CompoundKey>,
	idIndex: ReadonlyMap<string, CompoundKey[]>,
	excludedKey: CompoundKey,
): CompoundKey[] {
	const [, type, id] = readKey(candidate);

	if (type && type !== "*") {
		const key = resolveScopedKey(
			id,
			type,
			scope,
			availableKeys,
			excludedKey,
		);

		return key ? [key] : [];
	}

	const scoped = new Set(scope);

	return (idIndex.get(id) ?? []).filter(
		(key) => key !== excludedKey && scoped.has(readKey(key)[0]),
	);
}

/**
 * Builds a secondary index from object ID to compound keys for efficient typeless lookups.
 *
 * @param availableKeys All object keys in the build.
 *
 * @returns A map from object ID to the compound keys sharing that ID.
 */
export function buildIdIndex(
	availableKeys: Set<CompoundKey>,
): Map<string, CompoundKey[]> {
	const index = new Map<string, CompoundKey[]>();

	for (const key of availableKeys) {
		const [, , id] = readKey(key);
		const existing = index.get(id);

		if (existing) existing.push(key);
		else index.set(id, [key]);
	}

	return index;
}
