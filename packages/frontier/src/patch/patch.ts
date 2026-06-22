/**
 * @file The patch system entry point: applies sugar patches and re-exports the public surface.
 *
 * Sugar operations (append, add, merge and the rest) accept flexible paths (`key` shorthand, array paths, JSON Pointers) and lower to standard JSON Patch. `path` defaults to the root value when omitted, `key` is a single-segment shorthand, and the two are mutually exclusive. Schemas live in `schemas.ts`, path normalization in `pointer.ts`, and sugar lowering in `convert.ts`. This module applies the lowered result via `immutable-json-patch`.
 */

import { immutableJSONPatch } from "immutable-json-patch";
import type { JSONValue } from "../types/data.ts";
import { convertToJSONPatch } from "./convert.ts";
import type { Patch } from "./schemas.ts";

/**
 * Applies a sequence of patch operations to a value.
 *
 * @param value The value to patch.
 * @param patches Array of patch operations.
 *
 * @returns Patched value.
 *
 * @throws Error if any patch operation is invalid or cannot apply to the value.
 */
export function applyPatches(value: JSONValue, patches: Patch[]): JSONValue {
	return patches.reduce((accumulator, patch) => {
		return applyPatch(accumulator, patch);
	}, value);
}

/**
 * Applies a single patch operation to a value.
 *
 * @param value The value to patch.
 * @param patch Patch operation.
 *
 * @returns Patched value.
 *
 * @throws Error if the patch operation is invalid or cannot apply to the value.
 */
export function applyPatch(value: JSONValue, patch: Patch): JSONValue {
	return immutableJSONPatch<JSONValue>(
		value,
		convertToJSONPatch(patch, value),
	);
}

export { convertToJSONPatch } from "./convert.ts";
export { arrayToJSONPointer, normalizePath } from "./pointer.ts";
export { isPatch, PatchSchemas } from "./schemas.ts";
export type {
	AddPatch,
	AppendPatch,
	CopyPatch,
	DividePatch,
	DropPatch,
	InsertPatch,
	MergePatch,
	MovePatch,
	MultiplyPatch,
	Patch,
	PatchPath,
	PushPatch,
	RemovePatch,
	ReplacePatch,
	SubtractPatch,
	TestPatch,
} from "./schemas.ts";
