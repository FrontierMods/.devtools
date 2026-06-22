/**
 * @file functions engine: validation + recursive argument substitution.
 */

import { assertSchema, type TransformContext } from "@frmds/autodoc";
import { deepWalk, entries, type JSONValue } from "@frmds/frontier";
import { FunctionInvocationSchema, type JSONPrimitiveType } from "./schema.ts";
import {
	type FunctionInvocation,
	type FunctionObject,
	isArgumentReference,
} from "./types.ts";

/**
 * Gets the JSON type of a value for validation.
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
	throw new Error(`Unexpected value type: ${primitiveType}`);
}

/**
 * Validates that a function definition is well-formed.
 * Scans returns template for `{arg: ...}` references and ensures all exist in declared args.
 */
export function validateFunctionDefinition(
	fnDef: FunctionObject,
	context: TransformContext,
): void {
	fnDef.args.forEach(([name], index) => {
		if (!name?.trim())
			throw new Error(
				`Functions: invalid function definition: empty argument name\n` +
					`  function: ${fnDef.id}\n` +
					`  at: ${context.modId}:${context.sourcePath}`,
			);

		if (
			fnDef.args.some(
				([nayme], jndex) => jndex !== index && nayme === name,
			)
		)
			throw new Error(
				`Functions: invalid function definition: duplicate argument name\n` +
					`  function: ${fnDef.id}\n` +
					`  argument: ${name}\n` +
					`  at: ${context.modId}:${context.sourcePath}`,
			);
	});

	deepWalk(fnDef.returns, (_path, value) => {
		if (
			isArgumentReference(value) &&
			!fnDef.args.some(([name]) => name === value.arg)
		)
			throw new Error(
				`Functions: invalid function definition: unknown argument\n` +
					`  function: ${fnDef.id}\n` +
					`  argument: ${value.arg}\n` +
					`  declared args: ${fnDef.args.map(([arg]) => arg).join(", ")}\n` +
					`  at: ${context.modId}:${context.sourcePath}`,
			);
	});
}

/**
 * Validates argument count matches expected.
 */
export function validateArgumentCount(
	invocation: FunctionInvocation,
	fnDef: FunctionObject,
	context: TransformContext,
): void {
	assertSchema(
		FunctionInvocationSchema,
		invocation,
		`Invalid function invocation structure for ${invocation.fn}`,
	);

	if (invocation.args.length !== fnDef.args.length)
		throw new Error(
			`Functions: argument count mismatch in function call\n` +
				`  function: ${invocation.fn}\n` +
				`  expected: ${fnDef.args.length} arguments\n` +
				`  got: ${invocation.args.length} arguments\n` +
				`  at: ${context.modId}:${context.sourcePath} (object: ${context.currentObject.id})`,
		);
}

/**
 * Validates argument types match expected.
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
					`  function: ${invocation.fn}\n` +
					`  argument: ${argName} (position ${index})\n` +
					`  expected: ${expectedType}\n` +
					`  got: ${actualType} (${JSON.stringify(actualValue)})\n` +
					`  at: ${context.modId}:${context.sourcePath} (object: ${context.currentObject.id})`,
			);
	}
}

/**
 * Creates argument bindings from invocation args and function definition.
 */
export function createBindings(
	args: JSONValue[],
	definitions: [string, JSONPrimitiveType][],
): Record<string, JSONValue> {
	return Object.fromEntries(
		definitions.map(([name], index) => [name, args[index]!]),
	);
}

/**
 * Recursively substitutes {arg: ...} references with bound values.
 */
export function substitute(
	value: JSONValue,
	bindings: Record<string, JSONValue>,
): JSONValue {
	if (value === null || typeof value !== "object") return value;

	if (isArgumentReference(value)) {
		const bound = bindings[value.arg];

		if (bound === undefined)
			throw new Error(`substitute(): unbound argument '${value.arg}'`);

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
