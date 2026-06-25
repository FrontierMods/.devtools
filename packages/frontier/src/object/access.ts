/**
 * @file Generic typed access into plain JSON structures.
 */

import type { JSONValue } from "../types/data.ts";
import type { PropertyPath } from "../types/data.ts";
import { isArray, isDefined, isObject } from "../types/guards.ts";

/**
 * A type-preserving key of `T`.
 */
type ObjectKey<T extends object> = keyof T;

/**
 * Array of `T`'s type-preserving keys.
 */
type ObjectKeys<T extends object> = ObjectKey<T>[];

/**
 * `T`'s key-value type-preserving entries.
 */
type ObjectEntries<T extends object> = {
	[Key in ObjectKey<T>]: [Key, T[Key]];
}[ObjectKey<T>][];

/**
 * An object reconstructed from type-preserving key-value entries.
 */
type ObjectFromEntries<Key extends PropertyKey, Value> = Record<Key, Value>;

/**
 * Callback invoked for each value during {@link deepWalk} traversal.
 *
 * @param path Path from root to this value.
 * @param value The value at this path.
 * @param depth Nesting depth.
 */
export type DeepWalkCallback = (
	path: PropertyPath,
	value: JSONValue,
	depth: number,
) => void;

/**
 * Returns an object's own keys, typed as the literal key union of `T`.
 *
 * @param object The object whose keys are read.
 *
 * @returns The object's own keys, typed against `T`.
 */
export function keys<T extends object>(object: T): ObjectKeys<T> {
	return Object.keys(object) as ObjectKeys<T>;
}

/**
 * Returns an object's own key-value tuples, typed against `T`.
 *
 * @param object The object whose entries are read.
 *
 * @returns The object's own key-value tuples, typed against `T`.
 */
export function entries<T extends object>(object: T): ObjectEntries<T> {
	return Object.entries(object) as ObjectEntries<T>;
}

/**
 * Builds an object from key-value entries, preserving the entries' key and value types.
 *
 * @param pairs The key-value entries to assemble, such as the output of {@link entries} or a `Map`.
 *
 * @returns The assembled object, typed as `Record<Key, Value>`.
 */
export function fromEntries<Key extends PropertyKey, Value>(
	pairs: Iterable<readonly [Key, Value]>,
): ObjectFromEntries<Key, Value> {
	return Object.fromEntries(pairs) as ObjectFromEntries<Key, Value>;
}

/**
 * Gets value at nested path in a JSON structure.
 *
 * @param value The root value to traverse.
 * @param path Array of property keys and indices to follow.
 *
 * @returns The value at the specified path, or `undefined` if not found.
 *
 * @example
 * ```ts
 * const data = { foo: { bar: [1, 2, 3] } };
 * getAtPath(data, ["foo", "bar", 1]); // 2
 * getAtPath(data, ["foo", "baz"]); // undefined
 * getAtPath(data, ["foo", 0]); // undefined
 * ```
 */
export function getAtPath(
	value: JSONValue,
	path: PropertyPath,
): JSONValue | undefined {
	let current: JSONValue | undefined = value;

	for (const segment of path) {
		if (isObject<JSONValue>(current)) {
			current = current[segment];
		} else if (isArray<JSONValue>(current)) {
			// * the coercion to `Number` has to exist for typechecking reasons
			// * in JS, `array["1"] === array[1]`
			current = current[Number(segment)];
		} else {
			return undefined;
		}
	}

	return current;
}

/**
 * Walks a JSON tree in post-order depth-first fashion (children before parents, root at depth 0 with path []). Throws on circular references.
 *
 * @param object The root value to traverse.
 * @param callback Invoked for each value, children before parents.
 *
 * @throws When a circular reference is detected during traversal.
 */
export function deepWalk(object: JSONValue, callback: DeepWalkCallback): void {
	const visited = new WeakSet<object>();

	function walk(value: JSONValue, path: PropertyPath, depth: number): void {
		if (typeof value !== "object" || value === null)
			return callback(path, value, depth);

		if (visited.has(value))
			throw new Error(
				`Circular reference detected at path: ${path.join(".")}\n` +
					`Objects must not contain circular references during transformation.`,
			);

		visited.add(value);

		if (Array.isArray(value)) {
			let index = 0;

			for (const item of value) {
				walk(item, [...path, index.toString()], depth + 1);

				index++;
			}
		} else {
			for (const [key, val] of Object.entries(value)) {
				if (isDefined(val)) walk(val, [...path, key], depth + 1);
			}
		}

		callback(path, value, depth);
	}

	walk(object, [], 0);
}
