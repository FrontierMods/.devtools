/**
 * @file functions engine: validation + recursive argument substitution.
 */

import { assertSchema, type TransformContext } from "@frmds/autodoc";
import { deepWalk, entries, type JSONValue } from "@frmds/frontier";
import {
	FunctionInvocationSchema,
	isArgumentReference,
	type FunctionInvocation,
	type FunctionObject,
	type JSONPrimitiveType,
} from "./schema.ts";

/**
 * Returns the JSON type of a value.
 *
 * @param value {@link JSONValue} to get the type of.
 *
 * @returns The type of {@link value}.
 */
function getJSONType(value: JSONValue): JSONPrimitiveType {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	if (typeof value === "object") return "object";

	const primitiveType = typeof value;

	if (
		primitiveType === "string" ||
		primitiveType === "number" ||
		primitiveType === "boolean"
	)
		return primitiveType;

	// * defensive check to make sure the returns are typed correctly
	// * this cannot happen with a valid JSON file
	throw new Error(
		`getJSONType(): Unexpected value type: \`${primitiveType}\``,
	);
}

/**
 * Validates that a function definition is well-formed.
 *
 * @param fn The function object to validate.
 * @param context Transformer context. Supplied by the transformer itself.
 */
export function validateFunctionDefinition(
	fn: FunctionObject,
	context: TransformContext,
): void {
	fn.args.forEach(([name], index) => {
		if (!name?.trim())
			throw new Error(
				`Functions: invalid function definition: empty argument name\n` +
					`  function: ${fn.id}\n` +
					`  at: ${context.modId}:${context.sourcePath}`,
			);

		if (fn.args.some(([nayme], jndex) => jndex !== index && nayme === name))
			throw new Error(
				`Functions: invalid function definition: duplicate argument name\n` +
					`  function: ${fn.id}\n` +
					`  argument: ${name}\n` +
					`  at: ${context.modId}:${context.sourcePath}`,
			);
	});

	deepWalk(fn.returns, (_path, value) => {
		if (
			isArgumentReference(value) &&
			!fn.args.some(([name]) => name === value.arg)
		)
			throw new Error(
				`Functions: invalid function definition: unknown argument\n` +
					`  function: ${fn.id}\n` +
					`  argument: ${value.arg}\n` +
					`  declared args: ${fn.args.map(([arg]) => arg).join(", ")}\n` +
					`  at: ${context.modId}:${context.sourcePath}`,
			);
	});
}

/**
 * Validates argument count for the given function call instance.
 *
 * @param invocation Function call to validate.
 * @param fn Function object to check against.
 * @param context Transformer context. Supplied by the transformer itself.
 */
export function validateArgumentCount(
	invocation: FunctionInvocation,
	fn: FunctionObject,
	context: TransformContext,
): void {
	assertSchema(
		FunctionInvocationSchema,
		invocation,
		`Invalid function invocation structure for ${invocation.fn}`,
	);

	if (invocation.args.length !== fn.args.length)
		throw new Error(
			`Functions: argument count mismatch in function call\n` +
				`  function: ${invocation.fn}\n` +
				`  expected: ${fn.args.length} arguments\n` +
				`  got: ${invocation.args.length} arguments\n` +
				`  at: ${context.modId}:${context.sourcePath} (object: ${context.currentObject.id})`,
		);
}

/**
 * Validates argument types for the given function call instance.
 *
 * @param invocation Function call to validate.
 * @param fnDef Function object to check against.
 * @param context Transformer context. Supplied by the transformer itself.
 */
export function validateArgumentTypes(
	invocation: FunctionInvocation,
	fnDef: FunctionObject,
	context: TransformContext,
): void {
	for (let index = 0; index < invocation.args.length; index++) {
		const [argName, expectedType] = fnDef.args[index]!;
		const actualValue = invocation.args[index]!;
		const actualType = getJSONType(actualValue);

		if (actualType !== expectedType)
			throw new Error(
				`Functions: type mismatch in function call\n` +
					`  function: \`${invocation.fn}\`\n` +
					`  argument: \`${argName}\` (position ${index})\n` +
					`  expected: \`${expectedType}\`\n` +
					`  got: \`${actualType}\` (\`${JSON.stringify(actualValue)}\`)\n` +
					`  at: ${context.modId}:${context.sourcePath} (object: \`${context.currentObject.id}\`)`,
			);
	}
}

/**
 * Creates argument bindings from invocation arguments and function definition.
 *
 * @param args
 * @param definitions
 * @returns
 */
export function createBindings(
	// TODO: derive `args` type from schema
	args: JSONValue[],
	definitions: [string, JSONPrimitiveType][],
): Record<string, JSONValue> {
	return Object.fromEntries(
		definitions.map(([name], index) => [name, args[index]!]),
	);
}

/**
 * Recursively substitutes argument references with bound values.
 */
export function substitute(
	value: JSONValue,
	bindings: Record<string, JSONValue>,
): JSONValue {
	if (value === null || typeof value !== "object") return value;

	if (isArgumentReference(value)) {
		const bound = bindings[value.arg];

		if (bound === undefined)
			throw new Error(`substitute(): unbound argument \`${value.arg}\``);

		return bound;
	}

	if (Array.isArray(value))
		return value.map((item) => substitute(item, bindings));

	const result: Record<string, JSONValue> = {};

	for (const [key, val] of entries(value)) {
		if (val !== undefined) result[key] = substitute(val, bindings);
	}

	return result;
}
