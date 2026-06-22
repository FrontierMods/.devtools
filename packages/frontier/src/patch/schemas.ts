/**
 * @file Patch operation schemas and types: the TypeBox discriminated unions, the `Static`-derived per-op types, the `Patch` union, and the `isPatch` guard.
 */

import type { JSONPointer } from "immutable-json-patch";
import { type Static, Type } from "typebox";
import type { JSONValue, PropertyPath } from "../types/data.ts";
import { isObject } from "../types/guards.ts";

/**
 * Path specification for patch operations.
 * - Array of segments: ["foo", "bar", 0]
 * - JSON Pointer string: "/foo/bar/0"
 */
export type PatchPath = PropertyPath | JSONPointer;

/**
 * Insert a value at a path (maps to JSON Patch `add`).
 */
export type InsertPatch = Static<typeof PatchSchemas.insert>;

/**
 * Push a value onto an array.
 */
export type PushPatch = Static<typeof PatchSchemas.push>;

/**
 * Append a value to an array only if not already present.
 */
export type AppendPatch = Static<typeof PatchSchemas.append>;

/**
 * Drop array items matching a value or filter set.
 */
export type DropPatch = Static<typeof PatchSchemas.drop>;

/**
 * Add a number to a numeric value.
 */
export type AddPatch = Static<typeof PatchSchemas.add>;

/**
 * Subtract a number from a numeric value.
 */
export type SubtractPatch = Static<typeof PatchSchemas.subtract>;

/**
 * Multiply a numeric value by a number.
 */
export type MultiplyPatch = Static<typeof PatchSchemas.multiply>;

/**
 * Divide a numeric value by a number.
 */
export type DividePatch = Static<typeof PatchSchemas.divide>;

/**
 * Shallow-merge an object's properties into the target.
 */
export type MergePatch = Static<typeof PatchSchemas.merge>;

/**
 * Replace the value at a path.
 */
export type ReplacePatch = Static<typeof PatchSchemas.replace>;

/**
 * Remove the value at a path.
 */
export type RemovePatch = Static<typeof PatchSchemas.remove>;

/**
 * Assert the value at a path equals an expected value.
 */
export type TestPatch = Static<typeof PatchSchemas.test>;

/**
 * Move a value from one path to another.
 */
export type MovePatch = Static<typeof PatchSchemas.move>;

/**
 * Copy a value from one path to another.
 */
export type CopyPatch = Static<typeof PatchSchemas.copy>;

/**
 * Union of all patch operation types
 */
export type Patch =
	| InsertPatch
	| PushPatch
	| AppendPatch
	| DropPatch
	| AddPatch
	| SubtractPatch
	| MultiplyPatch
	| DividePatch
	| MergePatch
	| ReplacePatch
	| RemovePatch
	| TestPatch
	| MovePatch
	| CopyPatch;

/**
 * Schema module with recursive `JSONValue`/`JsonObject` definitions.
 *
 * The undefined in JsonObject is critical for type compatibility.
 */
const JSON_MODULE = Type.Module({
	JSONValue: Type.Union([
		Type.String(),
		Type.Number(),
		Type.Boolean(),
		Type.Null(),
		Type.Array(Type.Ref("JSONValue")),
		Type.Ref("JsonObject"),
	]),
	JsonObject: Type.Record(
		Type.String(),
		Type.Union([Type.Ref("JSONValue"), Type.Undefined()]),
	),
});

/**
 * Recursive JSON value schema.
 */
const JsonValueSchema = JSON_MODULE.JSONValue;

/**
 * Recursive JSON object schema.
 */
const JsonObjectSchema = JSON_MODULE.JsonObject;

/**
 * Schema for a patch path: array of segments or a JSON Pointer string.
 */
const PatchPathSchema = Type.Union([Type.Array(Type.String()), Type.String()]);

/**
 * Schema for a reference filter.
 */
const ReferenceFilterSchema = JsonObjectSchema;

/**
 * Base fields shared by all patch operations
 */
const BASE_PATCH_FIELDS = {
	path: Type.Optional(PatchPathSchema),
	key: Type.Optional(Type.String()),
};

/**
 * All patch schemas keyed by operation name for discriminated union validation
 */
export const PatchSchemas = {
	insert: Type.Object({
		...BASE_PATCH_FIELDS,
		op: Type.Literal("insert"),
		value: JsonValueSchema,
	}),
	push: Type.Object({
		...BASE_PATCH_FIELDS,
		op: Type.Literal("push"),
		value: JsonValueSchema,
	}),
	append: Type.Object({
		...BASE_PATCH_FIELDS,
		op: Type.Literal("append"),
		value: JsonValueSchema,
	}),
	drop: Type.Object({
		...BASE_PATCH_FIELDS,
		op: Type.Literal("drop"),
		value: Type.Optional(JsonValueSchema),
		filter: Type.Optional(Type.Array(ReferenceFilterSchema)),
	}),
	add: Type.Object({
		...BASE_PATCH_FIELDS,
		op: Type.Literal("add"),
		value: Type.Number(),
	}),
	subtract: Type.Object({
		...BASE_PATCH_FIELDS,
		op: Type.Literal("subtract"),
		value: Type.Number(),
	}),
	multiply: Type.Object({
		...BASE_PATCH_FIELDS,
		op: Type.Literal("multiply"),
		value: Type.Number(),
	}),
	divide: Type.Object({
		...BASE_PATCH_FIELDS,
		op: Type.Literal("divide"),
		value: Type.Number(),
	}),
	merge: Type.Object({
		...BASE_PATCH_FIELDS,
		op: Type.Literal("merge"),
		value: JsonObjectSchema,
	}),
	replace: Type.Object({
		...BASE_PATCH_FIELDS,
		op: Type.Literal("replace"),
		value: JsonValueSchema,
	}),
	remove: Type.Object({
		...BASE_PATCH_FIELDS,
		op: Type.Literal("remove"),
	}),
	test: Type.Object({
		...BASE_PATCH_FIELDS,
		op: Type.Literal("test"),
		value: JsonValueSchema,
	}),
	move: Type.Object({
		...BASE_PATCH_FIELDS,
		op: Type.Literal("move"),
		from: PatchPathSchema,
	}),
	copy: Type.Object({
		...BASE_PATCH_FIELDS,
		op: Type.Literal("copy"),
		from: PatchPathSchema,
	}),
} as const;

/**
 * Narrows a JSONValue to Patch via a structural type guard.
 * Checks basic structure only, use assertPatch for full validation.
 *
 * @param value The JSON value to test.
 *
 * @returns true if the value has the basic shape of a patch operation, false otherwise.
 */
export function isPatch(value: JSONValue): value is Patch {
	return isObject(value) && "op" in value && typeof value.op === "string";
}
