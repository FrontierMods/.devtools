/**
 * @file Schemata and derived types for the functions transformer.
 */

import { Type, type Static } from "typebox";
import Schema from "typebox/schema";

/**
 * Primitive JSON type a function argument may declare.
 */
export type JSONPrimitiveType = Static<typeof JsonPrimitiveTypeSchema>;

/**
 * Reference to a named function argument: `{ arg: "<argument_name>" }`.
 */
export type ArgumentReference = Static<typeof ArgumentReferenceSchema>;

/**
 * Function argument declaration: `[name, type]`.
 */
export type FunctionArgument = Static<typeof FunctionArgumentSchema>;

/**
 * Function definition object as authored in source.
 */
export type FunctionObject = Static<typeof FunctionObjectSchema>;

/**
 * Function call site: `{ fn: "<function_id>", args: [...] }`.
 */
export type FunctionInvocation = Static<typeof FunctionInvocationSchema>;

/**
 * Argument reference: `{ arg: "<argument_name>" }`.
 */
const ArgumentReferenceSchema = Type.Object({
	arg: Type.String({ minLength: 1 }),
});

/**
 * Compiled schema validator for {@link ArgumentReferenceSchema}.
 */
const ARGUMENT_REFERENCE_VALIDATOR = Schema.Compile(ArgumentReferenceSchema);

/**
 * JSON primitive types that can be used as function argument types.
 */
const JsonPrimitiveTypeSchema = Type.Union([
	Type.Literal("string"),
	Type.Literal("number"),
	Type.Literal("boolean"),
	Type.Literal("null"),
	Type.Literal("array"),
	Type.Literal("object"),
]);

/**
 * JsonValue schema.
 */
const JsonValueSchema = Type.Union(
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
 * Function argument definition: `[name, type]`.
 */
const FunctionArgumentSchema = Type.Tuple([
	Type.String({ minLength: 1 }),
	JsonPrimitiveTypeSchema,
]);

/**
 * Function object definition.
 */
export const FunctionObjectSchema = Type.Object({
	id: Type.String({ minLength: 1 }),
	type: Type.Literal("FUNCTION"),
	args: Type.Array(FunctionArgumentSchema),
	returns: JsonValueSchema,
});

/**
 * Function invocation: `{ fn: "<function_id>", args: [...] }`.
 */
export const FunctionInvocationSchema = Type.Object({
	fn: Type.String({ minLength: 1 }),
	args: Type.Array(JsonValueSchema),
});

/**
 * Checks whether {@link value} is an instance of {@link ArgumentReference}.
 *
 * @param value Value to check.
 *
 * @returns Boolean for whether {@link value} is an instance of {@link ArgumentReference}.
 */
export function isArgumentReference(
	value: unknown,
): value is ArgumentReference {
	return ARGUMENT_REFERENCE_VALIDATOR.Check(value);
}
