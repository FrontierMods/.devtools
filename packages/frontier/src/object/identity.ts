/**
 * @file Object identity: resolving an object's ID and packing/unpacking the `modId:type:id` compound key.
 */

import type { ModID } from "../mod/types.ts";
import type { ObjectID, ObjectType } from "../types/data.ts";
import {
	type CompoundKey,
	type DecomposedKey,
	type GameObject,
	type IDResolvableObject,
	ID_PROPERTIES,
	type ResolvedID,
} from "./types.ts";

/**
 * Matches the first unescaped `:` so escaped colons inside key parts survive a split.
 */
const UNESCAPED_COLON = /(?<!\\):/;

/**
 * Escapes literal colons in a key part so they do not act as field separators.
 *
 * @param value The key part to escape.
 *
 * @returns The key part with literal colons escaped.
 */
function escapeForKey(value: string): string {
	return value.replaceAll(":", "\\:");
}

/**
 * Restores escaped colons in a key part to their literal form.
 *
 * @param value The key part to unescape.
 *
 * @returns The key part with escaped colons restored to literal form.
 */
function unescapeForKey(value: string): string {
	return value.replaceAll("\\:", ":");
}

/**
 * Checks whether an object has a resolvable identifier value.
 *
 * @param object The object to inspect.
 *
 * @returns `true` when one of {@link ID_PROPERTIES} has a non-empty string value.
 */
export function hasObjectID(object: GameObject): object is IDResolvableObject {
	for (const property of ID_PROPERTIES) {
		const value = object[property];

		if (typeof value === "string" && value.trim().length) return true;
	}

	return false;
}

/**
 * Extracts the identifying value from an object.
 *
 * @param object The object to resolve an ID for.
 *
 * @returns The first {@link ResolvedID}.
 *
 * @throws If ID cannot be resolved.
 */
export function resolveObjectID(object: GameObject): ResolvedID {
	for (const property of ID_PROPERTIES) {
		const value = object[property];

		if (typeof value === "string" && value.trim().length)
			return { id: value.trim(), property };
	}

	throw new Error(
		`resolveObjectID(): Unable to resolve object ID, object is unprocessable. Ensure all objects have \`id\` or \`abstract\`.\nObject:\n${JSON.stringify(object, null, 2)}`,
	);
}

/**
 * Generates a unique key for an object.
 *
 * @param id The resolved identifier value.
 * @param type Object type.
 * @param modId Mod ID.
 *
 * @returns Compound key.
 */
export function makeKey(
	id: ObjectID,
	type: ObjectType | undefined,
	modId: ModID,
): CompoundKey {
	return [modId, type ?? "*", id].map(escapeForKey).join(":") as CompoundKey;
}

/**
 * Derives an object's compound key from its resolved ID, type, and owning mod.
 *
 * @param object The object to derive a key for.
 * @param modId The mod that owns the object.
 *
 * @returns The object's compound key.
 *
 * @throws When the object's ID cannot be resolved.
 */
export function makeKeyFromObject(
	object: GameObject,
	modId: ModID,
): CompoundKey {
	const id = resolveObjectID(object).id;
	const type = object.type;

	return makeKey(id, type, modId);
}

/**
 * Splits a compound key back into mod, type, and ID, honoring escaped colons.
 *
 * @param key The compound key to split.
 *
 * @returns The key decomposed into mod, type, and ID parts.
 */
export function readKey(key: CompoundKey): DecomposedKey {
	// * if no regex escape is necessary, decompose cleanly
	if (!key.includes("\\")) return key.split(":") as DecomposedKey;

	return key.split(UNESCAPED_COLON).map(unescapeForKey) as DecomposedKey;
}

/**
 * Reports whether a compound key matches the given ID, plus optional type and mod filters.
 *
 * @param key The compound key to test.
 * @param id The ID the key must match.
 * @param type Object type filter, applied when provided.
 * @param modId Mod filter, applied when provided.
 *
 * @returns `true` when the key matches the ID and every provided filter.
 */
export function matchesKey(
	key: CompoundKey,
	id: ObjectID,
	type?: ObjectType,
	modId?: ModID,
): boolean {
	const [keyMod, keyType, keyId] = readKey(key);

	return (
		keyId === id &&
		(!type || keyType === type) &&
		(!modId || keyMod === modId)
	);
}
