/**
 * @file Patch path normalization and JSON Pointer conversion: `path`/`key` shorthand to array form, and array paths to JSON Pointer strings.
 */

import type { JSONPointer } from "immutable-json-patch";
import type { PropertyPath } from "../types/data.ts";
import type { Patch } from "./schemas.ts";

/**
 * Base patch fields for path normalization.
 */
type BasePatch = Pick<Patch, "path" | "key">;

/**
 * Decodes a single JSON Pointer segment: `~1` → `/`, `~0` → `~`.
 *
 * @param path The encoded pointer segment.
 *
 * @returns The decoded segment.
 */
function decodeJSONPointer(path: string): string {
	return path.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * Encodes a single path segment for use in a JSON Pointer: `~` → `~0`, `/` → `~1`.
 *
 * @param path The raw path segment.
 *
 * @returns The encoded segment.
 */
function encodeJSONPointer(path: string): string {
	return path.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Converts a JSON Pointer string to an array path.
 *
 * @param pointer JSON Pointer (e.g., "/foo/bar/0").
 *
 * @returns Array path (e.g., ["foo", "bar", 0]).
 */
function JSONPointerToArray(pointer: JSONPointer): PropertyPath {
	if (pointer === "") return [];
	if (pointer === "/") return [""];

	// & `/foo/bar/0` → `["foo", "bar", 0]`
	const segments = pointer.slice(1).split("/");

	return segments.map((segment) => decodeJSONPointer(segment));
}

/**
 * Normalizes a path from various formats to array form.
 *
 * @param patch Patch operation with path or key.
 *
 * @returns Normalized path as array.
 *
 * @throws Error if both path and key are provided.
 */
export function normalizePath(patch: BasePatch): PropertyPath {
	if (patch.path !== undefined && patch.key !== undefined)
		throw new Error(
			`Patch operation cannot have both 'path' and 'key' (mutually exclusive)\n` +
				`  op: ${(patch as Patch).op}`,
		);

	// * use key as single-segment path
	if (patch.key !== undefined) return [patch.key];

	if (patch.path !== undefined) {
		if (typeof patch.path === "string")
			return JSONPointerToArray(patch.path);

		return patch.path;
	}

	// * default to root
	return [];
}

/**
 * Converts an array path to a JSON Pointer string.
 *
 * @param path Array path (e.g., ["foo", "bar", 0]).
 *
 * @returns JSON Pointer (e.g., "/foo/bar/0").
 */
export function arrayToJSONPointer(path: PropertyPath): string {
	if (!path.length) return "";

	return "/" + path.map((segment) => encodeJSONPointer(segment)).join("/");
}
