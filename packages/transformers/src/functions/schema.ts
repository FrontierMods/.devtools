/**
 * @file TypeBox schemas and derived types for the function system.
 */

import { Type, type Static } from "typebox";

/** Primitive JSON type a function argument may declare. */
export type JSONPrimitiveType = Static<typeof JsonPrimitiveTypeSchema>;

/** Reference to a named function argument: `{ arg: "name" }`. */
export type ArgumentReference = Static<typeof ArgumentReferenceSchema>;

/** Function argument declaration: `[name, type]`. */
export type FunctionArgument = Static<typeof FunctionArgumentSchema>;

/** Function definition object as authored in source. */
export type FunctionObject = Static<typeof FunctionObjectSchema>;

/** Function call site: `{ fn: "id", args: [...] }`. */
export type FunctionInvocation = Static<typeof FunctionInvocationSchema>;

/**
 * JSON primitive types that can be used as function argument types
 */
export const JsonPrimitiveTypeSchema = Type.Union([
	Type.Literal("string"),
	Type.Literal("number"),
	Type.Literal("boolean"),
	Type.Literal("null"),
	Type.Literal("array"),
	Type.Literal("object"),
]);

/**
 * JsonValue schema - recursive structure for JSON data
 */
export const JsonValueSchema = Type.Union(
	[
		Type.String(),
		Type.Number(),
		Type.Boolean(),
		Type.Null(),
		Type.Array(Type.This()),
		Type.Record(Type.String(), Type.This()),
	],
	// * this JSON Schema trick is necessary to allow the type to recurse into itself along with `.This()`
	{ $id: "JsonValue" },
);

/**
 * Argument reference: `{ arg: "argumentName" }`
 */
export const ArgumentReferenceSchema = Type.Object({
	arg: Type.String({ minLength: 1 }),
});

/**
 * Function argument definition: `[name, type]`
 */
export const FunctionArgumentSchema = Type.Tuple([
	Type.String({ minLength: 1 }),
	JsonPrimitiveTypeSchema,
]);

/**
 * Function object definition
 */
export const FunctionObjectSchema = Type.Object({
	type: Type.Literal("FUNCTION"),
	id: Type.String({ minLength: 1 }),
	args: Type.Array(FunctionArgumentSchema),
	returns: JsonValueSchema,
});

/**
 * Function invocation: `{ fn: "functionId", args: [...] }`
 */
export const FunctionInvocationSchema = Type.Object({
	fn: Type.String({ minLength: 1 }),
	args: Type.Array(JsonValueSchema),
});
